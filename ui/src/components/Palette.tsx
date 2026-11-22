import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon';
import type { AppState } from '../state/app';

interface Item {
  label: string;
  group: string;
  hint?: string;
  icon?: string;
  run: () => void;
}

export function Palette(props: { app: AppState }) {
  const { state, t } = props.app;
  const [index, setIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    if (!state.paletteOpen) return;
    setIndex(0);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        input?.focus();
        input?.select();
      }),
    );
  });

  onMount(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if (!state.paletteOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onGlobalKey, true);
    onCleanup(() => window.removeEventListener('keydown', onGlobalKey, true));
  });

  const items = createMemo<Item[]>(() => {
    const needle = state.paletteQuery.trim().toLowerCase();
    const list: Item[] = [];
    for (const session of state.sessions) {
      if (!needle || session.title.toLowerCase().includes(needle)) {
        list.push({
          label: session.title || '新对话',
          group: '会话',
          icon: 'message',
          hint: session.turns ? `${session.turns} 轮` : '',
          run: () => void props.app.pick(session.id),
        });
      }
    }
    const actions: Item[] = [
      { label: t().newChat, group: '动作', icon: 'plus', hint: 'Ctrl N', run: () => void props.app.newSession() },
      { label: t().settings, group: '动作', icon: 'settings', hint: 'Ctrl ,', run: () => props.app.openSettings() },
      { label: t().plugins, group: '动作', icon: 'plugin', run: () => props.app.openPlugins() },
      { label: t().guide, group: '动作', icon: 'info', run: () => props.app.openGuide() },
      { label: t().terminal, group: '动作', icon: 'terminal', hint: 'Ctrl `', run: () => props.app.setDock('terminal') },
      { label: t().files, group: '动作', icon: 'folder', run: () => props.app.setDock('files') },
      { label: t().tasks, group: '动作', icon: 'list', run: () => props.app.setDock('tasks') },
      { label: t().verify, group: '动作', icon: 'check', run: () => void props.app.runVerify() },
      { label: t().undo, group: '动作', icon: 'undo', run: () => void props.app.runUndo() },
      { label: t().exportMd, group: '动作', icon: 'download', run: () => props.app.exportSession('md') },
      { label: t().exportJson, group: '动作', icon: 'download', run: () => props.app.exportSession('json') },
      { label: t().theme, group: '动作', icon: 'sun', run: () => props.app.toggleTheme() },
      { label: t().clear, group: '动作', icon: 'trash', run: () => void props.app.clearSession() },
    ];
    for (const action of actions) {
      if (!needle || action.label.toLowerCase().includes(needle)) list.push(action);
    }
    for (const command of state.info?.commands ?? []) {
      if (!needle || command.name.includes(needle) || command.summary.toLowerCase().includes(needle)) {
        list.push({
          label: `/${command.name}`,
          group: '命令',
          icon: 'code',
          hint: command.summary,
          run: () => {
            props.app.setState('paletteOpen', false);
            props.app.setDraft(`/${command.name} `);
            props.app.focusComposer();
          },
        });
      }
    }
    return list;
  });

  const groups = createMemo(() => {
    const out: Array<{ title: string; items: Array<Item & { index: number }> }> = [];
    items().forEach((item, i) => {
      let group = out.find((entry) => entry.title === item.group);
      if (!group) {
        group = { title: item.group, items: [] };
        out.push(group);
      }
      group.items.push({ ...item, index: i });
    });
    return out;
  });

  function close() {
    props.app.setState({ paletteOpen: false, paletteQuery: '' });
    setIndex(0);
  }

  function onKeydown(event: KeyboardEvent) {
    const list = items();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((value) => Math.min(list.length - 1, value + 1));
      requestAnimationFrame(() => document.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((value) => Math.max(0, value - 1));
      requestAnimationFrame(() => document.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = list[index()];
      if (item) {
        item.run();
        if (!item.label.startsWith('/')) close();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  return (
    <Show when={state.paletteOpen}>
      <div class="overlay" style={{ 'align-items': 'flex-start' }} onMouseDown={(event) => event.target === event.currentTarget && close()}>
        <div class="palette" role="dialog" aria-modal="true" aria-label={t().commandPalette}>
          <input
            ref={(el) => {
              input = el;
              queueMicrotask(() => {
                if (!state.paletteOpen) return;
                el.focus();
                el.select();
              });
            }}
            value={state.paletteQuery}
            placeholder={`${t().commandPalette}…`}
            onInput={(event) => {
              props.app.setState({ paletteQuery: event.currentTarget.value, paletteIndex: 0 });
              setIndex(0);
            }}
            onKeyDown={onKeydown}
          />
          <div class="palette-list">
            <Show when={items().length} fallback={<div class="empty-dock">{t().noResults}</div>}>
              <For each={groups()}>
                {(group) => (
                  <section>
                    <div class="palette-group-label">{group.title}</div>
                    <For each={group.items}>
                      {(item) => (
                        <button
                          type="button"
                          class={`palette-item${item.index === index() ? ' active' : ''}`}
                          onMouseEnter={() => setIndex(item.index)}
                          onClick={() => {
                            item.run();
                            if (!item.label.startsWith('/')) close();
                          }}
                        >
                          <Show when={item.icon}>
                            <Icon name={item.icon!} />
                          </Show>
                          <span class="label">{item.label}</span>
                          <Show when={item.hint}>
                            <span class="hint">{item.hint}</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </section>
                )}
              </For>
            </Show>
          </div>
          <div class="palette-foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> 选择
            </span>
            <span>
              <kbd>↵</kbd> 打开
            </span>
            <span>
              <kbd>esc</kbd> 关闭
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
}
