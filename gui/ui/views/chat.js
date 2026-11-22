import { create, formatNumber, throttle } from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { createProcessGroup, createReasonRow, createToolRow } from './reasoning.js';
import { processStatusFromStop } from '../reasoning-utils.js';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('banana-ui-prefs') || '{}');
  } catch {
    return {};
  }
}

function summaryOf(input) {
  if (!input || typeof input !== 'object') return '';
  return Object.entries(input)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        const flat = value.replace(/\s+/g, ' ');
        return `${key}=${flat.length > 60 ? `"${flat.slice(0, 60)}…"` : `"${flat}"`}`;
      }
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(', ')
    .slice(0, 140);
}

export function createChatView({ conversation, messagesEl, emptyEl, scrollButton, actions }) {
  let current = null;
  let stick = true;
  let lastTurnMeta = null;
  let lastTurnDuration = 0;
  let lastTurnStatus = 'done';
  let completedProcesses = [];

  function nearBottom() {
    return conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 90;
  }

  function scrollToBottom(force = false) {
    if (force || stick) {
      conversation.scrollTop = conversation.scrollHeight;
      stick = true;
      scrollButton.classList.remove('show');
    }
  }

  conversation.addEventListener('scroll', () => {
    stick = nearBottom();
    scrollButton.classList.toggle('show', !stick);
  });
  scrollButton.addEventListener('click', () => {
    stick = true;
    scrollToBottom(true);
  });

  function userMessage(content, images = []) {
    const wrap = create('div', 'message message-user message-enter');
    if (images.length) {
      const row = create('div', 'user-images');
      for (const src of images) {
        const image = create('img');
        image.src = src;
        image.alt = '附加图片';
        row.append(image);
      }
      wrap.append(row);
    }
    wrap.append(create('div', 'user-bubble', content || '（仅图片）'));
    return wrap;
  }

  function textBlock(content = '') {
    const element = create('div', 'message-body message-enter');
    element.replaceChildren(renderMarkdown(content));
    return { element, queue: content };
  }

  function appendMeta(flow, text) {
    if (!text || !flow) return;
    flow.append(create('div', 'turn-meta', text));
  }

  function ensureProcess(flow) {
    if (flow._process) return flow._process;
    const process = createProcessGroup({ open: true });
    flow._process = process;
    flow.append(process.root);
    return process;
  }

  function ensureReason(flow) {
    const process = ensureProcess(flow);
    if (process._reason) return process._reason;
    const reason = createReasonRow({ text: '', running: true });
    process._reason = reason;
    process.stack.prepend(reason.root);
    return reason;
  }

  function endStreamingText() {
    if (!current) return;
    current.textBlock = null;
  }

  function beginTurn(input, images) {
    lastTurnMeta = null;
    lastTurnDuration = 0;
    completedProcesses = [];
    messagesEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    messagesEl.append(userMessage(input, images));
    const flow = create('div', 'turn-flow');
    messagesEl.append(flow);
    current = {
      flow,
      process: null,
      reason: null,
      textBlock: null,
      tools: new Map(),
      startedAt: Date.now(),
      lastReasoningAt: Date.now(),
    };
    stick = true;
    scrollToBottom(true);
  }

  function text(delta) {
    if (!current) beginTurn('', []);
    if (!current.textBlock) {
      current.textBlock = textBlock('');
      current.flow.append(current.textBlock.element);
      const block = current.textBlock;
      block.render = throttle(() => {
        block.element.replaceChildren(renderMarkdown(block.queue));
      }, 45);
    }
    current.textBlock.queue += delta;
    current.textBlock.render();
    if (stick) scrollToBottom();
  }

  function reasoning(delta) {
    if (!current) beginTurn('', []);
    const reason = ensureReason(current.flow);
    current.reason = reason;
    current.lastReasoningAt = Date.now();
    reason.update(`${reason.raw()}${delta}`, true);
    if (stick) scrollToBottom();
  }

  function startTool(event) {
    if (!current) beginTurn('', []);
    const process = ensureProcess(current.flow);
    endStreamingText();
    const row = createToolRow({
      name: event.name,
      summary: event.summary || summaryOf(event.input),
      status: 'running',
    });
    row.pre.textContent = '等待输出…';
    current.tools.set(event.id, row);
    process.append(row.root);
    if (stick) scrollToBottom();
  }

  function toolOutput(event) {
    const row = current?.tools.get(event.id);
    if (!row) return;
    row.appendOutput(event.chunk ?? '');
    if (stick) scrollToBottom();
  }

  function endTool(event) {
    const row = current?.tools.get(event.id);
    if (!row) return;
    row.setStatus(event.ok ? 'ok' : 'fail', {
      durationMs: event.durationMs ?? 0,
      content: event.content ?? '',
      truncated: event.truncated,
    });
    if (stick) scrollToBottom();
  }

  function applyCollapse(process, status) {
    const prefs = readPrefs();
    if (!process || status === 'running') return;
    if (prefs.steps === 'detailed' || prefs.collapse === 'never') {
      process.setOpen(true);
      return;
    }
    if (process.userToggled()) return;
    if (prefs.collapse === 'auto') {
      window.setTimeout(() => {
        if (!process.userToggled()) process.setOpen(false);
      }, 1500);
    } else {
      process.setOpen(false);
    }
  }

  function turnEnd(event) {
    const status = processStatusFromStop(event.stopReason);
    lastTurnStatus = status;
    lastTurnDuration = event.elapsedMs ?? 0;
    if (current?.flow) {
      if (current.process) {
        current.process.setStatus(status, lastTurnDuration);
        if (current.reason) current.reason.finish();
        applyCollapse(current.process, status);
        completedProcesses.push(current.process);
      }
      const parts = [];
      if (status === 'stopped') parts.push('已停止');
      else if (status === 'error') parts.push('请求失败');
      else if (event.stopReason === 'max_steps') parts.push('达到步数上限');
      else if (event.stopReason === 'budget') parts.push('达到预算上限');
      else parts.push('完成');
      if (event.steps) parts.push(`${event.steps} 步`);
      if (event.elapsedMs) parts.push(`${(event.elapsedMs / 1000).toFixed(1)}s`);
      const input = event.usage?.inputTokens ?? 0;
      const output = event.usage?.outputTokens ?? 0;
      if (input || output) parts.push(`↑${formatNumber(input)} ↓${formatNumber(output)}`);
      if (event.contextTokens) parts.push(`上下文 ${formatNumber(event.contextTokens)}`);
      lastTurnMeta = parts.join(' · ');
      appendMeta(current.flow, lastTurnMeta);
      if (event.error && status === 'error') {
        const box = create('div', 'reasoning turn-error');
        box.append(create('div', 'reasoning-body', event.error));
        current.flow.append(box);
      }
    }
    if (readPrefs().replies === 'last') {
      for (const process of completedProcesses.slice(0, -1)) process.setOpen(false);
    }
    current = null;
    scrollToBottom();
    return messagesEl;
  }

  function optimisticError(message) {
    const box = create('div', 'reasoning turn-error');
    box.append(create('div', 'reasoning-body', message));
    messagesEl.append(box);
    scrollToBottom();
  }

  function renderProcessForTurn(flow) {
    const process = ensureProcess(flow);
    const prefs = readPrefs();
    process.setStatus('done', 0);
    process.setOpen(prefs.steps === 'detailed');
    return process;
  }

  function render(session) {
    messagesEl.replaceChildren();
    current = null;
    completedProcesses = [];
    const messages = session?.messages ?? [];
    if (!messages.length) {
      messagesEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    messagesEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    const resultMap = new Map();
    for (const message of messages) {
      if (message.role === 'tool' && message.toolCallId) resultMap.set(message.toolCallId, message);
    }
    let flow = null;
    let process = null;
    for (const message of messages) {
      if (message.role === 'user') {
        messagesEl.append(userMessage(message.content, message.images ?? []));
        flow = create('div', 'turn-flow');
        messagesEl.append(flow);
        process = null;
        continue;
      }
      if (!flow) {
        flow = create('div', 'turn-flow');
        messagesEl.append(flow);
      }
      if (message.role === 'assistant') {
        const hasReasoning = typeof message.reasoning === 'string' && message.reasoning.trim().length > 0;
        if (hasReasoning || message.toolCalls?.length) {
          if (!process) process = renderProcessForTurn(flow);
          if (hasReasoning) {
            const reason = createReasonRow({ text: message.reasoning, running: false });
            process.stack.prepend(reason.root);
          }
          for (const call of message.toolCalls ?? []) {
            const result = resultMap.get(call.id);
            const row = createToolRow({
              name: call.name,
              summary: summaryOf(call.input),
              status: result ? (result.isError ? 'fail' : 'ok') : 'ok',
            });
            if (result) {
              row.setStatus(result.isError ? 'fail' : 'ok', { content: result.content });
            }
            process.append(row.root);
          }
        }
        if (message.content) {
          const block = textBlock(message.content);
          flow.append(block.element);
        }
      }
    }
    // 空过程不占位；最后一轮有实时 duration 时重渲染后补回。
    for (const flowItem of messagesEl.querySelectorAll('.turn-flow')) {
      const itemProcess = flowItem._process;
      if (itemProcess && !itemProcess.hasContent()) itemProcess.root.remove();
    }
    if (lastTurnMeta && flow) appendMeta(flow, lastTurnMeta);
    if (lastTurnDuration > 0 && process) {
      process.setStatus(lastTurnStatus, lastTurnDuration);
    }
    if (session.plan) {
      const card = planCard(session.plan);
      if (card) messagesEl.append(card);
    }
    scrollToBottom(true);
  }

  function planCard(plan) {
    if (!plan) return null;
    const card = create('div', 'plan-card');
    const head = create('div', 'plan-head');
    head.append(create('span', 'plan-title', '计划'));
    const status =
      plan.status === 'pending' ? '等待批准 · Plan 模式不会改动文件' : plan.status === 'approved' ? '已批准' : '已取消';
    head.append(create('span', 'plan-status', status));
    card.append(head);
    if (plan.summary) card.append(create('div', 'plan-summary', plan.summary));
    const list = create('ol', 'plan-items');
    plan.items.forEach((item, index) => {
      const li = create('li', 'plan-item');
      li.append(create('span', 'plan-index', String(index + 1).padStart(2, '0')));
      const main = create('div', 'plan-item-main');
      main.append(create('div', '', item.text));
      const meta = [
        item.phase ? `阶段 ${item.phase}` : '',
        item.confidence ? `置信度 ${item.confidence}` : '',
        item.verify ? `验证 ${item.verify}` : '',
      ].filter(Boolean);
      if (meta.length) main.append(create('div', 'plan-item-meta', meta.join(' · ')));
      li.append(main);
      list.append(li);
    });
    card.append(list);
    if (plan.status === 'pending') {
      const actionsRow = create('div', 'plan-actions');
      const approve = create('button', 'btn primary', '批准并执行');
      approve.type = 'button';
      approve.addEventListener('click', () => actions.approvePlan?.());
      const modify = create('button', 'btn', '修改计划');
      modify.type = 'button';
      modify.addEventListener('click', () => actions.modifyPlan?.());
      const cancel = create('button', 'btn ghost', '取消');
      cancel.type = 'button';
      cancel.addEventListener('click', () => actions.cancelPlan?.());
      actionsRow.append(approve, modify, cancel);
      card.append(actionsRow);
    } else if (plan.status === 'approved') {
      const phases = [...new Set(plan.items.map((item) => item.phase).filter(Boolean))];
      if (phases.length > 1) {
        const actionsRow = create('div', 'plan-actions');
        const next = create('button', 'btn small', '下一阶段');
        next.type = 'button';
        next.disabled = !plan.currentPhase || phases.indexOf(plan.currentPhase) === phases.length - 1;
        next.addEventListener('click', () => actions.nextPhase?.());
        actionsRow.append(create('span', 'plan-status', `当前阶段：${plan.currentPhase ?? phases[0]}`), next);
        card.append(actionsRow);
      }
    }
    return card;
  }

  function resetMeta() {
    lastTurnMeta = null;
    lastTurnDuration = 0;
  }

  return {
    render,
    resetMeta,
    beginTurn,
    text,
    reasoning,
    startTool,
    toolOutput,
    endTool,
    turnEnd,
    optimisticError,
    planCard,
    scrollToBottom,
    lastMeta: () => lastTurnMeta,
  };
}
