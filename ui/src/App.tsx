import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { createAppState } from './state/app';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { ChatThread, ApprovalBar } from './components/Chat';
import { Composer } from './components/Composer';
import { Dock } from './components/Dock';
import { Settings } from './components/Settings';
import { Plugins } from './components/Plugins';
import { Palette } from './components/Palette';
import { Guide } from './components/Guide';
import { Modal, Toasts } from './components/ui';

export default function App() {
  const app = createAppState();
  const { state, t } = app;

  onMount(() => {
    if (window.innerWidth <= 840) app.setState('sidebarOpen', false);
    if (window.innerWidth <= 1180) app.setState('dockOpen', false);
    app.setThemeMode(app.themeMode());
    void app.refresh().catch(() => {});
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (app.themeMode() === 'system') app.setThemeMode('system');
    };
    media.addEventListener('change', onChange);
    onCleanup(() => media.removeEventListener('change', onChange));
  });

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        app.setState({ paletteOpen: true, paletteQuery: '', paletteIndex: 0 });
      } else if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void app.newSession();
      } else if (meta && event.key === ',') {
        event.preventDefault();
        app.openSettings();
      } else if (meta && event.key === '`') {
        event.preventDefault();
        app.setDock('terminal');
      } else if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        app.setState('sidebarOpen', (open) => !open);
      } else if (event.key === 'Escape' && state.running) {
        app.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  onCleanup(() => app.dispose());

  return (
    <div
      class={`app${state.sidebarOpen ? ' sidebar-open' : ' sidebar-closed'}${state.dockOpen ? '' : ' dock-closed'}`}
      style={{ '--dock-width': `${state.dockWidth}px` }}
    >
      <Sidebar app={app} />
      <div class="sidebar-scrim" onClick={() => app.setState('sidebarOpen', false)} />

      <main class="main">
        <header class={`topbar${state.info?.isDesktop ? ' desktop' : ''}${state.threadScrolled ? ' scrolled' : ''}`}>
          <Show when={!state.sidebarOpen}>
            <button class="icon-btn sm" type="button" title={t().openSidebar} aria-label={t().openSidebar} onClick={() => app.setState('sidebarOpen', true)}>
              <Icon name="sidebar" />
            </button>
          </Show>
          <div class="topbar-title">
            <h1>{state.session?.title || t().newChat}</h1>
            <span class="topbar-meta">{state.info?.model ?? ''}</span>
          </div>
          <span class="spacer" />
          <span class={`conn${state.online ? '' : ' offline'}`} title={state.status}>
            <span class="dot" />
            <span>{state.online ? t().connected : t().offline}</span>
          </span>
          <div class="topbar-actions">
            <button class="icon-btn sm" type="button" title={`${t().commandPalette} Ctrl+K`} aria-label={t().commandPalette} onClick={() => app.setState('paletteOpen', true)}>
              <Icon name="search" />
            </button>
            <button class="icon-btn sm terminal-quick" type="button" title={t().terminal} aria-label={t().terminal} onClick={() => app.setDock('terminal')}>
              <Icon name="terminal" />
            </button>
            <button class={`icon-btn sm${state.dockOpen ? ' active' : ''}`} type="button" title="面板" aria-label="面板" onClick={() => app.toggleDock()}>
              <Icon name="panel" />
            </button>
            <button class="icon-btn sm" type="button" title={t().settings} aria-label={t().settings} onClick={() => app.openSettings()}>
              <Icon name="settings" />
            </button>
          </div>
          <Show when={state.info?.isDesktop}>
            <div class="win-controls">
              <button type="button" aria-label="最小化" onClick={() => window.bananaDesktop?.windowControl?.('minimize')}>
                <Icon name="minimize" />
              </button>
              <button type="button" aria-label="最大化" onClick={() => window.bananaDesktop?.windowControl?.('maximize')}>
                <Icon name="maximize" />
              </button>
              <button type="button" class="close" aria-label="关闭" onClick={() => window.bananaDesktop?.windowControl?.('close')}>
                <Icon name="close" />
              </button>
            </div>
          </Show>
        </header>

        <Show when={state.info?.providerError}>
          <div class="banner">
            <Icon name="alert" />
            <span class="grow">
              {t().setupNeeded}：{state.info?.providerError}
            </span>
            <button class="btn sm" type="button" onClick={() => app.openSettings()}>
              {t().setupAction}
            </button>
          </div>
        </Show>
        <Show when={!state.online && !state.booting}>
          <div class="banner" style={{ background: 'var(--danger-bg)' }}>
            <Icon name="alert" />
            <span class="grow">{t().connectionLost}</span>
            <span class="hint">{state.status}</span>
          </div>
        </Show>

        <div class="work">
          <div class="chat-col">
            <ChatThread app={app} />
            <ApprovalBar app={app} />
            <Composer app={app} />
          </div>
          <Dock app={app} />
          <div class="dock-scrim" onClick={() => app.setState('dockOpen', false)} />
        </div>
      </main>

      <Settings app={app} />
      <Plugins app={app} />
      <Palette app={app} />
      <Guide app={app} />

      <Modal
        open={state.trustOpen}
        title={t().trustTitle}
        onClose={() => app.dismissTrust()}
        footer={
          <div class="dialog-foot">
            <button class="btn" type="button" onClick={() => app.dismissTrust()}>
              {t().trustSkip}
            </button>
            <button class="btn primary" type="button" onClick={() => void app.trustWorkspace()}>
              {t().trustAccept}
            </button>
          </div>
        }
      >
        <div class="dialog-body">
          <p class="md">{t().trustBody}</p>
          <Show when={state.info?.trust}>
            <div class="info-block" style={{ 'margin-top': '12px' }}>
              <div class="info-kv">
                <span class="k">{t().workspace}</span>
                <span class="v">{state.info?.trust?.workspace}</span>
              </div>
              <div class="info-kv">
                <span class="k">配置</span>
                <span class="v">
                  {[
                    state.info?.trust?.hasConfig ? '.banana / AGENT.md' : '',
                    state.info?.trust?.hasPlugins ? 'plugins' : '',
                    state.info?.trust?.hasAgentDoc ? 'AGENT.md' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
            </div>
          </Show>
        </div>
      </Modal>

      <ConfirmDialog app={app} />
      <PromptDialog app={app} />

      <Modal
        open={state.helpOpen}
        title="帮助"
        onClose={() => app.setState('helpOpen', false)}
      >
        <div class="dialog-body">
          <div class="settings-section">
            <h3>快捷键</h3>
            <div class="info-kv">
              <span class="k">Ctrl K</span>
              <span class="v">命令中心</span>
            </div>
            <div class="info-kv">
              <span class="k">Ctrl N</span>
              <span class="v">新会话</span>
            </div>
            <div class="info-kv">
              <span class="k">Ctrl ,</span>
              <span class="v">设置</span>
            </div>
            <div class="info-kv">
              <span class="k">Ctrl `</span>
              <span class="v">终端</span>
            </div>
            <div class="info-kv">
              <span class="k">Esc</span>
              <span class="v">停止当前回合</span>
            </div>
          </div>
          <div class="settings-section">
            <h3>命令</h3>
            <For each={state.info?.commands ?? []}>
              {(command) => (
                <div class="info-kv">
                  <span class="k" style={{ width: '150px', 'min-width': '150px' }}>
                    {command.usage}
                  </span>
                  <span class="v" style={{ 'font-family': 'var(--font)' }}>
                    {command.summary}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Modal>

      <Toasts items={state.toasts} onDismiss={(id) => app.dismissToast(id)} />
    </div>
  );
}

function ConfirmDialog(props: { app: ReturnType<typeof createAppState> }) {
  const { state, t } = props.app;
  return (
    <Modal
      open={Boolean(state.confirm)}
      title={state.confirm?.title ?? ''}
      onClose={() => props.app.answerConfirm(false)}
      footer={
        <div class="dialog-foot">
          <button class="btn" type="button" onClick={() => props.app.answerConfirm(false)}>
            {t().cancel}
          </button>
          <button
            class={`btn ${state.confirm?.danger ? 'danger' : 'primary'}`}
            type="button"
            onClick={() => props.app.answerConfirm(true)}
          >
            {state.confirm?.confirmLabel ?? '确定'}
          </button>
        </div>
      }
    >
      <div class="dialog-body">
        <Show when={state.confirm?.message}>
          <p class="md">{state.confirm?.message}</p>
        </Show>
      </div>
    </Modal>
  );
}

function PromptDialog(props: { app: ReturnType<typeof createAppState> }) {
  const { state } = props.app;
  const [value, setValue] = createSignal('');

  createEffect(() => {
    if (state.prompt) setValue(state.prompt.value ?? '');
  });

  const submit = () => props.app.answerPrompt(value().trim() || null);

  return (
    <Modal
      open={Boolean(state.prompt)}
      title={state.prompt?.title ?? ''}
      onClose={() => props.app.answerPrompt(null)}
      footer={
        <div class="dialog-foot">
          <button class="btn" type="button" onClick={() => props.app.answerPrompt(null)}>
            取消
          </button>
          <button class="btn primary" type="button" onClick={submit}>
            确定
          </button>
        </div>
      }
    >
      <div class="dialog-body">
        <label class="field">
          <span class="field-label">{state.prompt?.label ?? ''}</span>
          <input
            class="input"
            value={value()}
            placeholder={state.prompt?.placeholder}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
      </div>
    </Modal>
  );
}
