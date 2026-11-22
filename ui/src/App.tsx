import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { api, connect, type Info, type Session, type SessionMessage, type SessionSummary, type WsEvent } from './api';

declare global {
  interface Window {
    Terminal?: any;
    FitAddon?: any;
  }
}

type DockTab = 'terminal' | 'files' | 'tasks' | 'verify';

function Icon(props: { name: string }) {
  const paths: Record<string, string> = {
    leaf: '<path d="M5 14c1-6 6-10 14-10 0 8-4 13-10 13"/><path d="M5 21c3-6 7-9 12-11"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    shield: '<path d="M12 3.5l7 2.5V12c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6z"/>',
    folder: '<path d="M4 6.5h5.5L12 9h8v10.5H4z"/>',
    terminal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l2.5 2L7 14M12.5 14.5H16"/>',
    sliders: '<path d="M4 8h8M16 8h4M4 16h4M12 16h8"/><circle cx="14" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  };
  return <svg viewBox="0 0 24 24" innerHTML={paths[props.name] ?? paths.leaf} />;
}

function TerminalDock() {
  let host!: HTMLDivElement;
  onMount(() => {
    if (!window.Terminal) {
      host.textContent = '终端资源未加载';
      return;
    }
    const term = new window.Terminal({
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#161616',
        foreground: '#e8e3d7',
        cursor: '#ffc400',
        selectionBackground: 'rgba(255,196,0,.28)',
      },
    });
    const fit = window.FitAddon ? new window.FitAddon.FitAddon() : null;
    if (fit) term.loadAddon(fit);
    term.open(host);
    fit?.fit();
    const socket = new WebSocket(`ws://${location.host}/terminal`);
    socket.addEventListener('open', () => {
      const size = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };
      size();
      term.onResize(size);
      term.focus();
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'output') term.write(message.data);
        else if (message.type === 'error') term.write(`\r\n${message.message}\r\n`);
        else if (message.type === 'ready') term.write(`\x1b[2m${message.shell} · ${message.cwd}\x1b[0m\r\n`);
      } catch {
        /* ignore */
      }
    });
    term.onData((data: string) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
    });
    const observer = new ResizeObserver(() => fit?.fit());
    observer.observe(host);
    onCleanup(() => {
      observer.disconnect();
      socket.close();
      term.dispose();
    });
  });
  return <div class="terminal-host" ref={host} />;
}

export default function App() {
  const [info, setInfo] = createSignal<Info | null>(null);
  const [sessions, setSessions] = createSignal<SessionSummary[]>([]);
  const [session, setSession] = createSignal<Session | null>(null);
  const [messages, setMessages] = createSignal<SessionMessage[]>([]);
  const [running, setRunning] = createSignal(false);
  const [online, setOnline] = createSignal(false);
  const [status, setStatus] = createSignal('本地');
  const [query, setQuery] = createSignal('');
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const [dockTab, setDockTab] = createSignal<DockTab>('terminal');
  const [dockOpen, setDockOpen] = createSignal(localStorage.getItem('banana-dock') !== '0');
  const [theme, setTheme] = createSignal(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [files, setFiles] = createSignal<Array<{ name: string; type: string }>>([]);
  const [approval, setApproval] = createSignal<{ id: string; summary?: string } | null>(null);
  let input!: HTMLTextAreaElement;
  let socket: ReturnType<typeof connect> | null = null;

  const groups = createMemo(() => {
    const q = query().trim().toLowerCase();
    const map = new Map<string, SessionSummary[]>();
    for (const item of sessions()) {
      const ws = item.workspace || info()?.workspace || '';
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws)!.push(item);
    }
    if (info()?.workspace && !map.has(info()!.workspace)) map.set(info()!.workspace, []);
    return [...map.entries()]
      .map(([workspace, list]) => ({
        workspace,
        label: workspace.split(/[\\/]/).filter(Boolean).pop() || workspace || '未分组',
        items: list.filter((item) => !q || item.title.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length || !q);
  });

  async function refresh() {
    const data = await api.bootstrap();
    setInfo(data.info);
    setSessions(data.sessions);
    setSession(data.session);
    setMessages(data.session.messages ?? []);
  }

  function appendAssistant(delta: string) {
    setMessages((list) => {
      const next = [...list];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta };
      else next.push({ role: 'assistant', content: delta });
      return next;
    });
  }

  function handleEvent(event: WsEvent) {
    if (event.type === 'text') appendAssistant(String(event.delta ?? ''));
    else if (event.type === 'turn_start') setRunning(true);
    else if (event.type === 'step') setStatus(`第 ${event.step} 步`);
    else if (event.type === 'tool_start') setStatus(`调用 ${event.name}`);
    else if (event.type === 'notice') setStatus(String(event.message ?? ''));
    else if (event.type === 'approval_request') {
      setApproval({ id: String(event.id), summary: String(event.summary ?? '') });
    } else if (event.type === 'turn_end') {
      setRunning(false);
      setStatus('就绪');
      void refresh();
    }
  }

  onMount(() => {
    document.documentElement.dataset.theme = theme();
    void refresh().catch((error) => setStatus(error.message));
    socket = connect(handleEvent, (value) => {
      setOnline(value);
      setStatus(value ? '就绪' : '连接断开');
    });
    onCleanup(() => socket?.close());
  });

  function toggleTheme() {
    const next = theme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('banana-theme', next);
  }

  async function pick(id: string) {
    if (running()) return;
    const data = await api.activate(id);
    setSession(data.session);
    setMessages(data.session.messages ?? []);
  }

  async function newSession() {
    if (running()) return;
    const data = await api.create('新对话');
    await refresh();
    setSession(data.session);
    setMessages([]);
    input?.focus();
  }

  function send() {
    const value = input.value.trim();
    if (!value || running()) return;
    setMessages((list) => [...list, { role: 'user', content: value }, { role: 'assistant', content: '' }]);
    const ok = socket?.send({
      type: 'turn',
      input: value,
      mode: session()?.mode ?? 'build',
      reasoning: session()?.reasoning ?? 'standard',
    });
    if (!ok) {
      setStatus('连接未就绪');
      return;
    }
    input.value = '';
    input.style.height = 'auto';
    setRunning(true);
    setStatus('正在处理');
  }

  async function loadFiles() {
    try {
      const data = await api.files('');
      setFiles(data.entries ?? []);
    } catch (error) {
      setFiles([]);
    }
  }

  return (
    <div class="app">
      <header class="titlebar">
        <div class="titlebar-brand">
          <Icon name="leaf" />
          <span>BananaUI</span>
        </div>
        <span class="titlebar-status">
          <span class={`dot${online() ? '' : ' offline'}`} />
          {online() ? '已连接' : '未连接'}
        </span>
        <span class="titlebar-spacer" />
        <button class="icon-btn" title="切换主题" onClick={toggleTheme}>
          <Icon name={theme() === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button class="icon-btn" title="切换右栏" onClick={() => { setDockOpen(!dockOpen()); localStorage.setItem('banana-dock', dockOpen() ? '1' : '0'); }}>
          <Icon name="sliders" />
        </button>
      </header>

      <div class={`shell${dockOpen() ? '' : ' dock-closed'}`}>
        <aside class="sidebar">
          <div class="brand">
            <Icon name="leaf" />
            <span class="brand-word">Banana</span>
            <span class="brand-line" />
          </div>
          <div class="new-row">
            <button class="new-session" onClick={newSession}>
              <Icon name="plus" /> 新会话
            </button>
            <button class="icon-btn" title="设置"><Icon name="sliders" /></button>
          </div>
          <nav class="side-nav">
            <button class="nav-item"><Icon name="folder" /> 插件</button>
            <button class="nav-item"><Icon name="terminal" /> 任务</button>
            <button class="nav-item"><Icon name="sliders" /> 更多</button>
          </nav>
          <label class="side-search">
            <Icon name="search" />
            <input placeholder="搜索会话" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
          </label>
          <div class="workspace-list">
            <For each={groups()}>
              {(group) => (
                <div class="workspace-group">
                  <button
                    class="workspace-row"
                    onClick={() => setCollapsed({ ...collapsed(), [group.workspace]: !collapsed()[group.workspace] })}
                  >
                    <Icon name="folder" />
                    <span class="workspace-name">{group.label}</span>
                    <span class="workspace-count">{group.items.length}</span>
                  </button>
                  <Show when={!collapsed()[group.workspace]}>
                    <div class="sessions">
                      <For each={group.items}>
                        {(item) => (
                          <button class={`session-row${session()?.id === item.id ? ' active' : ''}`} onClick={() => void pick(item.id)}>
                            <span class="session-title">{item.title || '新对话'}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div class="side-foot">
            <button class="icon-btn" title="设置"><Icon name="sliders" /></button>
            <button class="icon-btn" title="撤销"><Icon name="folder" /></button>
          </div>
        </aside>

        <main class="chat">
          <div class="chat-head">
            <span class="chat-title">{session()?.title || '新对话'}</span>
            <span class="chat-meta">{status()}</span>
            <span class="chat-spacer" />
            <span class="chat-meta">{info()?.model ?? ''}</span>
          </div>
          <div class="messages">
            <Show
              when={messages().length}
              fallback={
                <div class="empty">
                  <div class="empty-brand">
                    <Icon name="leaf" />
                    <span class="empty-title">Banana</span>
                  </div>
                  <span class="empty-sub">说想法，香蕉来落地</span>
                </div>
              }
            >
              <For each={messages()}>
                {(message) => (
                  <article class={`msg ${message.role}`}>
                    <div class="msg-role">{message.role === 'user' ? '你' : 'BANANA'}</div>
                    <div class="msg-body">{message.content}</div>
                  </article>
                )}
              </For>
            </Show>
          </div>
          <div class="composer-wrap">
            <form
              class="composer"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <textarea
                ref={input}
                placeholder="描述你想构建的内容，/ 调用指令，@ 文件或对话"
                onInput={(event) => {
                  const el = event.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(220, el.scrollHeight)}px`;
                }}
              />
              <div class="composer-bar">
                <button type="button" class="chip">
                  <Icon name="plus" />
                </button>
                <button type="button" class="chip">
                  <Icon name="shield" /> 工作区内修改
                </button>
                <span class="spacer" />
                <span class="chat-meta">{info()?.model ?? ''}</span>
                <button type="submit" class="send" disabled={running()} title="发送">
                  <Icon name="send" />
                </button>
              </div>
            </form>
          </div>
        </main>

        <aside class="dock">
          <div class="dock-head">
            <For each={['terminal', 'files', 'tasks', 'verify'] as DockTab[]}>
              {(tab) => (
                <button
                  class={`dock-tab${dockTab() === tab ? ' active' : ''}`}
                  onClick={() => {
                    setDockTab(tab);
                    if (tab === 'files') void loadFiles();
                  }}
                >
                  {tab === 'terminal' ? '终端' : tab === 'files' ? '文件' : tab === 'tasks' ? '任务' : '验证'}
                </button>
              )}
            </For>
            <span class="spacer" />
            <button class="icon-btn" title="收起" onClick={() => { setDockOpen(false); localStorage.setItem('banana-dock', '0'); }}>
              ×
            </button>
          </div>
          <div class="dock-body">
            <Show when={dockTab() === 'terminal'}>
              <TerminalDock />
            </Show>
            <Show when={dockTab() === 'files'}>
              <For each={files()}>{(entry) => <div class="list-row">{entry.name}</div>}</For>
            </Show>
            <Show when={dockTab() === 'tasks'}>
              <For each={session()?.todos ?? []}>
                {(todo) => <div class="list-row">{todo.status === 'done' ? '✓ ' : '· '}{todo.text}</div>}
              </For>
            </Show>
            <Show when={dockTab() === 'verify'}>
              <For each={session()?.verification?.results ?? []}>
                {(result) => <div class="list-row">{result.ok ? '✓ ' : '✗ '}{result.command}</div>}
              </For>
            </Show>
          </div>
          <Show when={approval()}>
            {(item) => (
              <div class="list-row">
                需要确认：{item().summary || item().id}
                <button class="chip" onClick={() => { socket?.send({ type: 'approval', id: item().id, allow: true }); setApproval(null); }}>允许</button>
                <button class="chip" onClick={() => { socket?.send({ type: 'approval', id: item().id, allow: false }); setApproval(null); }}>拒绝</button>
              </div>
            )}
          </Show>
        </aside>
      </div>
    </div>
  );
}
