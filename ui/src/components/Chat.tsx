import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon';
import { Dots } from './ui';
import type { AppState } from '../state/app';
import type { SessionMessage } from '../lib/api';
import { renderMarkdown, plainSummary } from '../lib/markdown';
import { summaryOf, stripReasoningSignature } from '../lib/reasoning';
import { formatDuration } from '../lib/format';

function Reasoning(props: { text: string; live: boolean }) {
  const [override, setOverride] = createSignal<boolean | null>(null);
  const open = () => override() ?? props.live;

  createEffect(() => {
    if (!props.live) setOverride(null);
  });

  const summary = createMemo(() => plainSummary(summaryOf(props.text, props.live), 100));

  return (
    <div class={`reason${open() ? ' open' : ''}`}>
      <button class="reason-head" type="button" onClick={() => setOverride(!open())}>
        <Icon name="chevronRight" />
        <span class="reason-title">{props.live ? '正在思考' : '已深度思考'}</span>
        <Show when={props.live}>
          <Dots />
        </Show>
        <Show when={!props.live && summary()}>
          <span class="reason-summary">{summary()}</span>
        </Show>
      </button>
      <div class="reason-body">
        <div class="reason-scroll">
          <div class="reason-inner md" innerHTML={renderMarkdown(stripReasoningSignature(props.text))} />
        </div>
      </div>
    </div>
  );
}

function ToolList(props: { calls: NonNullable<SessionMessage['toolCalls']>; live: boolean }) {
  const failed = () => props.calls.filter((call) => call.status === 'fail').length;
  return (
    <details class="tools" open={props.live || failed() > 0}>
      <summary class="tools-head">
        <span class={`tool-dot ${failed() ? 'fail' : props.live ? 'running' : 'ok'}`} />
        <span>工具调用 · {props.calls.length}</span>
        <Show when={failed()}>
          <span class="tag danger">{failed()} 失败</span>
        </Show>
        <span class="spacer" />
        <Icon name="chevron" class="chev" />
      </summary>
      <div class="tool-list">
        <Index each={props.calls}>
          {(call) => (
            <details class="tool-item" open={call().status === 'fail'}>
              <summary class="tool-row">
                <span class={`tool-dot ${call().status ?? 'ok'}`} />
                <span class="tool-name">{call().name}</span>
                <span class="tool-summary">{call().summary ?? ''}</span>
                <span class="tool-time">{call().status === 'running' ? '…' : formatDuration(call().durationMs)}</span>
              </summary>
              <Show
                when={call().output}
                fallback={<div class="tool-output">{call().status === 'running' ? '等待输出…' : '无输出'}</div>}
              >
                <pre class="tool-output">{call().output}</pre>
              </Show>
            </details>
          )}
        </Index>
      </div>
    </details>
  );
}

function Message(props: { app: AppState; message: SessionMessage; live: boolean; index: number }) {
  const { t } = props.app;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.message.content ?? '');
      props.app.toast(t().copied, 'success');
    } catch {
      props.app.toast('复制失败', 'error');
    }
  };

  return (
    <Show
      when={props.message.role === 'user'}
      fallback={
        <article class="msg assistant">
          <div class="who">
            <Icon name="leaf" />
            <span>Banana</span>
          </div>
          <Show when={props.message.reasoning}>
            <Reasoning text={props.message.reasoning!} live={props.live} />
          </Show>
          <Show when={props.message.toolCalls?.length}>
            <ToolList calls={props.message.toolCalls!} live={props.live} />
          </Show>
          <div class="body">
            <Show
              when={props.message.content}
              fallback={
                <Show when={props.live}>
                  <span class="thinking">
                    {t().thinking}
                    <Dots />
                  </span>
                </Show>
              }
            >
              <div class="md" innerHTML={renderMarkdown(props.message.content)} />
            </Show>
          </div>
          <Show when={props.message.content}>
            <div class="msg-actions">
              <button class="icon-btn sm" type="button" title={t().copy} aria-label={t().copy} onClick={() => void copy()}>
                <Icon name="copy" />
              </button>
            </div>
          </Show>
        </article>
      }
    >
      <article class="msg user">
        <Show when={props.message.images?.length}>
          <div class="attachments">
            <For each={props.message.images}>
              {(src) => <img src={src} alt="" />}
            </For>
          </div>
        </Show>
        <div class="bubble">{props.message.content}</div>
      </article>
    </Show>
  );
}

const STARTERS = [
  { key: 0, title: 'starter1', sub: 'starter1sub' },
  { key: 1, title: 'starter2', sub: 'starter2sub' },
  { key: 2, title: 'starter3', sub: 'starter3sub' },
  { key: 3, title: 'starter4', sub: 'starter4sub' },
] as const;

export function ChatThread(props: { app: AppState }) {
  const { state, t } = props.app;
  let thread: HTMLDivElement | undefined;
  let inner: HTMLDivElement | undefined;
  let stick = true;
  const [showJump, setShowJump] = createSignal(false);

  const messages = () => props.app.visibleMessages();
  const plan = () => props.app.pendingPlan();

  function nearBottom() {
    if (!thread) return true;
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140;
  }

  function toBottom(smooth = false) {
    thread?.scrollTo({ top: thread.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stick = true;
    setShowJump(false);
  }

  createEffect(() => {
    props.app.scrollTick();
    const near = nearBottom();
    stick = near;
    if (near) requestAnimationFrame(() => toBottom());
    else setShowJump(true);
  });

  createEffect(() => {
    state.session?.id;
    requestAnimationFrame(() => toBottom());
  });

  onMount(() => {
    if (!inner) return;
    const observer = new ResizeObserver(() => {
      if (stick) requestAnimationFrame(() => toBottom());
    });
    observer.observe(inner);
    onCleanup(() => observer.disconnect());
  });

  const starters = () =>
    STARTERS.map((item) => ({ title: t()[item.title], sub: t()[item.sub] }));

  return (
    <>
      <div
        class="thread"
        ref={thread}
        onScroll={() => {
          const near = nearBottom();
          stick = near;
          setShowJump(!near);
          props.app.setState('threadScrolled', (thread?.scrollTop ?? 0) > 4);
        }}
        aria-live="polite"
      >
        <Show
          when={messages().length}
          fallback={
            <Show
              when={!state.booting}
              fallback={
                <div class="thread-inner">
                  <div class="skeleton" style={{ width: '60%', height: '14px', margin: '24px auto 0' }} />
                  <div class="skeleton" style={{ width: '88%', height: '12px', margin: '14px auto 0' }} />
                  <div class="skeleton" style={{ width: '74%', height: '12px', margin: '8px auto 0' }} />
                </div>
              }
            >
              <div class="empty-state">
                <div class="empty-brand">
                  <Icon name="leaf" />
                  <span class="empty-title">{t().emptyTitle}</span>
                  <span class="empty-sub">{t().emptySub}</span>
                </div>
                <div class="starters">
                  <For each={starters()}>
                    {(item) => (
                      <button
                        class="starter"
                        type="button"
                        onClick={() => {
                          props.app.setDraft(item.title);
                          props.app.focusComposer();
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.sub}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          }
        >
          <div class="thread-inner" ref={inner}>
            <Index each={messages()}>
              {(message, index) => (
                <Message
                  app={props.app}
                  message={message()}
                  index={index}
                  live={state.running && index === messages().length - 1 && message().role === 'assistant'}
                />
              )}
            </Index>
            <Show when={plan() && plan()!.status !== 'cancelled'}>
              <section class={`plan-card ${plan()!.status}`}>
                <header class="plan-head">
                  <Icon name="list" />
                  <h3>{t().plan}</h3>
                  <span class="spacer" />
                  <span class={`tag ${plan()!.status === 'approved' ? 'ok' : 'warn'}`}>
                    {plan()!.status === 'pending' ? '等待批准' : '已批准'}
                  </span>
                </header>
                <Show when={plan()!.summary}>
                  <div class="plan-summary md" innerHTML={renderMarkdown(plan()!.summary!)} />
                </Show>
                <Show when={plan()!.items?.length}>
                  <ol class="plan-items">
                    <For each={plan()!.items}>
                      {(item, index) => (
                        <li class="plan-item">
                          <span class="plan-index">{String(index() + 1).padStart(2, '0')}</span>
                          <span class="plan-text">{item.text}</span>
                          <span class="plan-state">{item.status === 'done' ? '完成' : '待办'}</span>
                        </li>
                      )}
                    </For>
                  </ol>
                </Show>
                <Show when={plan()!.status === 'pending'}>
                  <div class="plan-actions">
                    <button class="btn sm" type="button" onClick={() => void props.app.cancelPlan()}>
                      {t().cancel}
                    </button>
                    <button class="btn sm primary" type="button" onClick={() => void props.app.approvePlan()}>
                      {t().approve}
                    </button>
                  </div>
                </Show>
              </section>
            </Show>
          </div>
        </Show>
      </div>

      <button
        class={`jump${showJump() ? ' show' : ''}`}
        type="button"
        title="回到最新"
        tabIndex={showJump() ? 0 : -1}
        onClick={() => toBottom(true)}
      >
        <Icon name="arrowDown" />
      </button>
    </>
  );
}

export function ApprovalBar(props: { app: AppState }) {
  const { state, t } = props.app;
  return (
    <Show when={state.approval}>
      {(request) => (
        <div class="approval" role="alert">
          <Icon name="shield" />
          <span class="grow" title={request().summary}>
            {t().approvalNeed}：{request().summary || request().id}
          </span>
          <button class="btn sm" type="button" onClick={() => props.app.answerApproval(false)}>
            {t().deny}
          </button>
          <button class="btn sm primary" type="button" onClick={() => props.app.answerApproval(true)}>
            {t().alwaysAllow}
          </button>
        </div>
      )}
    </Show>
  );
}
