import { create } from '../dom.js';
import { icon } from '../icons.js';

const overlayRoot = () => document.getElementById('overlay-root');
let activeModal = null;

function trapFocus(modal) {
  const handler = (event) => {
    if (event.key !== 'Tab') return;
    const nodes = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  modal.addEventListener('keydown', handler);
  return () => modal.removeEventListener('keydown', handler);
}

export function openModal({ title, subtitle = '', body, footer = null, wide = false, narrow = false, headerAction = null, onClose }) {
  if (activeModal) activeModal.close(false);
  const previousFocus = document.activeElement;
  const root = overlayRoot();
  const overlay = create('div', 'overlay');
  const modal = create('div', `modal${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}`);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title);
  const head = create('div', 'modal-head');
  const titleWrap = create('div');
  titleWrap.append(create('h2', 'modal-title', title));
  if (subtitle) titleWrap.append(create('p', 'modal-sub', subtitle));
  const close = create('button', 'icon-btn');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.innerHTML = icon('close');
  head.append(titleWrap);
  if (headerAction) head.append(headerAction);
  head.append(close);
  const bodyEl = create('div', 'modal-body');
  if (body) bodyEl.append(body);
  const footEl = create('div', 'modal-foot');
  if (footer) footEl.append(footer);
  modal.append(head, bodyEl, footEl);
  overlay.append(modal);
  root.replaceChildren(overlay);
  const untrap = trapFocus(modal);
  let closed = false;
  const closeFn = (restore = true) => {
    if (closed) return;
    closed = true;
    untrap();
    overlay.remove();
    activeModal = null;
    if (restore && previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    onClose?.();
  };
  close.addEventListener('click', () => closeFn());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeFn();
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeFn();
    }
  });
  requestAnimationFrame(() => {
    const focusable = modal.querySelector('input, textarea, select, button.primary, button');
    focusable?.focus();
  });
  activeModal = { close: closeFn, modal, body: bodyEl, footer: footEl };
  return activeModal;
}

export function isModalOpen() {
  return Boolean(activeModal);
}

export function closeModal() {
  if (activeModal) activeModal.close();
}

function diffView(text) {
  const wrap = create('div', 'diff');
  for (const raw of String(text).split('\n').slice(0, 400)) {
    const line = create('div', `diff-line${raw.startsWith('+') ? ' add' : raw.startsWith('-') ? ' del' : /^(\+\+\+|---|@@|新建|修改)/.test(raw) ? ' meta' : ''}`);
    line.textContent = raw || ' ';
    wrap.append(line);
  }
  return wrap;
}

const APPROVAL_COPY = {
  shell: {
    title: '执行命令',
    description: 'agent 请求在本地 shell 里运行一条命令。只有你允许后才会真正执行。',
    icon: 'terminal',
  },
  write: {
    title: '写入文件',
    description: 'agent 请求写入或修改文件。请先核对下面的路径和差异。',
    icon: 'edit',
  },
  network: {
    title: '访问网络',
    description: 'agent 请求访问外部网络。允许后才会发起请求。',
    icon: 'globe',
  },
};

function approvalDetail(approval) {
  const summary = String(approval.summary || '');
  const open = summary.indexOf('(');
  const tool = open > 0 ? summary.slice(0, open) : approval.kind;
  const args = open > 0 ? summary.slice(open + 1).replace(/\)$/, '') : summary;
  const command = /command="([^"]*)"/.exec(summary)?.[1];
  const path = /path="([^"]*)"/.exec(summary)?.[1];
  const url = /url="([^"]*)"/.exec(summary)?.[1];
  return { tool, args, command, path, url };
}

export function clearApproval() {
  const root = document.getElementById('approval-root');
  if (root) root.replaceChildren();
  document.querySelector('.composer-shell')?.classList.remove('approval-pending');
}

/**
 * DSH 风格的行内审批卡：出现在输入区上方，不用遮罩弹窗。
 * 返回 { close }；Esc/拒绝会 resolve false，允许会 resolve true。
 */
export function showApproval(approval, respond) {
  const root = document.getElementById('approval-root');
  const copy = APPROVAL_COPY[approval.kind] ?? APPROVAL_COPY.shell;
  const detail = approvalDetail(approval);
  const shell = document.querySelector('.composer-shell');
  shell?.classList.add('approval-pending');
  let answered = false;
  let settled = null;

  const finish = (value) => {
    if (answered) return;
    answered = true;
    card.classList.add('resolved');
    respond(value);
    settled = window.setTimeout(clearApproval, 260);
  };

  const card = create('div', 'approval-card');
  const strip = create('div', 'approval-strip');
  const mark = create('span', 'approval-mark');
  mark.innerHTML = icon('warning');
  strip.append(mark, create('span', '', '等待审批'), create('span', 'approval-kind', detail.tool));
  const body = create('div', 'approval-body');
  const heading = create('div', 'approval-heading');
  const headline = create('div', 'approval-headline', copy.title);
  const tag = create('span', 'approval-tag', '需要你的确认');
  heading.append(headline, tag);
  body.append(heading);
  body.append(create('p', 'approval-description', copy.description));
  if (detail.command) {
    const command = create('div', 'approval-command');
    command.append(create('span', 'approval-command-prefix', '$ '), create('code', '', detail.command));
    body.append(command);
  } else if (detail.url) {
    body.append(create('div', 'approval-command', detail.url));
  } else if (detail.path) {
    body.append(create('div', 'approval-command', detail.path));
  } else {
    body.append(create('div', 'approval-command', detail.args));
  }
  if (approval.preview) body.append(diffView(approval.preview));
  const actions = create('div', 'approval-actions');
  const hint = create('span', 'approval-hint', 'Enter 允许 · Esc 拒绝');
  const deny = create('button', 'btn', '拒绝');
  deny.type = 'button';
  const allow = create('button', 'btn primary', '允许一次');
  allow.type = 'button';
  deny.addEventListener('click', () => finish(false));
  allow.addEventListener('click', () => finish(true));
  actions.append(hint, create('span', 'approval-spacer'), deny, allow);
  card.append(strip, body, actions);
  card.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (event.target.closest('button')) return;
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  root.replaceChildren(card);
  requestAnimationFrame(() => allow.focus());
  return {
    close() {
      if (settled) clearTimeout(settled);
      clearApproval();
    },
  };
}

export function confirmDialog({ title, message, confirmLabel = '确定', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const body = create('p', 'settings-hint', message);
    const foot = create('div');
    const cancel = create('button', 'btn', '取消');
    cancel.type = 'button';
    const confirm = create('button', `btn ${danger ? 'danger' : 'primary'}`, confirmLabel);
    confirm.type = 'button';
    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
      modal.close();
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    foot.append(cancel, confirm);
    const modal = openModal({
      title,
      body,
      footer: foot,
      narrow: true,
      onClose: () => {
        if (!answered) {
          answered = true;
          resolve(false);
        }
      },
    });
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = '确定' }) {
  return new Promise((resolve) => {
    let answered = false;
    const body = create('div');
    const field = create('div', 'field');
    field.append(create('label', '', label));
    const input = create('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    field.append(input);
    body.append(field);
    const foot = create('div');
    const cancel = create('button', 'btn', '取消');
    cancel.type = 'button';
    const confirm = create('button', 'btn primary', confirmLabel);
    confirm.type = 'button';
    const finish = (result) => {
      if (answered) return;
      answered = true;
      resolve(result);
      modal.close();
    };
    cancel.addEventListener('click', () => finish(null));
    confirm.addEventListener('click', () => finish(input.value.trim() || null));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(input.value.trim() || null);
      }
    });
    foot.append(cancel, confirm);
    const modal = openModal({
      title,
      body,
      footer: foot,
      narrow: true,
      onClose: () => {
        if (!answered) {
          answered = true;
          resolve(null);
        }
      },
    });
    input.focus();
    input.select();
  });
}

export function showTrust(info, actions) {
  const body = create('div');
  const list = create('p', 'settings-hint', '这个工作区包含会影响 agent 行为的项目文件。加载前需要你确认：');
  body.append(list);
  const items = create('div', 'kbd-list');
  if (info.hasConfig) items.append(create('div', 'kbd-row', '.banana/config.json · 项目级配置'));
  if (info.hasPlugins) items.append(create('div', 'kbd-row', '.banana/tools · 项目插件'));
  if (info.hasAgentDoc) items.append(create('div', 'kbd-row', 'AGENT.md · 项目规则'));
  body.append(items);
  body.append(create('p', 'settings-hint', `路径：${info.workspace}`));
  const foot = create('div');
  const ignore = create('button', 'btn', '忽略');
  ignore.type = 'button';
  const trust = create('button', 'btn primary', '信任并加载');
  trust.type = 'button';
  ignore.addEventListener('click', () => {
    modal.close();
    actions.onIgnore?.();
  });
  trust.addEventListener('click', () => {
    modal.close();
    actions.onTrust?.();
  });
  foot.append(ignore, trust);
  const modal = openModal({ title: '信任这个工作区？', body, footer: foot, narrow: true });
  return modal;
}

export function showAbout(info) {
  const body = create('div');
  const mark = create('div', 'about-mark');
  const logo = create('span', 'brand-mark');
  logo.innerHTML = icon('banana');
  mark.append(logo);
  const title = create('div');
  title.append(create('div', 'about-title', 'BananaGUI'), create('div', 'about-version', `v${info?.version ?? '0.8.26'} · BananaCLI`));
  mark.append(title);
  body.append(mark);
  body.append(
    create(
      'p',
      'about-text',
      '给 BananaCLI 的本地图形界面。默认深色，黄白黑配色，带一点香蕉味。聊天、工具、审批、计划、验收和终端都跑在同一个 CLI 内核上。',
    ),
  );
  body.append(create('p', 'settings-hint', '本地服务只绑定 127.0.0.1，所有请求都需要本次启动的 token。'));
  openModal({ title: '关于', body, narrow: true });
}

export function showShortcuts() {
  const body = create('div', 'kbd-list');
  const rows = [
    ['Enter', '发送消息'],
    ['Shift + Enter', '换行'],
    ['Esc', '停止回合 / 关闭弹层'],
    ['Ctrl / Cmd + K', '命令面板'],
    ['Ctrl / Cmd + B', '切换侧栏'],
    ['Ctrl / Cmd + J', '切换右侧面板'],
    ['Ctrl / Cmd + `', '切换终端'],
    ['/', '斜杠命令'],
    ['@', '文件补全'],
  ];
  for (const [key, label] of rows) {
    const row = create('div', 'kbd-row');
    row.append(create('span', '', label), create('span', 'kbd', key));
    body.append(row);
  }
  openModal({ title: '快捷键', body, narrow: true });
}

export function toast(message, level = 'ok', timeout = 3400) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const item = create('div', `toast ${level}`);
  const mark = create('span');
  mark.innerHTML = icon(level === 'error' ? 'x-circle' : level === 'warn' ? 'warning' : 'check-circle');
  item.append(mark, create('span', '', message));
  region.append(item);
  setTimeout(() => {
    item.remove();
  }, timeout);
}
