import { For, Show, createSignal } from 'solid-js';
import { Icon } from './Icon';
import type { AppState } from '../state/app';
import { shortPath } from '../lib/format';

export function Sidebar(props: { app: AppState }) {
  const { state, t } = props.app;
  let importInput: HTMLInputElement | undefined;
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  const isCollapsed = (workspace: string) => collapsed()[workspace] === true;

  return (
    <aside class="sidebar" aria-label={t().workspace}>
      <div class="side-head">
        <div class="brand">
          <span class="brand-mark">
            <Icon name="leaf" />
          </span>
          <span>Banana</span>
          <span class="brand-dot" />
        </div>
        <span class="spacer" />
        <button
          class="icon-btn sm"
          type="button"
          title={t().closeSidebar}
          aria-label={t().closeSidebar}
          onClick={() => props.app.setState('sidebarOpen', false)}
        >
          <Icon name="sidebar" />
        </button>
      </div>

      <div class="side-body">
        <button class="side-btn primary" type="button" onClick={() => void props.app.newSession()}>
          <Icon name="plus" />
          {t().newChat}
          <span class="kbd-hint">Ctrl N</span>
        </button>
        <button class="side-btn" type="button" onClick={() => props.app.setState({ paletteOpen: true, paletteQuery: '', paletteIndex: 0 })}>
          <Icon name="search" />
          {t().search}
          <span class="kbd-hint">Ctrl K</span>
        </button>
        <button class="side-btn" type="button" onClick={() => props.app.openPlugins()}>
          <Icon name="plugin" />
          {t().plugins}
        </button>
        <button class="side-btn" type="button" onClick={() => props.app.openGuide()}>
          <Icon name="info" />
          {t().guide}
        </button>
      </div>

      <div class="side-search">
        <Icon name="search" />
        <input
          type="search"
          placeholder={t().searchSessions}
          value={state.query}
          aria-label={t().searchSessions}
          onInput={(event) => props.app.setQuery(event.currentTarget.value)}
        />
        <Show when={state.query}>
          <button class="icon-btn sm" type="button" aria-label="清除" onClick={() => props.app.setQuery('')}>
            <Icon name="close" />
          </button>
        </Show>
      </div>

      <div class="session-list">
        <div class="side-label">
          {t().workspace} · {shortPath(state.info?.workspace ?? '', 1)}
        </div>
        <For each={props.app.groups()}>
          {(group) => (
            <div class="ws-group">
              <button
                type="button"
                class={`ws-head${isCollapsed(group.workspace) ? ' closed' : ''}`}
                onClick={() => setCollapsed({ ...collapsed(), [group.workspace]: !isCollapsed(group.workspace) })}
                title={group.workspace}
              >
                <Icon name="chevron" />
                <Icon name="folder" />
                <span class="ws-name">{group.label}</span>
                <span class="ws-count">{group.items.length}</span>
              </button>
              <div class={`ws-body${isCollapsed(group.workspace) ? ' collapsed' : ''}`}>
                <div class="ws-clip">
                  <For each={group.items}>
                    {(item) => (
                      <div class={`session-row${state.session?.id === item.id ? ' active' : ''}`}>
                        <button class="session-main" type="button" title={item.title} onClick={() => void props.app.pick(item.id)}>
                          {item.title || '新对话'}
                        </button>
                        <span class="session-actions">
                          <button type="button" aria-label={t().rename} title={t().rename} onClick={() => void props.app.renameSession(item)}>
                            <Icon name="edit" />
                          </button>
                          <button type="button" aria-label={t().delete} title={t().delete} onClick={() => void props.app.removeSession(item)}>
                            <Icon name="trash" />
                          </button>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
        <Show when={!state.sessions.length && !state.booting}>
          <div class="empty-dock">还没有会话</div>
        </Show>
      </div>

      <div class="side-foot">
        <button class="side-foot-btn" type="button" onClick={() => props.app.openSettings()}>
          <Icon name="settings" />
          {t().settings}
        </button>
        <span class="spacer" />
        <button class="icon-btn sm" type="button" title={t().theme} onClick={() => props.app.toggleTheme()}>
          <Icon name={props.app.themeMode() === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button class="icon-btn sm" type="button" title={t().exportMd} onClick={() => props.app.exportSession('md')}>
          <Icon name="download" />
        </button>
        <button class="icon-btn sm" type="button" title={t().import} onClick={() => importInput?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void props.app.importSession(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </aside>
  );
}
