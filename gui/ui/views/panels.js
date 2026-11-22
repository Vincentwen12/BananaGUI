import { api } from '../api.js';
import { create, formatBytes, formatCost, formatNumber, relativeTime } from '../dom.js';
import { icon } from '../icons.js';
import { store } from '../store.js';

function section(title, extra) {
  const wrap = create('section', 'panel-section');
  const head = create('div', 'panel-section-title');
  head.append(create('span', '', title));
  if (extra) head.append(extra);
  wrap.append(head);
  return wrap;
}

export function createPanels({ body, tabs, actions }) {
  let tab = 'tasks';
  let tree = [];
  let treePath = '';
  let treeQuery = '';
  let preview = null;
  let loadingFiles = false;
  let filesLoaded = false;

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    setTab(button.dataset.tab);
  });

  function setTab(next) {
    tab = next;
    for (const button of tabs.querySelectorAll('[data-tab]')) {
      button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false');
    }
    actions.onTab?.(tab);
    if (tab !== 'terminal' && body.querySelector('.terminal-panel-host')) {
      body.replaceChildren();
      body.classList.remove('panel-terminal');
    }
    if (tab === 'files' && !filesLoaded) void loadTree('');
    render();
  }

  async function loadTree(path = '', force = false) {
    if (loadingFiles) return;
    loadingFiles = true;
    render();
    try {
      const result = await api.tree(path);
      tree = result.items ?? [];
      treePath = path;
      filesLoaded = true;
      if (force) preview = null;
    } catch (error) {
      actions.toast?.(error.message, 'error');
    } finally {
      loadingFiles = false;
      render();
    }
  }

  async function openFile(item) {
    try {
      const result = await api.file(item.path);
      preview = result;
      render();
    } catch (error) {
      actions.toast?.(error.message, 'error');
    }
  }

  function fileRow(item) {
    const row = create('button', 'file-row');
    row.type = 'button';
    const mark = create('span');
    mark.innerHTML = icon(item.type === 'dir' ? 'folder' : 'file-text');
    row.append(mark, create('span', 'file-name', item.name));
    if (item.type === 'file' && item.size) row.append(create('span', 'file-size', formatBytes(item.size)));
    row.addEventListener('click', () => {
      if (item.type === 'dir') void loadTree(item.path);
      else void openFile(item);
    });
    return row;
  }

  function filesPanel(state) {
    const frag = document.createDocumentFragment();
    const filter = create('input', 'file-filter');
    filter.placeholder = '过滤当前目录';
    filter.value = treeQuery;
    filter.addEventListener('input', () => {
      treeQuery = filter.value.trim().toLowerCase();
      render();
    });
    frag.append(filter);
    const crumb = create('div', 'panel-section-title');
    const up = create('button', 'btn small ghost', '..');
    up.type = 'button';
    up.disabled = !treePath;
    up.addEventListener('click', () => {
      const parent = treePath.split('/').slice(0, -1).join('/');
      treeQuery = '';
      void loadTree(parent);
    });
    const pathLabel = create('span', 'muted', treePath || shortName(state.info?.workspace));
    crumb.append(pathLabel, up);
    frag.append(crumb);
    if (loadingFiles) frag.append(create('div', 'panel-empty', '读取目录…'));
    else if (!tree.length) frag.append(create('div', 'panel-empty', '空目录'));
    else {
      const treeEl = create('div', 'file-tree');
      const filtered = treeQuery
        ? tree.filter((item) => item.name.toLowerCase().includes(treeQuery))
        : tree;
      for (const item of filtered) treeEl.append(fileRow(item));
      frag.append(treeEl);
    }
    if (preview) {
      const box = create('div', 'file-preview');
      const head = create('div', 'file-preview-head');
      head.append(create('span', 'file-name', preview.path), create('span', '', formatBytes(preview.bytes)));
      const insert = create('button', 'btn small', '引用');
      insert.type = 'button';
      insert.addEventListener('click', () => actions.insertText?.(`@${preview.path} `));
      head.append(insert);
      const pre = create('pre');
      pre.textContent = preview.binary
        ? '（二进制文件，无法预览）'
        : `${preview.content}${preview.truncated ? '\n…（预览已截断）' : ''}`;
      box.append(head, pre);
      frag.append(box);
    }
    return frag;
  }

  function tasksPanel(state) {
    const frag = document.createDocumentFragment();
    const plan = state.session?.plan;
    if (plan) {
      const box = section(plan.status === 'pending' ? '待批准计划' : '已批准计划');
      box.append(create('div', 'plan-summary', plan.summary || ''));
      const phases = [...new Set(plan.items.map((item) => item.phase).filter(Boolean))];
      if (phases.length) {
        const meta = create('div', 'plan-item-meta');
        meta.append(create('span', '', `当前阶段：${plan.currentPhase || phases[0]}`));
        meta.append(create('span', '', `共 ${phases.length} 个阶段`));
        box.append(meta);
      }
      if (plan.status === 'pending') {
        const row = create('div', 'plan-actions');
        const approve = create('button', 'btn small primary', '批准并执行');
        approve.type = 'button';
        approve.addEventListener('click', () => actions.approvePlan?.());
        const cancel = create('button', 'btn small ghost', '取消');
        cancel.type = 'button';
        cancel.addEventListener('click', () => actions.cancelPlan?.());
        row.append(approve, cancel);
        box.append(row);
      } else if (plan.status === 'approved' && phases.length > 1) {
        const row = create('div', 'plan-actions');
        const next = create('button', 'btn small', '下一阶段');
        next.type = 'button';
        next.disabled = !plan.currentPhase || phases.indexOf(plan.currentPhase) === phases.length - 1;
        next.addEventListener('click', () => actions.nextPhase?.());
        row.append(next);
        box.append(row);
      }
      frag.append(box);
    }
    const todos = state.session?.todos ?? [];
    const todoBox = section(`任务清单 ${todos.filter((item) => item.status === 'done').length}/${todos.length}`);
    if (!todos.length) todoBox.append(create('div', 'panel-empty', '还没有任务。Plan 批准后会自动生成。'));
    else {
      const list = create('div', 'todo-list');
      list.style.display = 'block';
      for (const item of todos) {
        const row = create('div', `todo-item ${item.status}`);
        const mark = create('span', 'todo-mark');
        mark.innerHTML = icon(item.status === 'done' ? 'check-circle' : item.status === 'in_progress' ? 'circle-half' : 'circle');
        row.append(mark, create('span', '', item.text));
        list.append(row);
      }
      todoBox.append(list);
    }
    frag.append(todoBox);
    const verification = state.session?.verification;
    const verifyBox = section('验收结果');
    if (!verification?.results?.length) {
      verifyBox.append(create('div', 'panel-empty', '还没有运行验收。'));
    } else {
      for (const result of verification.results) {
        const box = create('div', 'verify-result');
        const head = create('button', 'verify-head');
        head.type = 'button';
        const mark = create('span', `verify-mark ${result.ok ? 'ok' : 'fail'}`);
        mark.innerHTML = icon(result.ok ? 'check-circle' : 'x-circle');
        head.append(mark, create('span', 'verify-cmd', result.command), create('span', '', `${(result.ms / 1000).toFixed(1)}s`));
        head.addEventListener('click', () => box.classList.toggle('open'));
        const output = create('div', 'verify-output', result.output || '（无输出）');
        box.append(head, output);
        verifyBox.append(box);
      }
    }
    if (state.review) {
      verifyBox.append(create('div', 'panel-section-title', '独立审查'));
      verifyBox.append(create('div', 'plan-summary', state.review));
    }
    const actionsRow = create('div', 'settings-actions');
    for (const [label, iconName, handler] of [
      ['运行验收', 'play', () => actions.verify?.()],
      ['独立审查', 'shield', () => actions.review?.()],
      ['压缩上下文', 'layer', () => actions.compact?.()],
      ['撤销上一轮', 'undo', () => actions.undo?.()],
    ]) {
      const button = create('button', 'btn small');
      button.type = 'button';
      button.innerHTML = `${icon(iconName)}<span>${label}</span>`;
      button.addEventListener('click', handler);
      actionsRow.append(button);
    }
    verifyBox.append(actionsRow);
    frag.append(verifyBox);
    return frag;
  }

  function pluginsPanel(state) {
    const frag = document.createDocumentFragment();
    const tools = state.info?.tools ?? [];
    const plugins = tools.filter((tool) => !tool.builtin);
    const builtin = tools.filter((tool) => tool.builtin);
    for (const [title, list] of [
      ['项目 / 用户插件', plugins],
      ['内置工具', builtin],
    ]) {
      const box = section(title);
      if (!list.length) box.append(create('div', 'panel-empty', '没有插件。把 .mjs 放到 ~/.banana/tools/ 或已信任项目的 .banana/tools/。'));
      for (const tool of list) {
        const row = create('div', 'check-row');
        const input = create('input');
        input.type = 'checkbox';
        input.checked = tool.enabled;
        input.addEventListener('change', () => actions.toggleTool?.(tool.name, input.checked));
        const text = create('div');
        text.append(create('div', '', tool.name));
        text.append(create('div', 'field-help', `${tool.description} · 审批 ${tool.approval} / ${tool.permission}`));
        row.append(input, text);
        box.append(row);
      }
      frag.append(box);
    }
    return frag;
  }

  function infoPanel(state) {
    const frag = document.createDocumentFragment();
    const info = state.info;
    const session = state.session;
    const box = section('会话');
    const grid = create('div', 'info-grid');
    const rows = [
      ['标题', session?.title ?? '—'],
      ['会话', session?.id ?? '—'],
      ['工作区', info?.workspace ?? '—'],
      ['模型', info ? `${info.currentProvider} / ${info.model}` : '—'],
      ['消息', session ? `${session.messages.length} 条` : '—'],
      ['更新时间', session ? relativeTime(session.updatedAt) : '—'],
      ['上下文', state.usage?.contextTokens ? formatNumber(state.usage.contextTokens) : '—'],
      ['累计花费', formatCost(session?.usage?.costUsd ?? 0) || '—'],
    ];
    for (const [key, value] of rows) {
      const row = create('div', 'info-row');
      row.append(create('span', '', key), create('span', 'info-value', String(value)));
      grid.append(row);
    }
    box.append(grid);
    frag.append(box);
    const perm = section('权限');
    const permGrid = create('div', 'info-grid');
    for (const key of ['shell', 'write', 'network']) {
      const row = create('div', 'info-row');
      row.append(create('span', '', key), create('span', 'info-value', info?.permissions?.[key] ?? '—'));
      permGrid.append(row);
    }
    perm.append(permGrid);
    frag.append(perm);
    if (info?.agentDocPath) {
      const doc = section('项目规则');
      doc.append(create('div', 'field-help', info.agentDocPath));
      frag.append(doc);
    }
    if (state.agentDoc) {
      const doc = section('AGENT.md');
      const pre = create('pre', '', state.agentDoc.slice(0, 4000));
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.fontSize = '11px';
      pre.style.maxHeight = '220px';
      pre.style.overflow = 'auto';
      doc.append(pre);
      frag.append(doc);
    }
    const settings = create('button', 'btn small', '打开设置');
    settings.type = 'button';
    settings.addEventListener('click', () => actions.openSettings?.());
    frag.append(settings);
    return frag;
  }

  function shortName(path) {
    if (!path) return '工作区';
    return String(path).split(/[\\/]/).filter(Boolean).pop() || path;
  }

  function terminalPanel(state) {
    const wrap = create('div', 'terminal-panel');
    const bar = create('div', 'terminal-panel-head');
    const title = create('div', 'terminal-panel-title');
    title.append(create('span', '', '终端'), create('span', 'terminal-panel-cwd', shortName(state.info?.workspace)));
    const restart = create('button', 'btn small', '重启');
    restart.type = 'button';
    restart.addEventListener('click', () => actions.restartTerminal?.());
    bar.append(title, restart);
    const host = create('div', 'terminal-panel-host');
    wrap.append(bar, host);
    window.setTimeout(() => actions.mountTerminal?.(host), 0);
    return wrap;
  }

  function render(state = store) {
    // 终端 panel 已经挂载时不要再替换 host，否则每次状态刷新都会断开重连。
    if (tab === 'terminal' && body.querySelector('.terminal-panel-host')) {
      body.classList.add('panel-terminal');
      return;
    }
    body.replaceChildren();
    body.classList.toggle('panel-terminal', tab === 'terminal');
    if (tab === 'files') body.append(filesPanel(state));
    else if (tab === 'tasks') body.append(tasksPanel(state));
    else if (tab === 'plugins') body.append(pluginsPanel(state));
    else if (tab === 'terminal') body.append(terminalPanel(state));
    else body.append(infoPanel(state));
  }

  return {
    render,
    setTab,
    openTab(next) {
      setTab(next);
    },
    refreshFiles() {
      filesLoaded = false;
      tree = [];
      preview = null;
      treePath = '';
      if (tab === 'files') void loadTree('');
    },
  };
}
