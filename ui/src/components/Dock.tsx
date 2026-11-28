import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon';
import type { AppState, DockTab } from '../state/app';
import { api } from '../lib/api';
import { formatBytes, formatCount, formatDuration, shortPath } from '../lib/format';

function TerminalDock(props: { shell: string }) {
  let host: HTMLDivElement | undefined;
  let socket: WebSocket | null = null;

  onMount(() => {
    const Terminal = window.Terminal;
    if (!host || !Terminal) {
      if (host) host.textContent = '终端不可用：xterm 资源未加载。';
      return;
    }
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', Consolas, monospace",
      lineHeight: 1.35,
      scrollback: 4000,
      theme: {
        background: '#101010', // ui-allow: token-color-only
        foreground: '#e9e9e3', // ui-allow: token-color-only
        cursor: '#f5c518', // ui-allow: token-color-only
        selectionBackground: 'rgba(245,197,24,0.25)', // ui-allow: token-color-only
        black: '#1b1b19', // ui-allow: token-color-only
        red: '#ef8074', // ui-allow: token-color-only
        green: '#6bc191', // ui-allow: token-color-only
        yellow: '#e0b05a', // ui-allow: token-color-only
        blue: '#7d9bff', // ui-allow: token-color-only
        magenta: '#c79bff', // ui-allow: token-color-only
        cyan: '#6fd3d3', // ui-allow: token-color-only
        white: '#e9e9e3', // ui-allow: token-color-only
      },
    });
    term.open(host);
    try {
      let cellW = 0;
      let cellH = 0;
      const refit = () => {
        try {
          const screen = host!.querySelector('.xterm-screen');
          if (screen && term.cols > 0 && term.rows > 0) {
            cellW = screen.clientWidth / term.cols;
            cellH = screen.clientHeight / term.rows;
          }
          if (!cellW || !cellH) {
            const measure = host!.querySelector('.xterm-char-measure-element');
            const rect = measure?.getBoundingClientRect();
            cellW = rect && rect.width > 0 ? rect.width / 32 : 7.8;
            cellH = rect && rect.height > 0 ? rect.height : 17;
          }
          const cols = Math.max(20, Math.floor((host!.clientWidth - 12) / cellW));
          const rows = Math.max(5, Math.floor((host!.clientHeight - 12) / cellH));
          term.resize(cols, rows);
        } catch {
          /* ignore */
        }
      };
      refit();
      requestAnimationFrame(refit);
      window.setTimeout(refit, 200);
      const observer = new ResizeObserver(() => refit());
      observer.observe(host);
      if (host.parentElement) observer.observe(host.parentElement);
      window.addEventListener('resize', refit);
      onCleanup(() => {
        observer.disconnect();
        window.removeEventListener('resize', refit);
      });
    } catch {
      /* ignore */
    }

    socket = new WebSocket(`ws://${location.host}/terminal?shell=${encodeURIComponent(props.shell)}`);
    socket.addEventListener('open', () => {
      if (!document.querySelector('.overlay')) term.focus?.();
    });
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data)) as { type?: string; data?: string; message?: string; code?: number };
        if (data.type === 'output' && typeof data.data === 'string') term.write(data.data);
        else if (data.type === 'error' && data.message) term.write(`\r\n\x1b[31m${data.message}\x1b[0m\r\n`);
        else if (data.type === 'notice' && data.message) term.write(`\r\n\x1b[33m${data.message}\x1b[0m\r\n`);
        else if (data.type === 'exit') term.write(`\r\n\x1b[2m[进程结束 ${data.code ?? 0}]\x1b[0m\r\n`);
      } catch {
        /* ignore */
      }
    });
    term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
    });

    onCleanup(() => {
      socket?.close();
      term.dispose();
    });
  });

  return <div class="terminal-host" ref={host} />;
}

function FileNode(props: { app: AppState; item: { name: string; path: string; type: 'dir' | 'file'; size?: number } }) {
  const [open, setOpen] = createSignal(false);
  const [children, setChildren] = createSignal<Array<{ name: string; path: string; type: 'dir' | 'file'; size?: number }>>([]);
  const [loading, setLoading] = createSignal(false);

  async function toggle() {
    if (props.item.type !== 'dir') {
      void props.app.openFile(props.item.path);
      return;
    }
    const next = !open();
    setOpen(next);
    if (next && !children().length) {
      setLoading(true);
      try {
        const data = await api.tree(props.item.path);
        setChildren(data.items ?? []);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        class={`tree-row${props.app.state.filePreview?.path === props.item.path ? ' active' : ''}`}
        title={props.item.path}
        onClick={() => void toggle()}
      >
        <Icon name={props.item.type === 'dir' ? (open() ? 'folderOpen' : 'folder') : 'file'} />
        <span class="name">{props.item.name}</span>
        <Show when={props.item.type === 'file' && props.item.size !== undefined}>
          <span class="size">{formatBytes(props.item.size)}</span>
        </Show>
        <Show when={props.item.type === 'dir'}>
          <Icon name={open() ? 'chevron' : 'chevronRight'} />
        </Show>
      </button>
      <Show when={open()}>
        <div class="tree-children">
          <Show when={loading()}>
            <div class="empty-dock">加载中…</div>
          </Show>
          <For each={children()}>{(child) => <FileNode app={props.app} item={child} />}</For>
        </div>
      </Show>
    </>
  );
}

function BrowserDock() {
  let frame: HTMLIFrameElement | undefined;
  let webhost: HTMLDivElement | undefined;
  let webview: HTMLElement & { src?: string; reload?: () => void } | undefined;
  const isElectron = /Electron/i.test(navigator.userAgent);
  const saved = (() => {
    try {
      return localStorage.getItem('banana-browser-url') ?? 'http://localhost:3000';
    } catch {
      return 'http://localhost:3000';
    }
  })();
  const [input, setInput] = createSignal(saved);
  const [url, setUrl] = createSignal(saved);
  const [entries, setEntries] = createSignal<string[]>([saved]);
  const [index, setIndex] = createSignal(0);
  const [compat, setCompat] = createSignal(
    (() => {
      try {
        return localStorage.getItem('banana-browser-compat') !== '0';
      } catch {
        return true;
      }
    })(),
  );
  const [light, setLight] = createSignal(
    (() => {
      try {
        return localStorage.getItem('banana-browser-light') !== '0';
      } catch {
        return true;
      }
    })(),
  );

  const proxySrc = (target: string) =>
    `/api/browser?light=${light() ? '1' : '0'}&url=${encodeURIComponent(target)}`;

  const frameSrc = () => (compat() ? proxySrc(url()) : url());

  const setLightMode = (value: boolean) => {
    setLight(value);
    try {
      localStorage.setItem('banana-browser-light', value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const setCompatMode = (value: boolean) => {
    setCompat(value);
    try {
      localStorage.setItem('banana-browser-compat', value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const remember = (next: string) => {
    setInput(next);
    setUrl(next);
    try {
      localStorage.setItem('banana-browser-url', next);
    } catch {
      /* ignore */
    }
    const list = [...entries().slice(0, index() + 1), next];
    setEntries(list);
    setIndex(list.length - 1);
  };

  const applyUrl = (next: string, push: boolean) => {
    if (push) remember(next);
    else {
      setInput(next);
      setUrl(next);
    }
    if (webview) {
      if (webview.getAttribute('src') !== next) webview.setAttribute('src', next);
      return;
    }
    if (frame) frame.src = compat() ? proxySrc(next) : next;
  };

  const go = () => {
    let next = input().trim();
    if (!next) return;
    if (!/^[a-z]+:\/\//i.test(next)) next = `http://${next}`;
    applyUrl(next, true);
  };

  const back = () => {
    if (index() <= 0) return;
    const next = entries()[index() - 1]!;
    setIndex(index() - 1);
    applyUrl(next, false);
  };

  const forward = () => {
    if (index() >= entries().length - 1) return;
    const next = entries()[index() + 1]!;
    setIndex(index() + 1);
    applyUrl(next, false);
  };

  onMount(() => {
    if (isElectron && webhost) {
      const view = document.createElement('webview') as unknown as HTMLElement & {
        src: string;
        reload: () => void;
      };
      view.setAttribute('src', url());
      view.setAttribute('allowpopups', '');
      view.className = 'browser-frame';
      webhost.appendChild(view);
      webview = view;
      const onNavigate = (event: Event) => {
        const detail = event as unknown as { url?: string };
        if (detail.url && /^https?:/i.test(detail.url)) remember(detail.url);
      };
      view.addEventListener('did-navigate', onNavigate);
      view.addEventListener('did-navigate-in-page', onNavigate);
      onCleanup(() => {
        view.removeEventListener('did-navigate', onNavigate);
        view.removeEventListener('did-navigate-in-page', onNavigate);
        view.remove();
        webview = undefined;
      });
    }
    const onMessage = (event: MessageEvent) => {
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== 'banana-browser-nav' || typeof data.url !== 'string') return;
      if (!/^https?:/i.test(data.url)) return;
      if (data.url === url()) return;
      const next = data.url;
      setInput(next);
      setUrl(next);
      try {
        localStorage.setItem('banana-browser-url', next);
      } catch {
        /* ignore */
      }
      const list = [...entries().slice(0, index() + 1), next];
      setEntries(list);
      setIndex(list.length - 1);
    };
    window.addEventListener('message', onMessage);
    onCleanup(() => window.removeEventListener('message', onMessage));
  });

  const reload = () => {
    if (webview) {
      webview.reload?.();
      return;
    }
    if (!frame) return;
    frame.src = frameSrc();
  };

  return (
    <div class="browser-dock">
      <div class="browser-bar">
        <button
          type="button"
          class="browser-btn"
          title="后退"
          aria-label="后退"
          disabled={index() <= 0}
          onClick={back}
        >
          <Icon name="chevronLeft" />
        </button>
        <button
          type="button"
          class="browser-btn"
          title="前进"
          aria-label="前进"
          disabled={index() >= entries().length - 1}
          onClick={forward}
        >
          <Icon name="chevronRight" />
        </button>
        <button type="button" class="browser-btn" title="刷新" aria-label="刷新" onClick={reload}>
          <Icon name="refresh" />
        </button>
        <input
          class="browser-url"
          value={input()}
          spellcheck={false}
          onInput={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              go();
            }
          }}
        />
        <button type="button" class="browser-btn" title="打开" onClick={go}>
          打开
        </button>
        <Show when={!isElectron}>
          <label class="browser-toggle" title="兼容模式：通过本地服务代理，绕过禁止嵌入的限制">
            <input
              type="checkbox"
              checked={compat()}
              onChange={(event) => {
                setCompatMode(event.currentTarget.checked);
                reload();
              }}
            />
            兼容
          </label>
          <label class="browser-toggle" title="轻量模式：禁用网页脚本和广告 iframe，访问更流畅">
            <input
              type="checkbox"
              checked={light()}
              onChange={(event) => {
                setLightMode(event.currentTarget.checked);
                reload();
              }}
            />
            轻量
          </label>
        </Show>
        <button
          type="button"
          class="browser-btn"
          title="在外部浏览器打开"
          aria-label="在外部浏览器打开"
          onClick={() => window.open(url(), '_blank', 'noopener')}
        >
          <Icon name="external" />
        </button>
      </div>
      <Show
        when={isElectron}
        fallback={
          <iframe
            ref={frame}
            class="browser-frame"
            title="内置浏览器"
            src={frameSrc()}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
          />
        }
      >
        <div class="browser-frame browser-webview" ref={webhost} />
      </Show>
      <div class="browser-hint">
        {isElectron
          ? '桌面模式使用原生网页视图，支持视频、登录和完整脚本。'
          : '网页模式受浏览器安全限制；视频站点建议在桌面版或系统浏览器打开。'}
      </div>
    </div>
  );
}

function mediaKind(path: string): 'video' | 'audio' | 'image' | null {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'oga'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  return null;
}

function FilesDock(props: { app: AppState }) {
  const { state, t } = props.app;
  onMount(() => void props.app.loadFiles());
  return (
    <div class="files-dock">
      <div class="tree">
        <Show when={state.fileItems.length} fallback={<div class="empty-dock">目录为空</div>}>
          <For each={state.fileItems}>{(item) => <FileNode app={props.app} item={item} />}</For>
        </Show>
      </div>
      <Show when={state.filePreview}>
        {(file) => (
          <div class="file-preview">
            <div class="file-preview-head">
              <Icon name="file" />
              <span>{shortPath(file().path, 3)}</span>
              <span class="spacer" />
              <span>{formatBytes(file().bytes)}</span>
              <button class="icon-btn sm" type="button" aria-label={t().close} onClick={() => props.app.setState('filePreview', null)}>
                <Icon name="close" />
              </button>
            </div>
            <Show
              when={mediaKind(file().path)}
              fallback={
                <Show
                  when={!file().binary}
                  fallback={<div class="empty-dock">{t().binaryFile}</div>}
                >
                  <pre>{file().content}</pre>
                  <Show when={file().truncated}>
                    <div class="empty-dock">{t().truncated}</div>
                  </Show>
                </Show>
              }
            >
              {(kind) => {
                const src = `/api/file/raw?path=${encodeURIComponent(file().path)}`;
                return kind() === 'video' ? (
                  <video class="file-media" controls src={src} />
                ) : kind() === 'audio' ? (
                  <audio class="file-audio" controls src={src} />
                ) : (
                  <img class="file-media" src={src} alt={file().path} />
                );
              }}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

function TasksDock(props: { app: AppState }) {
  const { state, t } = props.app;
  const todos = () => state.session?.todos ?? [];
  return (
    <div class="dock-list">
      <Show when={state.session?.plan?.status === 'approved'}>
        <div class="info-block">
          <h3>{t().plan}</h3>
          <div class="info-kv">
            <span class="k">当前阶段</span>
            <span class="v">{state.session?.plan?.currentPhase ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
            <button class="btn sm" type="button" onClick={() => void props.app.switchPhase('next')}>
              下一阶段
            </button>
          </div>
        </div>
      </Show>
      <Show when={todos().length} fallback={<div class="empty-dock">{t().noTodos}</div>}>
        <For each={todos()}>
          {(todo) => (
            <div class={`todo${todo.status === 'done' ? ' done' : ''}`}>
              <span class="mark">
                <Icon name="check" size={10} />
              </span>
              <span class="text">{todo.text}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function VerifyDock(props: { app: AppState }) {
  const { state, t } = props.app;
  const results = () => state.session?.verification?.results ?? [];
  const completed = () => (state.session?.todos ?? []).filter((todo) => todo.status === 'done').length;
  const total = () => (state.session?.todos ?? []).length;
  return (
    <div class="dock-list">
      <div class="info-block">
        <h3>{t().verify}</h3>
        <div class="info-kv">
          <span class="k">{t().tasks}</span>
          <span class="v">
            {completed()} / {total()}
          </span>
        </div>
        <div class="info-kv">
          <span class="k">最近</span>
          <span class="v">
            {state.session?.verification?.at ? new Date(state.session.verification.at).toLocaleString() : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
          <button class="btn sm primary" type="button" disabled={state.verifying} onClick={() => void props.app.runVerify()}>
            {state.verifying ? '运行中…' : t().runVerify}
          </button>
        </div>
      </div>
      <Show when={results().length} fallback={<div class="empty-dock">{t().noVerify}</div>}>
        <For each={results()}>
          {(result) => (
            <div class="verify-row">
              <span class={`tool-dot ${result.ok ? 'ok' : 'fail'}`} />
              <span style={{ flex: '1', 'min-width': 0, overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{result.command}</span>
              <span class="spacer" />
              <span>{formatDuration(result.ms)}</span>
            </div>
          )}
        </For>
      </Show>
      <Show when={state.session?.unknowns?.length}>
        <div class="info-block">
          <h3>{t().unknowns}</h3>
          <For each={state.session!.unknowns!}>{(item) => <div class="info-kv"><span class="v">{item.text}</span></div>}</For>
        </div>
      </Show>
    </div>
  );
}

function InfoDock(props: { app: AppState }) {
  const { state, t } = props.app;
  return (
    <div class="dock-list">
      <div class="info-block">
        <h3>{t().sessionInfo}</h3>
        <div class="info-kv"><span class="k">ID</span><span class="v">{state.session?.id ?? '—'}</span></div>
        <div class="info-kv"><span class="k">{t().workspace}</span><span class="v">{shortPath(state.info?.workspace ?? '—', 3)}</span></div>
        <div class="info-kv"><span class="k">{t().provider}</span><span class="v">{state.info?.currentProvider ?? '—'}</span></div>
        <div class="info-kv"><span class="k">{t().model}</span><span class="v">{state.info?.model ?? '—'}</span></div>
        <div class="info-kv"><span class="k">{t().mode}</span><span class="v">{state.session?.mode ?? 'build'}</span></div>
        <div class="info-kv">
          <span class="k">{t().usage}</span>
          <span class="v">
            ↑{formatCount(state.session?.usage?.inputTokens)} ↓{formatCount(state.session?.usage?.outputTokens)}
            {state.contextTokens ? ` · ctx ${formatCount(state.contextTokens)}` : ''}
          </span>
        </div>
      </div>

      <div class="info-block">
        <h3>{t().facts}</h3>
        <Show when={state.session?.facts?.length} fallback={<span class="hint">—</span>}>
          <For each={state.session!.facts!}>
            {(fact) => <div class="info-kv"><span class="v">{fact.text}</span></div>}
          </For>
        </Show>
      </div>

      <div class="info-block">
        <h3>{t().recentReview}</h3>
        <Show when={state.review} fallback={<span class="hint">—</span>}>
          <div class="md" style={{ 'font-size': 'var(--text-sm)' }} innerHTML={state.review.replace(/</g, '&lt;').replace(/\n/g, '<br/>')} />
        </Show>
      </div>

      <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
        <button class="btn sm" type="button" onClick={() => void props.app.runUndo()}>
          <Icon name="undo" /> {t().undo}
        </button>
        <button class="btn sm" type="button" onClick={() => void props.app.runCompact()}>
          <Icon name="refresh" /> {t().compact}
        </button>
        <button class="btn sm" type="button" disabled={state.reviewing} onClick={() => void props.app.runReview()}>
          <Icon name="shield" /> {state.reviewing ? '审查中…' : t().review}
        </button>
      </div>
    </div>
  );
}

const TABS: Array<{ id: DockTab; key: 'terminal' | 'browser' | 'files' | 'tasks' | 'verify' | 'info' }> = [
  { id: 'terminal', key: 'terminal' },
  { id: 'browser', key: 'browser' },
  { id: 'files', key: 'files' },
  { id: 'tasks', key: 'tasks' },
  { id: 'verify', key: 'verify' },
  { id: 'info', key: 'info' },
];

const SHELLS = [
  { id: 'cmd', label: 'CMD' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'wsl', label: 'WSL' },
  { id: 'bash', label: 'Git Bash' },
];

function readShell(): string {
  try {
    return localStorage.getItem('banana-terminal-shell') ?? 'cmd';
  } catch {
    return 'cmd';
  }
}

export function Dock(props: { app: AppState }) {
  const { state, t } = props.app;
  const [shell, setShell] = createSignal(readShell());

  const changeShell = (value: string) => {
    setShell(value);
    try {
      localStorage.setItem('banana-terminal-shell', value);
    } catch {
      /* ignore */
    }
  };

  function startResize(event: PointerEvent) {
    if (window.innerWidth <= 1180) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.dockWidth;
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(1000, Math.max(400, startWidth - (moveEvent.clientX - startX)));
      props.app.setState('dockWidth', next);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      try {
        localStorage.setItem('banana-dock-width', String(props.app.state.dockWidth));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
  }

  return (
    <>
      <Show when={!state.dockOpen}>
        <button class="dock-rail" type="button" onClick={() => props.app.toggleDock()}>
          {t().terminal}
        </button>
      </Show>
      <aside class="dock" aria-label="右侧面板" aria-hidden={!state.dockOpen}>
        <div class="dock-resizer" onPointerDown={startResize} />
        <div class="dock-head">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                class={`dock-tab${state.dockTab === tab.id ? ' active' : ''}`}
                onClick={() => props.app.setDock(tab.id)}
              >
                {t()[tab.key]}
              </button>
            )}
          </For>
          <span class="spacer" />
          <button class="icon-btn sm" type="button" aria-label="收起" onClick={() => props.app.toggleDock()}>
            <Icon name="close" />
          </button>
        </div>
        <div class="dock-body">
          <Show when={state.dockTab === 'terminal'}>
            <div class="terminal-pane">
              <div class="terminal-bar">
                <select class="select sm" value={shell()} onChange={(event) => changeShell(event.currentTarget.value)}>
                  <For each={SHELLS}>{(item) => <option value={item.id}>{item.label}</option>}</For>
                </select>
                <span class="terminal-hint">行编辑兼容模式</span>
              </div>
              <Show when={shell()} keyed>
                {(value) => <TerminalDock shell={value} />}
              </Show>
            </div>
          </Show>
          <Show when={state.dockTab === 'browser'}>
            <BrowserDock />
          </Show>
          <Show when={state.dockTab === 'files'}>
            <FilesDock app={props.app} />
          </Show>
          <Show when={state.dockTab === 'tasks'}>
            <TasksDock app={props.app} />
          </Show>
          <Show when={state.dockTab === 'verify'}>
            <VerifyDock app={props.app} />
          </Show>
          <Show when={state.dockTab === 'info'}>
            <InfoDock app={props.app} />
          </Show>
        </div>
      </aside>
    </>
  );
}
