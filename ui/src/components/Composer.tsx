import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon';
import type { AppState } from '../state/app';
import { api } from '../lib/api';

interface PopItem {
  value: string;
  label: string;
  desc?: string;
  hint?: string;
}

export function Composer(props: { app: AppState }) {
  const { state, t } = props.app;
  let textarea: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let modelPop: HTMLDivElement | undefined;
  let timer: number | undefined;

  const [mention, setMention] = createSignal<{ start: number; query: string } | null>(null);
  const [fileHits, setFileHits] = createSignal<Array<{ path: string; isDirectory: boolean }>>([]);
  const [index, setIndex] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [modelOpen, setModelOpen] = createSignal(false);
  const [modelQuery, setModelQuery] = createSignal('');
  const [showAll, setShowAll] = createSignal(false);

  const catalog = () => props.app.state.models?.providers ?? [];
  const modelGroups = createMemo(() => {
    const needle = modelQuery().trim().toLowerCase();
    return catalog()
      .map((provider) => {
        const matched = needle
          ? provider.models.filter(
              (model) =>
                model.id.toLowerCase().includes(needle) ||
                model.label.toLowerCase().includes(needle) ||
                provider.label.toLowerCase().includes(needle),
            )
          : provider.models;
        return { ...provider, shown: showAll() || needle ? matched : matched.slice(0, 5), total: matched.length };
      })
      .filter((provider) => provider.shown.length > 0);
  });
  const totalModels = () => catalog().reduce((sum, provider) => sum + provider.models.length, 0);

  onMount(() => {
    const onPointer = (event: PointerEvent) => {
      if (!modelOpen()) return;
      const target = event.target as Node | null;
      if (modelPop && target && !modelPop.contains(target) && !(target as HTMLElement).closest?.('.model-switch')) {
        setModelOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    onCleanup(() => document.removeEventListener('pointerdown', onPointer));
  });

  const commands = createMemo<PopItem[]>(() => {
    const value = state.draft;
    if (!value.startsWith('/') || /\s/.test(value)) return [];
    const prefix = value.slice(1).toLowerCase();
    return (state.info?.commands ?? [])
      .filter((command) => !prefix || command.name.startsWith(prefix))
      .slice(0, 8)
      .map((command) => ({
        value: `/${command.name}`,
        label: command.name,
        desc: command.summary,
        hint: command.usage,
      }));
  });

  const files = createMemo<PopItem[]>(() => {
    const current = mention();
    if (!current) return [];
    return fileHits().map((file) => ({
      value: `@${file.path}`,
      label: file.isDirectory ? `${file.path}/` : file.path,
    }));
  });

  const items = () => (commands().length ? commands() : files());
  const popOpen = () => items().length > 0;

  function resize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(220, Math.max(56, textarea.scrollHeight))}px`;
  }

  createEffect(() => {
    props.app.focusTick();
    requestAnimationFrame(() => {
      textarea?.focus();
      resize();
    });
  });

  createEffect(() => {
    state.draft;
    resize();
  });

  onCleanup(() => window.clearTimeout(timer));

  function detectMention() {
    if (!textarea) return;
    const value = textarea.value;
    const cursor = textarea.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
    if (!match) {
      setMention(null);
      return;
    }
    const start = cursor - (match[1]?.length ?? 0) - 1;
    const query = match[1] ?? '';
    setMention({ start, query });
    setIndex(0);
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const data = await api.files(query, 24);
        setFileHits(data.files ?? []);
      } catch {
        setFileHits([]);
      }
    }, 120);
  }

  function onInput(value: string) {
    props.app.setDraft(value);
    setIndex(0);
    detectMention();
  }

  function insertAtCursor(text: string, replaceStart?: number) {
    if (!textarea) return;
    const start = replaceStart ?? textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
    props.app.setDraft(next);
    setMention(null);
    setFileHits([]);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const position = start + text.length;
      textarea.setSelectionRange(position, position);
      textarea.focus();
    });
  }

  function choose(item: PopItem) {
    if (item.value.startsWith('/')) {
      props.app.setDraft(`${item.value} `);
      requestAnimationFrame(() => textarea?.focus());
      return;
    }
    const current = mention();
    insertAtCursor(`${item.value} `, current?.start);
  }

  function onKeydown(event: KeyboardEvent) {
    if (modelOpen() && event.key === 'Escape') {
      event.preventDefault();
      setModelOpen(false);
      return;
    }
    if (popOpen()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setIndex((value) => Math.min(items().length - 1, value + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const item = items()[index()];
        if (item) choose(item);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        setFileHits([]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void props.app.send();
    }
  }

  const reasoningLabel = () => {
    const level = state.session?.reasoning ?? 'standard';
    return level === 'fast' ? t().reasoningFast : level === 'deep' ? t().reasoningDeep : t().reasoningStandard;
  };

  const cycleReasoning = () => {
    const current = state.session?.reasoning ?? 'standard';
    const next = current === 'fast' ? 'standard' : current === 'standard' ? 'deep' : 'fast';
    props.app.setReasoning(next);
  };

  return (
    <div class="composer-wrap">
      <Show when={popOpen()}>
        <div class="composer-pop">
          <div class="pop-head">{commands().length ? '命令' : '文件'}</div>
          <div class="pop-list">
            <For each={items()}>
              {(item, i) => (
                <button
                  type="button"
                  class={`pop-item${i() === index() ? ' active' : ''}`}
                  onMouseEnter={() => setIndex(i())}
                  onClick={() => choose(item)}
                >
                  <span class="name">{item.label}</span>
                  <Show when={item.desc}>
                    <span class="desc">{item.desc}</span>
                  </Show>
                  <Show when={item.hint}>
                    <span class="usage">{item.hint}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <form
        class={`composer${dragging() ? ' drag' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          void props.app.send();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer?.files.length) void props.app.addImages(event.dataTransfer.files);
        }}
      >
        <Show when={state.images.length}>
          <div class="attachments-tray">
            <For each={state.images}>
              {(image) => (
                <div class="attachment">
                  <img src={image.dataUrl} alt={image.name ?? ''} />
                  <button type="button" aria-label="移除图片" onClick={() => props.app.removeImage(image.id)}>
                    <Icon name="close" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <textarea
          ref={textarea}
          rows={1}
          value={state.draft}
          placeholder={t().placeholder}
          aria-label={t().placeholder}
          onInput={(event) => onInput(event.currentTarget.value)}
          onKeyDown={onKeydown}
          onClick={detectMention}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (files.length) {
              event.preventDefault();
              void props.app.addImages(files);
            }
          }}
        />

        <div class="composer-row">
          <button
            type="button"
            class="chip square"
            title={t().dragHint}
            aria-label="添加图片"
            onClick={() => fileInput?.click()}
          >
            <Icon name="image" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files) void props.app.addImages(files);
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            class={`chip${state.session?.mode === 'plan' ? ' plan' : ''}`}
            title="Plan / Build"
            onClick={() => void props.app.setMode(state.session?.mode === 'plan' ? 'build' : 'plan')}
          >
            <Icon name="shield" />
            {state.session?.mode === 'plan' ? `${t().planMode} · 先出方案` : `${t().build} · 直接执行`}
          </button>
          <button type="button" class="chip" title="推理强度" onClick={cycleReasoning}>
            <Icon name="brain" />
            {reasoningLabel()}
          </button>
          <span class="spacer" />
          <div class="model-switch" role="group" aria-label="模型">
            <button
              type="button"
              class="model-arrow"
              title="上一个模型"
              aria-label="上一个模型"
              onClick={() => void props.app.cycleModel(-1)}
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              class="chip model"
              title={`${state.info?.currentProvider ?? ''} / ${state.info?.model ?? ''} · 点击选择模型`}
              aria-expanded={modelOpen()}
              onClick={() => {
                setModelOpen((open) => !open);
                setModelQuery('');
                void props.app.loadModels();
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  void props.app.cycleModel(-1);
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  void props.app.cycleModel(1);
                }
              }}
            >
              {state.info?.providerError ? '模型不可用' : state.info?.model ?? '模型'}
            </button>
            <button
              type="button"
              class="model-arrow"
              title="下一个模型"
              aria-label="下一个模型"
              onClick={() => void props.app.cycleModel(1)}
            >
              <Icon name="chevronRight" />
            </button>
          </div>
          <Show when={modelOpen()}>
            <div class="model-pop" ref={modelPop} role="dialog" aria-label="选择模型">
              <div class="model-pop-head">
                <span>选择模型</span>
                <span class="spacer" />
                <button
                  class="model-pop-refresh"
                  type="button"
                  title="刷新模型列表"
                  onClick={() => void props.app.loadModels(true)}
                >
                  {props.app.state.modelsLoading ? '刷新中…' : '刷新'}
                </button>
              </div>
              <input
                class="model-search"
                type="search"
                placeholder="搜索模型"
                value={modelQuery()}
                onInput={(event) => setModelQuery(event.currentTarget.value)}
              />
              <div class="model-pop-list">
                <Show
                  when={modelGroups().length}
                  fallback={
                    <div class="model-empty">
                      {props.app.state.modelsLoading ? '正在获取模型…' : '还没有可用模型，先到设置里填 API Key'}
                    </div>
                  }
                >
                  <For each={modelGroups()}>
                    {(provider) => (
                      <div class="model-group">
                        <div class="model-group-head">
                          <span>{provider.label}</span>
                          <span class="model-group-source">{provider.source === 'live' ? '官方' : '兜底'}</span>
                        </div>
                        <For each={provider.shown}>
                          {(model) => (
                            <button
                              type="button"
                              class={`model-item${
                                state.info?.currentProvider === provider.name && state.info?.model === model.id
                                  ? ' active'
                                  : ''
                              }`}
                              onClick={() => {
                                setModelOpen(false);
                                void props.app.setModel(provider.name, model.id);
                              }}
                            >
                              <span class="model-item-id">{model.id}</span>
                              <Show
                                when={
                                  state.info?.currentProvider === provider.name &&
                                  state.info?.model === model.id
                                }
                              >
                                <span class="model-item-check">当前</span>
                              </Show>
                            </button>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
              <div class="model-pop-foot">
                <Show when={totalModels() > 5 && !modelQuery()}>
                  <button type="button" class="model-more" onClick={() => setShowAll((value) => !value)}>
                    {showAll() ? '收起' : `显示全部 ${totalModels()}`}
                  </button>
                </Show>
                <button
                  type="button"
                  class="model-more"
                  onClick={() => {
                    setModelOpen(false);
                    props.app.openSettings();
                  }}
                >
                  管理 API Key
                </button>
              </div>
            </div>
          </Show>
          <Show
            when={state.running}
            fallback={
              <button
                type="submit"
                class="send-btn"
                title={t().send}
                aria-label={t().send}
                disabled={!state.draft.trim() && !state.images.length}
              >
                <Icon name="send" />
              </button>
            }
          >
            <button type="button" class="send-btn stop" title={t().stop} aria-label={t().stop} onClick={() => props.app.stop()}>
              <Icon name="stop" />
            </button>
          </Show>
        </div>
      </form>
    </div>
  );
}
