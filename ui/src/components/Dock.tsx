import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon';
import type { AppState, DockTab } from '../state/app';
import { api } from '../lib/api';
import { formatBytes, formatCount, formatDuration, shortPath } from '../lib/format';

function TerminalDock() {
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
      fontSize: 12,
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
      const fit = window.FitAddon ? new window.FitAddon() : null;
      if (fit) {
        term.loadAddon?.(fit);
        fit.fit();
        const observer = new ResizeObserver(() => fit.fit());
        observer.observe(host);
        onCleanup(() => observer.disconnect());
      }
    } catch {
      /* ignore */
    }

    socket = new WebSocket(`ws://${location.host}/terminal`);
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

function FilesDock(props: { app: AppState }) {
  const { state, t } = props.app;
  onMount(() => void props.app.loadFiles());
  return (
    <>
      <div class="tree">
        <Show when={state.fileItems.length} fallback={<div class="empty-dock">目录为空</div>}>
          <For each={state.fileItems}>{(item) => <FileNode app={props.app} item={item} />}</For>
        </Show>
      </div>
      <Show when={state.filePreview}>
        {(file) => (
          <div class="file-preview" style={{ 'border-top': '1px solid var(--line)' }}>
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
              when={!file().binary}
              fallback={<div class="empty-dock">{t().binaryFile}</div>}
            >
              <pre>{file().content}</pre>
              <Show when={file().truncated}>
                <div class="empty-dock">{t().truncated}</div>
              </Show>
            </Show>
          </div>
        )}
      </Show>
    </>
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

const TABS: Array<{ id: DockTab; key: 'terminal' | 'files' | 'tasks' | 'verify' | 'info' }> = [
  { id: 'terminal', key: 'terminal' },
  { id: 'files', key: 'files' },
  { id: 'tasks', key: 'tasks' },
  { id: 'verify', key: 'verify' },
  { id: 'info', key: 'info' },
];

export function Dock(props: { app: AppState }) {
  const { state, t } = props.app;

  function startResize(event: PointerEvent) {
    if (window.innerWidth <= 1180) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.dockWidth;
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(620, Math.max(300, startWidth - (moveEvent.clientX - startX)));
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
            <TerminalDock />
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
