import { create, throttle } from '../dom.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import {
  processLabel,
  stripReasoningSignature,
  summaryOf,
} from '../reasoning-utils.js';

export function createShimmer(text, active = true) {
  const wrap = create('span', 'shimmer');
  const base = create('span', 'shimmer-base', text);
  wrap.append(base);
  let sweep = null;
  if (active) {
    sweep = create('span', 'shimmer-sweep', text);
    sweep.setAttribute('aria-hidden', 'true');
    wrap.append(sweep);
  }
  return {
    element: wrap,
    setText(next) {
      base.textContent = next;
      if (sweep) sweep.textContent = next;
    },
    setActive(next) {
      if (next && !sweep) {
        sweep = create('span', 'shimmer-sweep', base.textContent);
        sweep.setAttribute('aria-hidden', 'true');
        wrap.append(sweep);
      } else if (!next && sweep) {
        sweep.remove();
        sweep = null;
      }
    },
  };
}

function spinner() {
  const wrap = create('span', 'tool-status');
  wrap.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<circle class="spinner-track" cx="12" cy="12" r="9.5" opacity="0.25"></circle>' +
    '<circle class="spinner-arc" cx="12" cy="12" r="9.5" stroke-dasharray="12 150"></circle>' +
    '</svg>';
  wrap.querySelector('svg')?.classList.add('spinner-ring');
  return wrap;
}

export function createProcessGroup({ open = true, onToggle } = {}) {
  const root = create('div', 'process');
  const head = create('button', 'process-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
  const label = create('span', 'process-label');
  const duration = create('span', 'process-duration');
  const chevron = create('span', 'process-chevron');
  chevron.innerHTML = icon('chevron-down');
  head.append(label, duration, chevron);
  const body = create('div', 'process-body');
  const inner = create('div');
  const stack = create('div', 'process-stack');
  inner.append(stack);
  body.append(inner);
  root.append(head, body);
  let userToggled = false;
  let isOpen = open;
  let status = 'running';
  let durationMs = 0;

  const applyOpen = (next) => {
    isOpen = next;
    root.classList.toggle('open', next);
    head.setAttribute('aria-expanded', next ? 'true' : 'false');
  };
  applyOpen(open);

  const updateScrollMask = () => {
    inner.classList.toggle('scrollable', inner.scrollHeight > inner.clientHeight + 1);
  };
  inner.addEventListener('scroll', updateScrollMask, { passive: true });

  const refresh = () => {
    label.textContent = processLabel(status, durationMs);
    duration.textContent = '';
    if (status === 'done' && durationMs > 0) {
      label.textContent = '已完成分析';
      duration.textContent = ` · 用时 ${processLabel('done', durationMs).split('用时 ')[1] ?? ''}`;
    }
    root.dataset.status = status;
  };
  refresh();

  head.addEventListener('click', () => {
    userToggled = true;
    applyOpen(!isOpen);
    onToggle?.(isOpen);
    updateScrollMask();
  });

  return {
    root,
    stack,
    head,
    isOpen: () => isOpen,
    userToggled: () => userToggled,
    setOpen(next) {
      applyOpen(next);
      updateScrollMask();
    },
    setStatus(nextStatus, nextDuration = 0) {
      status = nextStatus;
      durationMs = nextDuration;
      refresh();
    },
    setRunning() {
      status = 'running';
      durationMs = 0;
      refresh();
    },
    append(child) {
      stack.append(child);
    },
    hasContent: () => stack.childElementCount > 0,
    refreshMask: updateScrollMask,
  };
}

export function createReasonRow({ text = '', running = true } = {}) {
  const root = create('div', 'reason-row');
  const head = create('button', 'reason-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');
  const leading = create('span', 'reason-leading');
  const think = create('span', 'reason-icon');
  think.innerHTML = icon('brain');
  const chevron = create('span', 'reason-chevron');
  chevron.innerHTML = icon('chevron-down');
  leading.append(think, chevron);
  const title = create('span', 'reason-title', '思考');
  const sep = create('span', 'reason-sep');
  const summaryWrap = create('span', 'reason-summary');
  const shimmer = createShimmer('', running);
  summaryWrap.append(shimmer.element);
  head.append(leading, title, sep, summaryWrap);
  const body = create('div', 'reason-body');
  const bodyInner = create('div');
  const markdown = create('div', 'markdown-compact');
  bodyInner.append(markdown);
  body.append(bodyInner);
  root.append(head, body);

  let raw = stripReasoningSignature(text);
  let isOpen = false;
  let isRunning = running;
  const renderBody = throttle(() => {
    markdown.replaceChildren(renderMarkdown(raw));
  }, 60);

  const refreshSummary = () => {
    const summary = summaryOf(raw, isRunning);
    summaryWrap.style.display = summary ? '' : 'none';
    sep.style.display = summary ? '' : 'none';
    shimmer.setText(summary);
    shimmer.setActive(isRunning && Boolean(summary));
  };

  const setOpen = (next) => {
    isOpen = next;
    root.classList.toggle('open', next);
    head.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) renderBody();
  };

  head.addEventListener('click', () => setOpen(!isOpen));

  if (raw) {
    refreshSummary();
    if (isOpen) renderBody();
  } else {
    summaryWrap.style.display = 'none';
    sep.style.display = 'none';
  }

  return {
    root,
    head,
    isOpen: () => isOpen,
    setOpen,
    update(nextText, nextRunning = true) {
      raw = stripReasoningSignature(nextText);
      isRunning = nextRunning;
      refreshSummary();
      if (isOpen) renderBody();
    },
    finish() {
      isRunning = false;
      refreshSummary();
    },
    raw: () => raw,
  };
}

export function createToolRow({ name, summary = '', status = 'running' }) {
  const root = create('div', `tool-row ${status}`);
  const head = create('button', 'tool-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');
  let statusEl = status === 'running' ? spinner() : create('span', 'tool-status');
  if (status !== 'running') {
    statusEl.innerHTML = icon(status === 'ok' ? 'check-circle' : 'x-circle');
  }
  const nameEl = create('span', 'tool-name', name);
  const summaryEl = create('span', 'tool-summary', summary);
  const durationEl = create('span', 'tool-duration');
  head.append(statusEl, nameEl, summaryEl, durationEl);
  const body = create('div', 'tool-body');
  const pre = create('pre');
  body.append(pre);
  root.append(head, body);
  let open = false;
  const setOpen = (next) => {
    open = next;
    root.classList.toggle('open', next);
    head.setAttribute('aria-expanded', next ? 'true' : 'false');
  };
  head.addEventListener('click', () => setOpen(!open));
  return {
    root,
    pre,
    setOpen,
    setStatus(nextStatus, { durationMs = 0, content = '', truncated = false } = {}) {
      root.classList.remove('running', 'ok', 'fail');
      root.classList.add(nextStatus);
      statusEl.remove();
      statusEl = create('span', 'tool-status');
      statusEl.innerHTML = icon(nextStatus === 'ok' ? 'check-circle' : 'x-circle');
      head.prepend(statusEl);
      durationEl.textContent = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '';
      if (content) {
        pre.textContent = content;
        pre.classList.toggle('tool-error', nextStatus === 'fail');
      }
      if (truncated) pre.textContent += '\n…（输出已截断）';
      if (nextStatus === 'fail') setOpen(true);
    },
    appendOutput(chunk) {
      if (pre.textContent === '等待输出…') pre.textContent = '';
      pre.textContent += chunk ?? '';
    },
  };
}
