import { create } from '../dom.js';

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function terminalTheme() {
  return {
    background: cssVar('--terminal-bg', 'black'),
    foreground: cssVar('--terminal-fg', 'white'),
    cursor: cssVar('--terminal-cursor', 'yellow'),
    selectionBackground: cssVar('--terminal-selection', 'yellow'),
    black: cssVar('--terminal-black', 'black'),
    red: cssVar('--terminal-red', 'red'),
    green: cssVar('--terminal-green', 'green'),
    yellow: cssVar('--terminal-yellow', 'yellow'),
    blue: cssVar('--terminal-blue', 'blue'),
    magenta: cssVar('--terminal-magenta', 'magenta'),
    cyan: cssVar('--terminal-cyan', 'cyan'),
    white: cssVar('--terminal-white', 'white'),
    brightBlack: cssVar('--terminal-bright-black', 'gray'),
    brightRed: cssVar('--terminal-bright-red', 'salmon'),
    brightGreen: cssVar('--terminal-bright-green', 'lightgreen'),
    brightYellow: cssVar('--terminal-bright-yellow', 'yellow'),
    brightBlue: cssVar('--terminal-bright-blue', 'lightskyblue'),
    brightMagenta: cssVar('--terminal-bright-magenta', 'plum'),
    brightCyan: cssVar('--terminal-bright-cyan', 'paleturquoise'),
    brightWhite: cssVar('--terminal-bright-white', 'white'),
  };
}

export function createTerminal({ onStatus } = {}) {
  let term = null;
  let fit = null;
  let socket = null;
  let observer = null;
  let host = null;
  let opened = false;

  function writeFallback(message) {
    if (host) host.replaceChildren(create('div', 'terminal-fallback', message));
  }

  function dispose() {
    if (observer) observer.disconnect();
    observer = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // 忽略
      }
      socket = null;
    }
    if (term) {
      try {
        term.dispose();
      } catch {
        // 忽略
      }
      term = null;
    }
    fit = null;
    if (host) host.replaceChildren();
    opened = false;
  }

  function connect() {
    if (!term) return;
    try {
      socket = new WebSocket(`ws://${location.host}/terminal`);
    } catch {
      term.write('\r\n无法连接终端服务。\r\n');
      return;
    }
    socket.addEventListener('open', () => {
      sendResize();
      term?.focus();
    });
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'output') term?.write(message.data);
      else if (message.type === 'error') term?.write(`\r\n${message.message}\r\n`);
      else if (message.type === 'exit') term?.write(`\r\n[进程已退出，code ${message.code}]\r\n`);
      else if (message.type === 'ready') {
        onStatus?.();
        term?.write(`\x1b[2mBananaGUI 终端 · ${message.shell} · ${message.cwd}\x1b[0m\r\n`);
      }
    });
    socket.addEventListener('close', () => {
      if (term) term.write('\r\n[终端连接已断开]\r\n');
    });
  }

  function sendResize() {
    if (!term || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }

  function open(target) {
    if (!target) return;
    if (opened && host === target) {
      term?.focus();
      return;
    }
    dispose();
    host = target;
    opened = true;
    host.replaceChildren();
    if (!window.Terminal) {
      writeFallback('终端资源未加载。构建后 /vendor/xterm.js 应可用。');
      return;
    }
    term = new window.Terminal({
      fontFamily: cssVar('--font-mono', 'Consolas, monospace'),
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(),
      allowProposedApi: true,
    });
    const FitCtor = window.FitAddon?.FitAddon;
    fit = FitCtor ? new FitCtor() : null;
    if (fit) term.loadAddon(fit);
    term.open(host);
    fit?.fit();
    term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
    });
    term.onResize(() => sendResize());
    connect();
    observer = new ResizeObserver(() => {
      try {
        fit?.fit();
      } catch {
        // 忽略
      }
    });
    observer.observe(host);
    window.setTimeout(() => {
      fit?.fit();
      term?.focus();
    }, 60);
  }

  function restart() {
    if (!host) return;
    const currentHost = host;
    dispose();
    open(currentHost);
  }

  function toggle() {
    if (opened) {
      dispose();
      return false;
    }
    return true;
  }

  window.addEventListener('banana-theme', () => {
    if (!term) return;
    try {
      term.options.theme = terminalTheme();
    } catch {
      // 忽略
    }
  });

  return { open, close: dispose, restart, toggle, isOpen: () => opened };
}
