import { For, Show, createMemo, createSignal } from 'solid-js';
import { Icon } from './Icon';
import { Modal, Switch } from './ui';
import type { AppState } from '../state/app';

export function Plugins(props: { app: AppState }) {
  const { state, t } = props.app;
  const [query, setQuery] = createSignal('');

  const groups = createMemo(() => {
    const needle = query().trim().toLowerCase();
    const tools = (state.info?.tools ?? []).filter(
      (tool) =>
        !needle ||
        tool.name.toLowerCase().includes(needle) ||
        tool.description.toLowerCase().includes(needle),
    );
    return [
      { title: t().builtin, items: tools.filter((tool) => tool.builtin) },
      { title: t().external, items: tools.filter((tool) => !tool.builtin) },
    ];
  });

  return (
    <Modal
      open={state.pluginsOpen}
      wide
      title={t().plugins}
      onClose={() => props.app.setState('pluginsOpen', false)}
      footer={
        <div class="dialog-foot">
          <button class="btn sm" type="button" onClick={() => props.app.refresh()}>
            <Icon name="refresh" /> {t().refresh}
          </button>
          <span class="spacer" />
          <button class="btn sm primary" type="button" onClick={() => void props.app.addPlugin()}>
            <Icon name="plus" /> {t().addPlugin}
          </button>
        </div>
      }
    >
      <div class="plugins">
        <label class="plugins-search">
          <Icon name="search" />
          <input
            value={query()}
            placeholder={t().pluginSearch}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div class="plugins-body">
          <For each={groups()}>
            {(group) => (
              <Show when={group.items.length || !query().trim()}>
                <section class="plugin-group">
                  <h3>
                    {group.title}
                    <span class="tag">{group.items.length}</span>
                  </h3>
                  <Show
                    when={group.items.length}
                    fallback={
                      <div class="plugin-empty">
                        {group.title === t().external ? t().noPlugins : '没有匹配的内置工具'}
                      </div>
                    }
                  >
                    <div class="plugin-rows">
                      <For each={group.items}>
                        {(tool) => (
                          <div class={`plugin-row${tool.enabled ? '' : ' off'}`}>
                            <span class="icon">
                              <Icon name={tool.builtin ? 'shield' : 'plugin'} />
                            </span>
                            <div class="plugin-main">
                              <div class="plugin-name">
                                {tool.name}
                                <Show when={!tool.builtin}>
                                  <span class="tag accent">插件</span>
                                </Show>
                                <span class="tag">{tool.approval}</span>
                              </div>
                              <div class="plugin-desc" title={tool.description}>
                                {tool.description}
                              </div>
                            </div>
                            <Switch
                              checked={tool.enabled}
                              label={tool.name}
                              onChange={(value) => void props.app.toggleTool(tool.name, value)}
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Modal>
  );
}
