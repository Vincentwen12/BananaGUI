import { api, connectSocket } from './api.js';
import {
  activeWorkspace,
  isImageDataUrl,
  setState,
  setLang as setStoreLang,
  setTheme as setStoreTheme,
  store,
  workspaces,
} from './store.js';
import { create, download, formatNumber, qs, qsa, relativeTime, shortPath, copyText } from './dom.js';
import { icon, hydrateIcons } from './icons.js';
import { applyTheme } from './theme.js';
import { setLanguage, t } from './i18n.js';
import { createSidebar } from './views/sidebar.js';
import { createChatView } from './views/chat.js';
import { createPanels } from './views/panels.js';
import { createTerminal } from './views/terminal.js';
import { showSettings } from './views/settings.js';
import {
  clearApproval,
  confirmDialog,
  promptDialog,
  showAbout,
  showApproval,
  showShortcuts,
  showTrust,
  toast,
} from './views/dialogs.js';
import {
  atQuery,
  autoResize,
  insertAtCursor,
  readImageFile,
  renderAttachments,
  replaceRange,
  slashQuery,
  updateComposer,
} from './views/composer.js';

const elements = {
  sidebar: qs('#sidebar'),
  sidebarToggle: qs('#sidebar-toggle'),
  sidebarScrim: qs('#sidebar-scrim'),
  workspaceList: qs('#workspace-list'),
  workspaceSearch: qs('#workspace-search'),
  workspaceSearchInput: qs('#workspace-search-input'),
  workspaceSearchToggle: qs('#workspace-search-toggle'),
  workspaceFilter: qs('#workspace-filter'),
  addWorkspace: qs('#add-workspace'), // ui-allow: token-color-only
  newSession: qs('#new-session'),
  importSession: qs('#import-session'),
  importInput: qs('#import-input'),
  main: qs('#main'),
  mainWrap: qs('#main-wrap'),
  conversation: qs('#conversation'),
  emptyView: qs('#empty-view'),
  messages: qs('#messages'),
  scrollLatest: qs('#scroll-latest'),
  onboarding: qs('#onboarding'),
  onboardingText: qs('#onboarding-text'),
  onboardingOpen: qs('#onboarding-open'),
  crumbs: qs('#crumbs'),
  sessionTabs: qs('#session-tabs'),
  sessionMore: qs('#session-more'),
  statusBar: qs('#status-bar'),
  statusLeft: qs('#status-left'),
  statusRight: qs('#status-right'),
  panelToggle: qs('#panel-toggle'),
  panelClose: qs('#panel-close'),
  sidePanel: qs('#side-panel'),
  panelBody: qs('#panel-body'),
  panelTabs: qs('#panel-tabs'),
  composer: qs('#composer'),
  prompt: qs('#prompt'),
  send: qs('#send-btn'),
  attach: qs('#attach-image'),
  imageInput: qs('#image-input'),
  attachmentRow: qs('#attachment-row'),
  modeBtn: qs('#mode-btn'),
  modeLabel: qs('#mode-label'),
  modelBtn: qs('#model-btn'),
  modelLabel: qs('#model-label'),
  reasoningLabel: qs('#reasoning-label'),
  workspaceMenuBtn: qs('#workspace-menu-btn'),
  contextWorkspace: qs('#context-workspace'),
  reasoningMenuBtn: qs('#reasoning-menu-btn'),
  contextReasoning: qs('#context-reasoning'),
  composerHint: qs('#composer-hint'),
  composerUsage: qs('#composer-usage'),
  todoBar: qs('#todo-bar'),
  todoHead: qs('#todo-head'),
  todoCount: qs('#todo-count'),
  todoProgress: qs('#todo-progress span'),
  todoList: qs('#todo-list'),
  terminalDrawer: qs('#terminal-drawer'),
  terminalHost: qs('#terminal-host'),
  terminalToggle: qs('#terminal-toggle'),
  terminalClose: qs('#terminal-close'),
  terminalRestart: qs('#terminal-restart'),
  connectionDot: qs('#connection-dot'),
  connectionLabel: qs('#connection-label'),
  menuRoot: qs('#menu-root'),
  completionRoot: qs('#completion-root'),
};

let sidebar;
let chat;
let panels;
let terminal;
let socket = null;
let wsReady = false;
let everConnected = false;
let trustShownFor = '';
let lastRenderedSessionId = '';
let currentMenu = null;
let completion = null;
let palette = null;
let lastInput = '';
let draftTimer = null;
let connectAttempts = 0;
let openTabs = [];
let pluginsPage = null;
let hoverTimer = null;
let hoverCard = null;
let hoveredSession = null;

const actions = {
  onSession: (id) => {
    hideSessionCard();
    void activateSession(id);
  },
  onWorkspace: (workspace) => void selectWorkspace(workspace),
  onSessionMenu: (session, x, y) => openSessionMenu(session, x, y),
  onSessionHover: (session, rect) => scheduleSessionCard(session, rect),
  onSessionHoverEnd: () => scheduleHideSessionCard(),
  onCopyWorkspace: (workspace) => void copyWorkspace(workspace),
  approvePlan: () => void runAction(() => api.approvePlan(), '已批准计划'),
  cancelPlan: () => void runAction(() => api.cancelPlan(), '已取消计划'),
  nextPhase: () => void runAction(() => api.phase('next'), '已切换阶段'),
  verify: () => void runAction(() => api.verify(), '验收已开始', true),
  review: () => void runAction(() => api.review(), '审查中…', true),
  compact: () => void runAction(() => api.compact(), '压缩完成'),
  undo: () => void runAction(() => api.undo(), '已回滚'),
  toggleTool: (name, enabled) => void toggleTool(name, enabled),
  insertText: (text) => insertComposer(text),
  openSettings: () => showSettings({ actions: settingsActions }),
  toast,
  saveSettings: (patch, notify = true) => saveSettings(patch, notify),
  testConnection: (name) => api.testConnection(name),
  trustProject: () => void trustWorkspace(),
  setTheme: (mode) => applyThemeMode(mode),
  setLanguage: (language) => changeLanguage(language),
  applyUiPrefs: () => applyUiPrefs(),
  closeSettings: () => {},
  onTab: (tab) => {
    setState({ panels: { ...store.panels, tab } });
    if (tab !== 'terminal') terminal?.close();
  },
  mountTerminal: (host) => {
    terminal?.open(host);
  },
  restartTerminal: () => {
    terminal?.restart();
  },
};

const settingsActions = {
  ...actions,
  closeSettings: () => {
    const overlay = qs('#overlay-root');
    if (overlay) overlay.replaceChildren();
  },
};

function boot() {
  hydrateIcons();
  qs('#brand-mark').innerHTML = icon('banana');
  qs('#welcome-mark').innerHTML = icon('banana');
  qs('#new-session-icon').innerHTML = icon('plus');
  qs('#import-session').innerHTML = icon('upload');
  qs('#workspace-search-toggle').innerHTML = icon('search');
  qs('#workspace-filter').innerHTML = icon('filter');
  qs('#add-workspace').innerHTML = icon('folder-plus'); // ui-allow: token-color-only
  qs('#sidebar-toggle').innerHTML = icon('sidebar');
  qs('#panel-toggle').innerHTML = icon('panel');
  qs('#session-more').innerHTML = icon('ellipsis');
  qs('#panel-close').innerHTML = icon('close');
  qs('#terminal-toggle').innerHTML = icon('terminal');
  qs('#terminal-close').innerHTML = icon('close');
  qs('#terminal-restart').innerHTML = icon('refresh');
  qs('#scroll-latest').innerHTML = icon('arrow-down');
  for (const button of qsa('[data-window]')) {
    const action = button.dataset.window;
    button.innerHTML = icon(action === 'minimize' ? 'minimize' : action === 'maximize' ? 'maximize' : 'close');
  }
  qs('#onboarding').querySelector('[data-icon]')?.replaceWith(create('span', '', ''));
  const onboardingIcon = qs('#onboarding span');
  if (onboardingIcon) onboardingIcon.innerHTML = icon('warning');
  setState({ theme: store.theme });

  sidebar = createSidebar({ list: elements.workspaceList, actions });
  chat = createChatView({
    conversation: elements.conversation,
    messagesEl: elements.messages,
    emptyEl: elements.emptyView,
    scrollButton: elements.scrollLatest,
    actions,
  });
  panels = createPanels({ body: elements.panelBody, tabs: elements.panelTabs, actions });
  terminal = createTerminal({
    onStatus: () => toast('终端已连接', 'ok'),
  });

  bindEvents();
  void start();
}

async function start() {
  try {
    const data = await api.bootstrap();
    applyBootstrap(data);
    const params = new URLSearchParams(location.search);
    if (params.get('terminal') === '1') setTerminal(true);
    if (params.get('plugins') === '1') openPluginsPage();
    if (params.get('settings') === '1') showSettings({ actions: settingsActions });
  } catch (error) {
    toast(error.message, 'error', 6000);
    elements.connectionLabel.textContent = '未连接';
    elements.connectionDot.className = 'dot bad';
  }
  connect();
}

function connect() {
  const client = connectSocket({
    onEvent: handleEvent,
    onOpen: () => {
      wsReady = true;
      connectAttempts = 0;
      if (everConnected) client.send({ type: 'resync' });
      everConnected = true;
      setConnection('online');
    },
    onClose: () => {
      wsReady = false;
      setConnection('offline');
    },
    onStatus: (status) => {
      if (status === 'reconnecting') {
        connectAttempts += 1;
        setConnection('reconnecting');
      }
    },
  });
  socket = client;
  setConnection('connecting');
}

function setConnection(status) {
  elements.connectionDot.className = 'dot';
  if (status === 'online') {
    elements.connectionDot.classList.add('ok');
    elements.connectionLabel.textContent = '本地';
  } else if (status === 'reconnecting') {
    elements.connectionDot.classList.add('warn');
    elements.connectionLabel.textContent = '重连中';
  } else if (status === 'offline') {
    elements.connectionDot.classList.add('bad');
    elements.connectionLabel.textContent = '已断开';
  } else {
    elements.connectionDot.classList.add('warn');
    elements.connectionLabel.textContent = '连接中';
  }
}

function applyBootstrap(data) {
  if (!data?.info || !data?.session) return;
  if (lastRenderedSessionId && lastRenderedSessionId !== data.session.id && !store.running) {
    chat?.resetMeta?.();
  }
  lastRenderedSessionId = data.session.id;
  setState({
    info: data.info,
    sessions: data.sessions ?? [],
    session: data.session,
    agentDoc: data.agentDoc ?? '',
    trust: data.info.trust,
  });
  rememberTab(data.session);
  renderAll(true);
  maybeTrust();
}

function renderAll(renderChat = false) {
  if (!store.info || !store.session) return;
  renderChrome();
  sidebar.render();
  panels.render();
  renderTodos();
  renderComposer();
  renderOnboarding();
  if (renderChat && !store.running) {
    chat.render(store.session);
    elements.main.classList.toggle('is-empty', !store.session.messages.length);
  }
}

function renderChrome() {
  const session = store.session;
  const workspace = activeWorkspace();
  elements.main.classList.toggle('is-empty', !session?.messages.length);
  elements.panelToggle.setAttribute('aria-pressed', elements.mainWrap.classList.contains('panel-open') ? 'true' : 'false');
  elements.terminalToggle.setAttribute('aria-pressed', elements.main.classList.contains('terminal-open') ? 'true' : 'false');
  const provider = store.info?.providers?.find((item) => item.name === store.info.currentProvider);
  if (provider && !provider.hasKey && provider.keySource !== 'local') {
    elements.modelLabel.textContent = '未配置 API Key';
  }
  renderTabs();
  renderStatus();
}

function rememberTab(session) {
  if (!session?.id) return;
  openTabs = [session.id, ...openTabs.filter((id) => id !== session.id)].slice(0, 6);
  renderTabs();
}

function sessionById(id) {
  if (store.session?.id === id) return store.session;
  return store.sessions.find((item) => item.id === id);
}

function renderTabs() {
  if (!elements.sessionTabs) return;
  elements.sessionTabs.replaceChildren();
  for (const id of openTabs) {
    const session = sessionById(id);
    if (!session) continue;
    const tab = create('div', `session-tab${store.session?.id === id ? ' active' : ''}`);
    tab.title = session.title || '新对话';
    const button = create('button', 'session-tab-main');
    button.type = 'button';
    button.append(create('span', 'tab-title', session.title || '新对话'));
    button.addEventListener('click', () => void activateSession(id));
    const close = create('button', 'tab-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭标签');
    close.innerHTML = icon('close');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(id);
    });
    tab.append(button, close);
    elements.sessionTabs.append(tab);
  }
}

function closeTab(id) {
  openTabs = openTabs.filter((item) => item !== id);
  if (store.session?.id !== id) {
    renderTabs();
    return;
  }
  const next = openTabs[0];
  if (next) void activateSession(next);
  else void newSession();
}

function renderStatus() {
  if (!elements.statusLeft || !elements.statusRight) return;
  const session = store.session;
  const messages = session?.messages ?? [];
  const rounds = messages.filter((message) => message.role === 'user').length;
  const tools = messages.reduce((total, message) => total + (message.toolCalls?.length ?? 0), 0);
  const context = store.usage?.contextTokens;
  const usage = session?.usage;
  const mode = session?.mode === 'plan' ? 'Plan' : 'Build';
  elements.statusLeft.replaceChildren(
    create('span', '', `${rounds} 轮`),
    create('span', '', `${tools} 次工具`),
    create('span', '', mode),
    create('span', '', store.running ? '运行中' : '空闲'),
  );
  elements.statusRight.replaceChildren(
    create('span', '', store.info ? `${store.info.currentProvider} / ${store.info.model}` : ''),
    create('span', '', context ? `上下文 ${formatNumber(context)}` : `消息 ${messages.length}`),
    create('span', '', `↑${formatNumber(usage?.inputTokens ?? 0)} ↓${formatNumber(usage?.outputTokens ?? 0)}`),
    create('span', '', usage?.costUsd ? `≈$${usage.costUsd.toFixed(4)}` : '本地'),
  );
}

function renderComposer() {
  updateComposer(store, {
    textarea: elements.prompt,
    sendBtn: elements.send,
    modeLabel: elements.modeLabel,
    modelLabel: elements.modelLabel,
    reasoningLabel: elements.reasoningLabel,
    contextWorkspace: elements.contextWorkspace,
    contextReasoning: elements.contextReasoning,
    hint: elements.composerHint,
    usage: elements.composerUsage,
  });
  renderAttachments(elements.attachmentRow, store.images, (index) => {
    store.images.splice(index, 1);
    setState({ images: store.images });
    renderAttachments(elements.attachmentRow, store.images, (i) => removeImage(i));
    updateComposer(store, composerElements());
  });
  autoResize(elements.prompt);
}

function composerElements() {
  return {
    textarea: elements.prompt,
    sendBtn: elements.send,
    modeLabel: elements.modeLabel,
    modelLabel: elements.modelLabel,
    reasoningLabel: elements.reasoningLabel,
    contextWorkspace: elements.contextWorkspace,
    contextReasoning: elements.contextReasoning,
    hint: elements.composerHint,
    usage: elements.composerUsage,
  };
}

function removeImage(index) {
  store.images.splice(index, 1);
  setState({ images: store.images });
  renderComposer();
}

function renderOnboarding() {
  const info = store.info;
  if (!info) return;
  const provider = info.providers.find((item) => item.name === info.currentProvider);
  const needsKey = Boolean(info.providerError) || (!provider?.hasKey && provider?.keySource !== 'local');
  elements.onboarding.classList.toggle('hidden', !needsKey);
  elements.onboardingText.textContent = info.providerError || '还没有配置 API Key，先设置模型才能开始。';
  const empty = store.session?.messages.length === 0;
  elements.emptyView.classList.toggle('hidden', !empty);
  if (empty) {
    elements.messages.classList.add('hidden');
  }
}

function renderTodos() {
  const todos = store.session?.todos ?? [];
  elements.todoBar.classList.toggle('hidden', todos.length === 0);
  if (!todos.length) return;
  const done = todos.filter((item) => item.status === 'done').length;
  elements.todoCount.textContent = `${done}/${todos.length}`;
  elements.todoProgress.style.width = `${Math.round((done / todos.length) * 100)}%`;
  elements.todoList.replaceChildren();
  for (const item of todos) {
    const li = create('li', `todo-item ${item.status}`);
    const mark = create('span', 'todo-mark');
    mark.innerHTML = icon(item.status === 'done' ? 'check-circle' : item.status === 'in_progress' ? 'circle-half' : 'circle');
    li.append(mark, create('span', '', item.text));
    elements.todoList.append(li);
  }
}

function maybeTrust() {
  const trust = store.info?.trust;
  if (!trust || trust.status !== 'pending') return;
  if (trustShownFor === trust.workspace) return;
  trustShownFor = trust.workspace;
  showTrust(trust, {
    onTrust: () => void trustWorkspace(),
    onIgnore: () => {
      toast('已忽略项目配置/插件/AGENT.md。', 'warn');
    },
  });
}

async function trustWorkspace() {
  try {
    const result = await api.trust();
    applyBootstrap({ info: result.info, sessions: store.sessions, session: result.session });
    toast('已信任并加载项目产物。', 'ok');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function activateSession(id) {
  if (!id) return;
  clearApproval();
  if (store.running) {
    toast('当前回合还在运行，先停止再切换。', 'warn');
    return;
  }
  saveDraft();
  try {
    const result = await api.activate(id);
    if (lastRenderedSessionId !== result.session.id) chat.resetMeta?.();
    lastRenderedSessionId = result.session.id;
    rememberTab(result.session);
    closePluginsPage();
    setState({ session: result.session });
    chat.render(result.session);
    elements.main.classList.toggle('is-empty', !result.session.messages.length);
    loadDraft();
    renderAll();
    closeMobileSidebar();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function selectWorkspace(workspace) {
  if (store.running) {
    toast('当前回合还在运行，先停止再切换工作区。', 'warn');
    return;
  }
  const target = workspace || store.info?.workspace;
  if (!target) return;
  if (target === activeWorkspace() && store.session?.workspace === target) return;
  try {
    const result = await api.workspace(target);
    closePluginsPage();
    setState({ session: result.session, info: result.info });
    chat.render(result.session);
    panels.refreshFiles();
    renderAll();
    loadDraft();
    closeMobileSidebar();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function addWorkspace() {
  const path = await promptDialog({
    title: '添加工作区',
    label: '目录绝对路径',
    value: store.info?.workspace ?? '',
    placeholder: '例如 D:\\projects\\my-app',
    confirmLabel: '打开',
  });
  if (!path) return;
  await selectWorkspace(path);
}

async function newSession(title = '新对话') {
  if (store.running) {
    toast('当前回合还在运行，先停止。', 'warn');
    return;
  }
  try {
    saveDraft();
    const result = await api.createSession({ title });
    chat.resetMeta?.();
    lastRenderedSessionId = result.session.id;
    rememberTab(result.session);
    closePluginsPage();
    setState({ session: result.session });
    chat.render(result.session);
    renderAll();
    elements.prompt.value = '';
    loadDraft();
    closeMobileSidebar();
    elements.prompt.focus();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteSession(session) {
  if (!session) return;
  const confirmed = await confirmDialog({
    title: '删除对话',
    message: `确定删除「${session.title}」？不可恢复。`,
    confirmLabel: '删除',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const result = await api.deleteSession(session.id);
    openTabs = openTabs.filter((id) => id !== session.id);
    rememberTab(result.session);
    setState({ session: result.session });
    chat.render(result.session);
    renderAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function renameSession(session) {
  if (!session) return;
  const title = await promptDialog({
    title: '重命名对话',
    label: '标题',
    value: session.title,
    confirmLabel: '保存',
  });
  if (!title) return;
  try {
    await api.patchSession(session.id, { title });
    if (session.id === store.session?.id) {
      setState({ session: { ...store.session, title } });
    }
    const result = await api.sessions();
    setState({ sessions: result.sessions, session: result.session });
    renderAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function toggleTool(name, enabled) {
  try {
    const result = await api.toggleTool(name, enabled);
    setState({ info: result.info });
    panels.render();
    toast(`${enabled ? '已启用' : '已禁用'} ${name}`, 'ok');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function saveSettings(patch, notify = true) {
  const result = await api.settings(patch);
  setState({ info: result.info, session: result.session });
  renderAll(true);
  if (notify) toast('设置已保存', 'ok');
  return result;
}

async function runAction(fn, success, quiet = false) {
  try {
    const result = await fn();
    if (result?.session) {
      setState({ session: result.session });
      renderAll(true);
    }
    if (result?.results) {
      setState({ verification: result.results });
    }
    if (typeof result?.text === 'string') {
      setState({ review: result.text });
      openPanel('tasks');
    }
    if (!quiet && success) toast(success, 'ok');
    return result;
  } catch (error) {
    toast(error.message, 'error', 5000);
  }
}

function composeMeta(event) {
  const parts = [];
  if (event.stopReason === 'aborted') parts.push('已中断');
  else if (event.stopReason === 'error') parts.push('请求失败');
  else if (event.stopReason === 'max_steps') parts.push('达到步数上限');
  else if (event.stopReason === 'budget') parts.push('达到预算上限');
  else parts.push('完成');
  if (event.steps) parts.push(`${event.steps} 步`);
  if (event.elapsedMs) parts.push(`${(event.elapsedMs / 1000).toFixed(1)}s`);
  const input = event.usage?.inputTokens ?? 0;
  const output = event.usage?.outputTokens ?? 0;
  if (input || output) parts.push(`↑${formatNumber(input)} ↓${formatNumber(output)}`);
  if (event.contextTokens) parts.push(`上下文 ${formatNumber(event.contextTokens)}`);
  return parts.join(' · ');
}

function handleEvent(event) {
  if (!event || typeof event.type !== 'string') return;
  switch (event.type) {
    case 'ready':
      applyBootstrap(event);
      break;
    case 'info':
      if (event.info) {
        setState({ info: event.info });
        renderAll();
        maybeTrust();
      }
      break;
    case 'sessions':
      if (Array.isArray(event.sessions)) {
        setState({ sessions: event.sessions });
        sidebar.render();
      }
      break;
    case 'session':
      if (event.session) {
        setState({ session: event.session });
        if (!store.running) {
          chat.render(event.session);
          elements.main.classList.toggle('is-empty', !event.session.messages.length);
          renderAll();
        }
      }
      break;
    case 'turn_start':
      setState({ running: true, activeTurn: event.turnId });
      updateComposer(store, composerElements());
      renderTodos();
      renderStatus();
      break;
    case 'step':
      break;
    case 'text':
      chat.text(event.delta ?? '');
      break;
    case 'reasoning':
      chat.reasoning(event.delta ?? '');
      break;
    case 'tool_start':
      chat.startTool(event);
      break;
    case 'tool_output':
      chat.toolOutput(event);
      break;
    case 'tool_end':
      chat.endTool(event);
      break;
    case 'notice':
      if (event.message) toast(event.message, event.level === 'warn' ? 'warn' : event.level === 'error' ? 'error' : 'ok');
      break;
    case 'retry':
      toast(`网络重试 ${event.attempt}：${event.reason}`, 'warn');
      break;
    case 'compact':
      if (!event.byUser) toast('已压缩历史上下文', 'ok');
      break;
    case 'approval_request':
      handleApproval(event);
      break;
    case 'approval_resolved':
      setState({ approvals: store.approvals.filter((item) => item.id !== event.id) });
      clearApproval();
      break;
    case 'turn_end':
      clearApproval();
      finishTurn(event);
      break;
    case 'verify_start':
      toast(`运行验收：${(event.commands ?? []).join('；')}`, 'warn', 5000);
      break;
    case 'verify':
      if (store.session) {
        store.session.verification = { at: event.at, results: event.results ?? [] };
      }
      setState({ verification: event.results, session: store.session });
      panels.render();
      openPanel('tasks');
      toast('验收完成，结果已写入会话。', 'ok');
      break;
    case 'review':
      setState({ review: event.text ?? '' });
      panels.render();
      openPanel('tasks');
      break;
    case 'undo':
      toast(`已回滚：恢复 ${event.restored ?? 0} 个，删除 ${event.deleted ?? 0} 个。`, 'ok');
      break;
    case 'error':
      clearApproval();
      toast(event.message, 'error', 6000);
      break;
    case 'pong':
      break;
    default:
      break;
  }
}

function finishTurn(event) {
  setState({ running: false, activeTurn: null, usage: { ...(store.usage || {}), contextTokens: event.contextTokens } });
  chat.turnEnd(event);
  updateComposer(store, composerElements());
  renderTodos();
  renderStatus();
  if (event.stopReason === 'error' && event.error) {
    toast(event.error, 'error', 6000);
  }
  const id = event.sessionId || store.session?.id;
  if (id) {
    window.setTimeout(async () => {
      try {
        const result = await api.session(id);
        setState({ session: result.session });
        if (!store.running) {
          chat.render(result.session);
          elements.main.classList.toggle('is-empty', !result.session.messages.length);
          renderAll();
        }
      } catch {
        // 保留当前视图
      }
    }, 120);
  }
}

function handleApproval(event) {
  setState({ approvals: [...store.approvals, event] });
  showApproval(event, (allow) => {
    socket?.send({ type: 'approval', id: event.id, allow });
    setState({ approvals: store.approvals.filter((item) => item.id !== event.id) });
  });
}

function sendMessage() {
  if (store.running) {
    clearApproval();
    socket?.send({ type: 'abort' });
    toast('已请求中断', 'warn');
    return;
  }
  const value = elements.prompt.value.trim();
  if (!value && !store.images.length) return;
  if (value.startsWith('/')) {
    elements.prompt.value = '';
    autoResize(elements.prompt);
    updateComposer(store, composerElements());
    void executeCommand(value);
    return;
  }
  if (!wsReady || !socket) {
    toast('与本地服务的连接还没就绪。', 'error');
    return;
  }
  lastInput = value;
  const images = store.images.map((image) => image.dataUrl).filter(Boolean);
  chat.beginTurn(value, images);
  const sent = socket.send({
    type: 'turn',
    input: value,
    images: images.length ? images : undefined,
    mode: store.session?.mode ?? 'build',
    reasoning: store.session?.reasoning ?? 'standard',
  });
  if (!sent) {
    toast('发送失败，连接未就绪。', 'error');
    return;
  }
  elements.prompt.value = '';
  setState({ images: [], running: true });
  renderComposer();
  saveDraft();
  autoResize(elements.prompt);
  elements.main.classList.remove('is-empty');
  elements.emptyView.classList.add('hidden');
  elements.messages.classList.remove('hidden');
  chat.scrollToBottom(true);
  elements.prompt.focus();
}

function insertComposer(text) {
  insertAtCursor(elements.prompt, text);
  elements.prompt.focus();
}

async function addImage(file) {
  try {
    const image = await readImageFile(file);
    store.images.push(image);
    setState({ images: store.images });
    renderComposer();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function bindEvents() {
  elements.newSession.addEventListener('click', () => void newSession());
  elements.importSession.addEventListener('click', () => elements.importInput.click());
  elements.importInput.addEventListener('change', () => void importSessionFile());
  elements.addWorkspace.addEventListener('click', () => void addWorkspace());
  elements.workspaceMenuBtn.addEventListener('click', (event) => openWorkspaceMenu(event.currentTarget));
  elements.reasoningMenuBtn.addEventListener('click', (event) => openReasoningMenu(event.currentTarget));
  elements.modeBtn.addEventListener('click', (event) => openModeMenu(event.currentTarget));
  elements.modelBtn.addEventListener('click', (event) => openModelMenu(event.currentTarget));
  elements.sessionMore.addEventListener('click', (event) => {
    const session = store.session;
    if (!session) return;
    const rect = event.currentTarget.getBoundingClientRect();
    openSessionMenu(session, rect.right, rect.bottom + 4);
  });
  elements.attach.addEventListener('click', () => elements.imageInput.click());
  elements.imageInput.addEventListener('change', async () => {
    for (const file of elements.imageInput.files ?? []) await addImage(file);
    elements.imageInput.value = '';
  });
  elements.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });
  elements.attach.addEventListener('click', () => elements.imageInput.click());
  elements.prompt.addEventListener('input', onPromptInput);
  elements.prompt.addEventListener('keydown', onPromptKeydown);
  elements.prompt.addEventListener('paste', onPromptPaste);
  elements.prompt.addEventListener('blur', () => saveDraft());
  elements.prompt.addEventListener('compositionstart', () => {
    elements.prompt.dataset.composing = 'true';
  });
  elements.prompt.addEventListener('compositionend', () => {
    delete elements.prompt.dataset.composing;
  });
  elements.composer.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.composer.classList.add('drag-over');
  });
  elements.composer.addEventListener('dragleave', () => elements.composer.classList.remove('drag-over'));
  elements.composer.addEventListener('drop', async (event) => {
    event.preventDefault();
    elements.composer.classList.remove('drag-over');
    for (const file of event.dataTransfer?.files ?? []) {
      if (file.type.startsWith('image/')) await addImage(file);
    }
  });
  elements.todoHead.addEventListener('click', () => {
    const open = elements.todoBar.classList.toggle('open');
    elements.todoHead.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  elements.sidebarToggle.addEventListener('click', toggleSidebar);
  elements.sidebarScrim.addEventListener('click', closeMobileSidebar);
  elements.workspaceSearchToggle.addEventListener('click', toggleWorkspaceSearch);
  elements.workspaceSearchInput.addEventListener('input', () => {
    setState({ filters: { ...store.filters, query: elements.workspaceSearchInput.value } });
    sidebar.render();
  });
  elements.workspaceFilter.addEventListener('click', () => {
    const next = store.filters.mode === 'active' ? 'all' : 'active';
    setState({ filters: { ...store.filters, mode: next } });
    elements.workspaceFilter.setAttribute('aria-pressed', next === 'active' ? 'true' : 'false');
    sidebar.render();
  });
  elements.panelToggle.addEventListener('click', () => togglePanel());
  elements.panelClose.addEventListener('click', () => openPanel(null));
  elements.onboardingOpen.addEventListener('click', () => showSettings({ actions: settingsActions }));
  elements.terminalToggle.addEventListener('click', toggleTerminal);
  elements.terminalClose.addEventListener('click', () => setTerminal(false));
  elements.terminalRestart.addEventListener('click', () => terminal.restart());
  for (const button of qsa('[data-menu]')) {
    button.addEventListener('click', (event) => {
      const name = button.dataset.menu;
      if (name === 'app') openAppMenu(button);
      else if (name === 'edit') openEditMenu(button);
      else if (name === 'more') openMoreMenu(button);
    });
  }
  for (const button of qsa('[data-panel]')) {
    button.addEventListener('click', () => {
      if (button.dataset.panel === 'plugins') openPluginsPage();
      else openPanel(button.dataset.panel);
    });
  }
  for (const button of qsa('[data-window]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.window;
      if (window.bananaDesktop?.windowControl) {
        window.bananaDesktop.windowControl(action);
        return;
      }
      if (action === 'maximize') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      } else if (action === 'close') {
        window.close();
        setTimeout(() => toast('浏览器不允许脚本关闭这个标签页，请手动关闭。', 'warn'), 120);
      } else {
        toast('浏览器模式下不能最小化窗口。', 'warn');
      }
    });
  }
  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('banana-language', applyLanguage);
  window.addEventListener('banana-theme', () => renderChrome());
  if (window.bananaDesktop?.isDesktop) {
    document.body.classList.add('is-desktop');
  } else {
    document.body.classList.remove('is-desktop');
  }
  applyLanguage();
}

async function importSessionFile() {
  const file = elements.importInput.files?.[0];
  elements.importInput.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const result = await api.importSession(parsed);
    setState({ session: result.session });
    chat.render(result.session);
    renderAll();
    toast('会话已导入', 'ok');
  } catch (error) {
    toast(`导入失败：${error.message}`, 'error');
  }
}

function toggleSidebar() {
  if (window.matchMedia('(max-width: 860px)').matches) {
    document.body.classList.toggle('sidebar-open');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const openMobile = document.body.classList.contains('sidebar-open');
  elements.sidebarToggle.setAttribute('aria-pressed', collapsed || openMobile ? 'false' : 'true');
}

function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
}

function toggleWorkspaceSearch() {
  const open = elements.workspaceSearch.classList.toggle('open');
  elements.workspaceSearchToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
  if (open) elements.workspaceSearchInput.focus();
}

const TOOL_META = {
  read_file: ['读取文件', 'file-text'],
  write_file: ['写入文件', 'edit'],
  edit_file: ['精确编辑', 'code'],
  list_dir: ['目录浏览', 'folder'],
  glob: ['文件查找', 'search'],
  grep: ['代码搜索', 'search'],
  shell: ['终端命令', 'terminal'],
  web_search: ['网页搜索与获取', 'globe'],
  web_fetch: ['网页抓取', 'globe'],
  todo_write: ['任务清单', 'layer'],
  todo_read: ['读取任务', 'layer'],
  memory_write: ['记忆写入', 'brain'],
  memory_read: ['读取记忆', 'brain'],
  ui_audit: ['UI 检查', 'shield'],
};

function pluginPageRow(tool) {
  const meta = TOOL_META[tool.name] ?? [tool.name, 'puzzle'];
  const row = create('div', 'plugin-row');
  const mark = create('span', 'plugin-icon');
  mark.innerHTML = icon(meta[1]);
  const main = create('div', 'plugin-main');
  const name = create('div', 'plugin-name');
  name.append(create('span', '', meta[0]));
  if (!tool.builtin) name.append(create('span', 'tag', '插件'));
  name.append(create('span', 'tag', tool.approval));
  main.append(name, create('div', 'plugin-desc', tool.description));
  const toggle = create('input', 'switch');
  toggle.type = 'checkbox';
  toggle.checked = tool.enabled;
  toggle.setAttribute('aria-label', `启用 ${meta[0]}`);
  toggle.addEventListener('change', async () => {
    try {
      const result = await api.toggleTool(tool.name, toggle.checked);
      setState({ info: result.info });
      panels.render();
      renderPluginsPage();
    } catch (error) {
      toggle.checked = !toggle.checked;
      toast(error.message, 'error');
    }
  });
  row.append(mark, main, toggle);
  return row;
}

function renderPluginsPage() {
  if (!pluginsPage) return;
  pluginsPage.replaceChildren();
  const inner = create('div', 'page-inner');
  const head = create('div', 'page-head');
  const headMain = create('div', 'page-head-main');
  headMain.append(create('h1', 'page-title', '插件'), create('p', 'page-sub', '安装、启用和配置插件 · 本地工具与 .banana/tools 脚本'));
  const actionsRow = create('div', 'page-actions');
  const refresh = create('button', 'btn small');
  refresh.type = 'button';
  refresh.innerHTML = `${icon('refresh')}<span>刷新</span>`;
  refresh.addEventListener('click', async () => {
    try {
      const data = await api.bootstrap();
      applyBootstrap(data);
      renderPluginsPage();
      toast('插件列表已刷新', 'ok');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  const add = create('button', 'btn small');
  add.type = 'button';
  add.innerHTML = `${icon('plus')}<span>添加插件</span>`;
  add.addEventListener('click', async () => {
    const path = await promptDialog({
      title: '添加插件',
      label: '插件文件绝对路径（.mjs / .js / .ts）',
      placeholder: 'D:\\plugins\\my_tool.mjs',
      confirmLabel: '复制到 ~/.banana/tools',
    });
    if (!path) return;
    try {
      const result = await api.addPlugin(path);
      setState({ info: result.info });
      renderPluginsPage();
      toast('插件已复制并重新加载', 'ok');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  const close = create('button', 'icon-btn');
  close.type = 'button';
  close.setAttribute('aria-label', '返回对话');
  close.innerHTML = icon('close');
  close.addEventListener('click', closePluginsPage);
  actionsRow.append(refresh, add, close);
  head.append(headMain, actionsRow);
  inner.append(head);
  const tools = store.info?.tools ?? [];
  const builtin = tools.filter((tool) => tool.builtin);
  const plugins = tools.filter((tool) => !tool.builtin);
  for (const [title, list] of [
    ['内置插件配置', builtin],
    ['实验性插件 / 项目脚本', plugins],
  ]) {
    const group = create('div', 'plugin-group');
    group.append(create('h2', 'plugin-group-title', title));
    const listEl = create('div', 'plugin-list');
    if (!list.length) {
      listEl.append(
        create(
          'div',
          'panel-empty',
          '还没有插件。把 .mjs 放到 ~/.banana/tools/，或用右上角“添加插件”复制进来。',
        ),
      );
    } else {
      for (const tool of list) listEl.append(pluginPageRow(tool));
    }
    group.append(listEl);
    inner.append(group);
  }
  pluginsPage.append(inner);
}

function openPluginsPage() {
  hideSessionCard();
  closeMenu();
  openPanel(null);
  closePluginsPage();
  elements.main.classList.add('page-open');
  pluginsPage = create('div', 'page-view');
  elements.main.append(pluginsPage);
  for (const item of qsa('[data-panel]')) {
    item.setAttribute('aria-current', item.dataset.panel === 'plugins' ? 'true' : 'false');
  }
  renderPluginsPage();
}

function closePluginsPage() {
  if (pluginsPage) {
    pluginsPage.remove();
    pluginsPage = null;
  }
  elements.main.classList.remove('page-open');
  for (const item of qsa('[data-panel]')) {
    if (item.dataset.panel === 'plugins') item.removeAttribute('aria-current');
  }
}

function openPanel(tab) {
  if (!tab) {
    elements.mainWrap.classList.remove('panel-open');
    elements.panelToggle.setAttribute('aria-pressed', 'false');
    if (store.panels?.tab === 'terminal') terminal?.close();
    return;
  }
  closePluginsPage();
  elements.mainWrap.classList.add('panel-open');
  elements.panelToggle.setAttribute('aria-pressed', 'true');
  panels.openTab(tab);
  for (const item of qsa('[data-panel]')) {
    item.setAttribute('aria-current', item.dataset.panel === tab ? 'true' : 'false');
  }
}

function togglePanel() {
  if (elements.mainWrap.classList.contains('panel-open')) openPanel(null);
  else openPanel(store.panels?.tab || 'tasks');
}

function toggleTerminal() {
  const isOpen =
    elements.mainWrap.classList.contains('panel-open') && store.panels?.tab === 'terminal';
  setTerminal(!isOpen);
}

function setTerminal(open) {
  elements.terminalToggle?.setAttribute('aria-pressed', open ? 'true' : 'false');
  if (open) {
    openPanel('terminal');
  } else {
    if (store.panels?.tab === 'terminal') openPanel(null);
    terminal.close();
  }
}

function onPromptInput() {
  autoResize(elements.prompt);
  updateComposer(store, composerElements());
  updateCompletion();
  saveDraftSoon();
}

function onPromptKeydown(event) {
  if (completion) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      if (event.key === 'ArrowDown') moveCompletion(1);
      else if (event.key === 'ArrowUp') moveCompletion(-1);
      else acceptCompletion();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCompletion();
      return;
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && elements.prompt.dataset.composing !== 'true') {
    event.preventDefault();
    sendMessage();
    return;
  }
  if (event.key === 'Escape' && store.running) {
    event.preventDefault();
    socket?.send({ type: 'abort' });
  }
}

function onPromptPaste(event) {
  const items = [...(event.clipboardData?.items ?? [])];
  const images = items.filter((item) => item.type.startsWith('image/'));
  if (!images.length) return;
  event.preventDefault();
  for (const item of images) {
    const file = item.getAsFile();
    if (file) void addImage(file);
  }
}

function onGlobalKeydown(event) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
  } else if (mod && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleSidebar();
  } else if (mod && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    togglePanel();
  } else if (mod && event.key === '`') {
    event.preventDefault();
    toggleTerminal();
  } else if (event.key === 'Escape') {
    if (document.querySelector('#overlay-root .overlay')) return;
    if (completion) closeCompletion();
    else if (palette) closePalette();
    else if (store.running) socket?.send({ type: 'abort' });
  }
}

function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 250);
}

function draftKey() {
  return `banana-draft:${store.session?.id ?? 'new'}`;
}

function saveDraft() {
  try {
    if (store.session?.id) localStorage.setItem(draftKey(), elements.prompt.value);
  } catch {
    // 忽略
  }
}

function loadDraft() {
  try {
    elements.prompt.value = store.session?.id ? localStorage.getItem(draftKey()) ?? '' : '';
  } catch {
    elements.prompt.value = '';
  }
  autoResize(elements.prompt);
  updateComposer(store, composerElements());
}

function applyUiPrefs() {
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem('banana-ui-prefs') || '{}');
  } catch {
    prefs = {};
  }
  const size = Number(prefs.fontSize) || 14;
  document.documentElement.style.setProperty('--text-base', `${size}px`);
  document.documentElement.style.setProperty('--text-md', `${Math.max(11, size - 1)}px`);
  document.body.dataset.steps = prefs.steps ?? 'standard';
  document.body.dataset.codeView = prefs.codeView === false ? 'off' : 'on';
  if (chat && store.session && !store.running) {
    chat.render(store.session);
  }
}

function applyThemeMode(mode) {
  applyTheme(mode);
  setStoreTheme(mode);
  renderChrome();
}

function changeLanguage(language) {
  setLanguage(language);
  setStoreLang(language);
  applyLanguage();
}

function applyLanguage() {
  const lang = store.language === 'en' ? 'en' : 'zh';
  if (lang !== 'en') return;
  const set = (selector, key) => {
    const el = qs(selector);
    if (el) el.textContent = t(key);
  };
  set('#new-session', 'newSession');
  set('.workspace-title', 'workspaces');
  set('#workspace-search-input', 'searchWorkspace');
  set('#workspace-search-input', 'searchWorkspace');
  const prompt = qs('#prompt');
  if (prompt) prompt.placeholder = t('composerPlaceholder');
  const buttons = qsa('[data-panel]');
  if (buttons[0]) buttons[0].lastChild.textContent = t('plugins');
  if (buttons[1]) buttons[1].lastChild.textContent = t('tasks');
  const tabs = qsa('#panel-tabs [data-tab]');
  const labels = ['files', 'tasksTab', 'pluginsTab', 'infoTab'];
  tabs.forEach((tab, index) => {
    tab.textContent = t(labels[index] ?? 'files');
  });
}

async function copyWorkspace(workspace) {
  const ok = await copyText(workspace);
  toast(ok ? '已复制工作区路径' : '复制失败', ok ? 'ok' : 'error');
}

function openMenu(anchor, items, options = {}) {
  closeMenu();
  const popover = create('div', 'popover');
  popover.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.separator) {
      popover.append(create('div', 'popover-sep'));
      continue;
    }
    if (item.label && !item.action) {
      popover.append(create('div', 'popover-label', item.label));
      continue;
    }
    const button = create('button', `popover-item${item.danger ? ' menu-item-danger' : ''}`);
    button.type = 'button';
    if (item.icon) {
      const mark = create('span');
      mark.innerHTML = icon(item.icon);
      button.append(mark);
    }
    const main = create('span', 'item-main');
    main.append(create('span', '', item.label));
    if (item.sub) main.append(create('span', 'item-sub', item.sub));
    button.append(main);
    if (item.check) {
      const check = create('span', 'item-check');
      check.innerHTML = icon('check');
      button.append(check);
    }
    button.addEventListener('click', () => {
      closeMenu();
      item.action?.();
    });
    popover.append(button);
  }
  elements.menuRoot.replaceChildren(popover);
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = popover.offsetWidth || 240;
  let left = rect.left;
  if (options.align === 'right') left = rect.right - width;
  left = Math.max(margin, Math.min(window.innerWidth - width - margin, left));
  let top = rect.bottom + 6;
  const height = popover.offsetHeight || 200;
  if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');
  currentMenu = { popover, anchor };
  const closeOnOutside = (event) => {
    if (!popover.contains(event.target) && event.target !== anchor) {
      closeMenu();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', closeOnOutside, { once: true }), 0);
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      anchor.focus();
    }
  });
}

function closeMenu() {
  if (!currentMenu) return;
  const { anchor } = currentMenu;
  currentMenu.popover.remove();
  anchor.setAttribute('aria-expanded', 'false');
  currentMenu = null;
}

function openAppMenu(anchor) {
  openMenu(anchor, [
    { label: '新建会话', icon: 'plus', action: () => void newSession() },
    { label: '添加工作区', icon: 'folder-plus', action: () => void addWorkspace() },
    { label: '导入会话', icon: 'upload', action: () => elements.importInput.click() },
    { separator: true },
    { label: '设置', icon: 'settings', action: () => showSettings({ actions: settingsActions }) },
    { label: '导出 Markdown', icon: 'download', action: () => void exportSession('md') },
    { label: '导出 JSON', icon: 'download', action: () => void exportSession('json') },
    { separator: true },
    { label: '关于 BananaGUI', icon: 'info', action: () => showAbout(store.info) },
  ]);
}

function openEditMenu(anchor) {
  openMenu(anchor, [
    { label: '撤销输入', icon: 'undo', action: () => document.execCommand('undo') },
    { label: '全选输入', icon: 'check', action: () => elements.prompt.select() },
    { label: '复制当前对话', icon: 'copy', action: () => void copyConversation() },
    { separator: true },
    { label: '命令面板', icon: 'command', sub: 'Ctrl / Cmd + K', action: openPalette },
    { label: '快捷键', icon: 'keyboard', action: showShortcuts },
  ]);
}

function openMoreMenu(anchor) {
  openMenu(anchor, [
    { label: '设置', icon: 'settings', action: () => showSettings({ actions: settingsActions }) },
    { label: `主题：${store.theme === 'dark' ? '深色' : store.theme === 'light' ? '浅色' : '跟随系统'}`, icon: store.theme === 'dark' ? 'moon' : 'sun', action: () => cycleTheme() },
    { label: `语言：${store.language === 'en' ? 'English' : '中文'}`, icon: 'globe', action: () => changeLanguage(store.language === 'en' ? 'zh' : 'en') },
    { separator: true },
    { label: '终端', icon: 'terminal', action: toggleTerminal },
    { label: '独立审查', icon: 'shield', action: () => runAction(() => api.review(), '审查中…', true) },
    { label: '运行验收', icon: 'play', action: () => runAction(() => api.verify(), '验收已开始', true) },
    { label: '压缩上下文', icon: 'layer', action: () => runAction(() => api.compact(), '压缩完成') },
    { separator: true },
    { label: '快捷键', icon: 'keyboard', action: showShortcuts },
    { label: '关于', icon: 'info', action: () => showAbout(store.info) },
  ]);
}

function openWorkspaceMenu(anchor) {
  const items = workspaces().map((group) => ({
    label: group.label,
    icon: 'folder',
    sub: group.workspace || '未分组',
    check: group.workspace === activeWorkspace(),
    action: () => void selectWorkspace(group.workspace),
  }));
  items.push({ separator: true });
  items.push({ label: '添加工作区…', icon: 'folder-plus', action: () => void addWorkspace() });
  openMenu(anchor, items);
}

function openReasoningMenu(anchor) {
  const current = store.session?.reasoning ?? 'standard';
  const labels = { fast: '快速', standard: '标准', deep: '深入' };
  const hints = { fast: '响应快、消耗少', standard: '速度和准确率平衡', deep: '高强度思考，适合复杂任务' };
  openMenu(
    anchor,
    ['fast', 'standard', 'deep'].map((level) => ({
      label: `${labels[level]}模式`,
      sub: hints[level],
      icon: 'brain',
      check: level === current,
      action: () => {
        if (store.session) store.session.reasoning = level;
        setState({ session: store.session });
        renderComposer();
      },
    })),
  );
}

function openModeMenu(anchor) {
  const current = store.session?.mode ?? 'build';
  openMenu(anchor, [
    {
      label: '工作区内修改',
      sub: 'Build：允许写文件、执行命令',
      icon: 'shield',
      check: current === 'build',
      action: () => void switchMode('build'),
    },
    {
      label: '只读计划',
      sub: 'Plan：先调研并生成待批准计划',
      icon: 'layer',
      check: current === 'plan',
      action: () => void switchMode('plan'),
    },
  ]);
}

async function switchMode(mode) {
  if (store.running) {
    toast('当前回合还在运行，先停止。', 'warn');
    return;
  }
  try {
    const result = await api.mode(mode);
    setState({ session: result.session });
    renderAll(true);
    toast(mode === 'plan' ? '已切换到只读计划' : '已切换到工作区内修改', 'ok');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openModelMenu(anchor) {
  const info = store.info;
  if (!info) return;
  const items = info.providers.map((provider) => ({
    label: provider.name,
    sub: `${provider.model}${provider.hasKey || provider.keySource === 'local' ? '' : ' · 未配置 key'}`,
    icon: provider.name === info.currentProvider ? 'check-circle' : 'spark',
    check: provider.name === info.currentProvider,
    action: () => void chooseProvider(provider.name),
  }));
  items.push({ separator: true });
  items.push({ label: '设置模型…', icon: 'settings', action: () => showSettings({ actions: settingsActions }) });
  openMenu(anchor, items, { align: 'right' });
}

async function chooseProvider(name) {
  try {
    const result = await api.settings({ current: name, provider: { name } });
    setState({ info: result.info, session: result.session });
    renderAll();
    toast(`已切换到 ${name}`, 'ok');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function hideSessionCard() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
  hoverCard?.remove();
  hoverCard = null;
  hoveredSession = null;
}

function scheduleHideSessionCard() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (!hoverCard?.matches(':hover')) hideSessionCard();
  }, 220);
}

function scheduleSessionCard(session, rect) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (hoveredSession?.id === session.id && hoverCard) return;
    hideSessionCard();
    hoveredSession = session;
    const card = create('div', 'session-card');
    const title = create('div', 'session-card-title');
    const mark = create('span');
    mark.innerHTML = icon('message');
    title.append(mark, create('span', '', session.title || '新对话'));
    card.append(title);
    card.append(create('div', 'session-card-path', session.workspace || store.info?.workspace || '未分组'));
    const meta = create('div', 'session-card-meta');
    meta.append(create('span', '', relativeTime(session.updatedAt)));
    meta.append(create('span', '', session.id === store.session?.id && store.running ? '运行中' : '空闲'));
    card.append(meta);
    const actionsRow = create('div', 'session-card-actions');
    const open = create('button', 'btn small primary', '打开');
    open.type = 'button';
    open.addEventListener('click', () => {
      hideSessionCard();
      void activateSession(session.id);
    });
    const rename = create('button', 'btn small', '重命名');
    rename.type = 'button';
    rename.addEventListener('click', () => {
      hideSessionCard();
      void renameSession(session);
    });
    const more = create('button', 'btn small ghost', '更多');
    more.type = 'button';
    more.addEventListener('click', () => {
      const box = card.getBoundingClientRect();
      hideSessionCard();
      openSessionMenu(session, box.right, box.bottom);
    });
    actionsRow.append(open, rename, more);
    card.append(actionsRow);
    card.addEventListener('mouseenter', () => {
      if (hoverTimer) clearTimeout(hoverTimer);
    });
    card.addEventListener('mouseleave', () => scheduleHideSessionCard());
    document.body.append(card);
    const width = 290;
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 8);
    const height = card.offsetHeight || 120;
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, rect.top - 4));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    hoverCard = card;
  }, 420);
}

function openMenuAt(x, y, items, options = {}) {
  const anchor = {
    getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }),
    setAttribute: () => {},
    focus: () => {},
  };
  openMenu(anchor, items, options);
}

function openSessionMenu(session, x, y) {
  openMenuAt(
    Math.max(8, Math.min(window.innerWidth - 12, x)),
    Math.max(8, Math.min(window.innerHeight - 12, y)),
    [
      { label: '打开', icon: 'message', action: () => void activateSession(session.id) },
      { label: '重命名', icon: 'edit', action: () => void renameSession(session) },
      { label: '导出 Markdown', icon: 'download', action: () => void downloadSession(session, 'md') },
      { label: '导出 JSON', icon: 'download', action: () => void downloadSession(session, 'json') },
      { separator: true },
      { label: '删除', icon: 'trash', danger: true, action: () => void deleteSession(session) },
    ],
    { align: 'right' },
  );
}

async function copyConversation() {
  const lines = (store.session?.messages ?? [])
    .map((message) => `${message.role === 'user' ? '你' : message.role === 'assistant' ? 'Banana' : message.name}: ${message.content}`)
    .join('\n\n');
  const ok = await copyText(lines);
  toast(ok ? '已复制当前对话' : '复制失败', ok ? 'ok' : 'error');
}

async function exportSession(format) {
  if (!store.session?.id) return;
  try {
    const response = await fetch(api.exportUrl(store.session.id, format), { credentials: 'same-origin' });
    if (!response.ok) throw new Error('导出失败');
    const text = await response.text();
    download(`banana-${store.session.id}.${format}`, text, format === 'json' ? 'application/json' : 'text/markdown');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function downloadSession(session, format) {
  try {
    const response = await fetch(api.exportUrl(session.id, format), { credentials: 'same-origin' });
    if (!response.ok) throw new Error('导出失败');
    const text = await response.text();
    download(`banana-${session.id}.${format}`, text, format === 'json' ? 'application/json' : 'text/markdown');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function cycleTheme() {
  const order = ['dark', 'light', 'system'];
  const index = order.indexOf(store.theme);
  applyThemeMode(order[(index + 1) % order.length]);
}

function updateCompletion() {
  const slash = slashQuery(elements.prompt);
  if (slash) {
    const commands = (store.info?.commands ?? []).filter((command) =>
      command.name.toLowerCase().startsWith(slash.query.toLowerCase()),
    );
    if (!commands.length) {
      closeCompletion();
      return;
    }
    showCompletion(
      commands.map((command) => ({
        label: `/${command.name}`,
        sub: command.summary,
        icon: 'slash',
        value: `/${command.name} `,
      })),
      slash.start,
      'command',
    );
    return;
  }
  const at = atQuery(elements.prompt);
  if (at && store.session) {
    if (at.query.length === 0 && completion?.type === 'file') {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.files(at.query, 30);
        const items = (result.files ?? []).slice(0, 30).map((file) => ({
          label: file.path.endsWith('/') ? file.path : file.path,
          sub: file.isDirectory ? '目录' : '',
          icon: file.isDirectory ? 'folder' : 'file-text',
          value: `@${file.path}${file.isDirectory ? '' : ' '}`,
        }));
        if (items.length) showCompletion(items, at.start, 'file');
      } catch {
        // 忽略补全失败
      }
    }, 120);
    completion?.timer && clearTimeout(completion.timer);
    if (completion) completion.timer = timer;
    return;
  }
  closeCompletion();
}

function showCompletion(items, start, type) {
  const rect = elements.composer.getBoundingClientRect();
  const box = create('div', 'completion');
  const list = create('div');
  items.forEach((item, index) => {
    const button = create('button', `completion-item${index === 0 ? ' active' : ''}`);
    button.type = 'button';
    const mark = create('span');
    mark.innerHTML = icon(item.icon);
    button.append(mark, create('span', 'path', item.label));
    if (item.sub) button.append(create('span', 'sub', item.sub));
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      acceptCompletion(index);
    });
    list.append(button);
  });
  box.append(list);
  elements.completionRoot.replaceChildren(box);
  const bottom = window.innerHeight - rect.top + 6;
  box.style.left = `${Math.max(12, rect.left + 12)}px`;
  box.style.bottom = `${Math.max(12, bottom)}px`;
  const old = completion;
  if (old?.timer) clearTimeout(old.timer);
  completion = { type, items, index: 0, start, element: box, timer: old?.timer };
  if (old?.timer) completion.timer = old.timer;
}

function moveCompletion(delta) {
  if (!completion) return;
  const count = completion.items.length;
  completion.index = (completion.index + delta + count) % count;
  const buttons = [...completion.element.querySelectorAll('.completion-item')];
  buttons.forEach((button, index) => button.classList.toggle('active', index === completion.index));
  buttons[completion.index]?.scrollIntoView({ block: 'nearest' });
}

function acceptCompletion(index = completion?.index ?? 0) {
  if (!completion) return;
  const item = completion.items[index];
  if (!item) return;
  const cursor = elements.prompt.selectionStart ?? elements.prompt.value.length;
  replaceRange(elements.prompt, completion.start, cursor, item.value);
  closeCompletion();
  elements.prompt.focus();
}

function closeCompletion() {
  if (!completion) return;
  if (completion.timer) clearTimeout(completion.timer);
  completion.element.remove();
  completion = null;
}

function openPalette() {
  closeMenu();
  closeCompletion();
  const overlay = qs('#overlay-root');
  const wrap = create('div', 'overlay palette-overlay');
  const paletteEl = create('div', 'palette');
  paletteEl.setAttribute('role', 'dialog');
  paletteEl.setAttribute('aria-modal', 'true');
  paletteEl.setAttribute('aria-label', '命令面板');
  const input = create('input', 'palette-input');
  input.placeholder = '搜索命令或操作';
  const list = create('div', 'palette-list');
  paletteEl.append(input, list);
  wrap.append(paletteEl);
  overlay.replaceChildren(wrap);
  let items = paletteItems();
  let filtered = items;
  let index = 0;

  function render() {
    list.replaceChildren();
    if (!filtered.length) {
      list.append(create('div', 'popover-empty', '没有匹配项'));
      return;
    }
    filtered.forEach((item, itemIndex) => {
      const button = create('button', `palette-item${itemIndex === index ? ' active' : ''}`);
      button.type = 'button';
      const mark = create('span');
      mark.innerHTML = icon(item.icon || 'command');
      const main = create('span', 'item-main');
      main.append(create('span', '', item.label));
      if (item.sub) main.append(create('span', 'item-sub', item.sub));
      button.append(mark, main);
      if (item.key) button.append(create('span', 'item-key', item.key));
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        finish(item);
      });
      list.append(button);
    });
  }

  function finish(item) {
    closePalette();
    item.action?.();
  }

  function close() {
    wrap.remove();
    palette = null;
  }

  function update() {
    const query = input.value.trim().toLowerCase();
    filtered = items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.sub?.toLowerCase().includes(query) ||
        item.key?.toLowerCase().includes(query),
    );
    index = 0;
    render();
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      index = Math.min(filtered.length - 1, index + 1);
      render();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      index = Math.max(0, index - 1);
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[index];
      if (item) finish(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  wrap.addEventListener('pointerdown', (event) => {
    if (event.target === wrap) close();
  });
  palette = { close };
  render();
  input.focus();
}

function closePalette() {
  if (palette) {
    palette.close();
    palette = null;
  }
}

function paletteItems() {
  const actionsList = [
    { label: '新建会话', sub: '开始一段新对话', icon: 'plus', action: () => void newSession() },
    { label: '添加工作区', sub: '打开一个目录', icon: 'folder-plus', action: () => void addWorkspace() },
    { label: '设置', sub: '模型、权限、搜索、外观', icon: 'settings', action: () => showSettings({ actions: settingsActions }) },
    { label: '切换主题', sub: '深色 / 浅色 / 跟随系统', icon: 'moon', action: cycleTheme },
    { label: '切换侧栏', icon: 'sidebar', key: 'Ctrl B', action: toggleSidebar },
    { label: '切换右侧面板', icon: 'panel', key: 'Ctrl J', action: togglePanel },
    { label: '终端', icon: 'terminal', key: 'Ctrl `', action: toggleTerminal },
    { label: '运行验收', icon: 'play', action: () => runAction(() => api.verify(), '验收已开始', true) },
    { label: '独立审查', icon: 'shield', action: () => runAction(() => api.review(), '审查中…', true) },
    { label: '压缩上下文', icon: 'layer', action: () => runAction(() => api.compact(), '压缩完成') },
    { label: '撤销上一轮文件修改', icon: 'undo', action: () => runAction(() => api.undo(), '已回滚') },
    { label: '导出 Markdown', icon: 'download', action: () => void exportSession('md') },
    { label: '导出 JSON', icon: 'download', action: () => void exportSession('json') },
    { label: '快捷键', icon: 'keyboard', action: showShortcuts },
    { label: '关于 BananaGUI', icon: 'info', action: () => showAbout(store.info) },
  ];
  const commands = (store.info?.commands ?? []).map((command) => ({
    label: `/${command.name}`,
    sub: command.summary,
    icon: 'slash',
    action: () => void executeCommand(`/${command.name} `),
  }));
  return [...actionsList, ...commands];
}

async function executeCommand(raw) {
  const value = raw.trim();
  if (!value.startsWith('/')) return;
  const [token = '', ...rest] = value.slice(1).split(/\s+/);
  const args = rest.join(' ').trim();
  const command = (store.info?.commands ?? []).find((item) => item.name === token);
  if (!command) {
    toast(`未知命令 /${token}`, 'warn');
    return;
  }
  switch (token) {
    case 'new':
      await newSession(args || '新对话');
      return;
    case 'list':
      elements.workspaceSearch.classList.add('open');
      elements.workspaceSearchToggle.setAttribute('aria-pressed', 'true');
      elements.workspaceSearchInput.focus();
      return;
    case 'use': {
      if (!args) {
        toast('用法：/use <序号|id前缀|标题>', 'warn');
        return;
      }
      const needle = args.toLowerCase();
      const target =
        store.sessions.find((session) => session.id.toLowerCase().startsWith(needle)) ||
        store.sessions.find((session) => session.title.toLowerCase().includes(needle)) ||
        store.sessions[Number(args) - 1];
      if (!target) {
        toast(`没找到匹配 "${args}" 的对话。`, 'warn');
        return;
      }
      await activateSession(target.id);
      return;
    }
    case 'rename':
      await renameSession(store.session);
      return;
    case 'delete': {
      let target = store.session;
      if (args) {
        target =
          store.sessions.find((session) => session.id.toLowerCase().startsWith(args.toLowerCase())) ||
          store.sessions.find((session) => session.title.toLowerCase().includes(args.toLowerCase())) ||
          null;
      }
      if (!target) {
        toast('没找到要删除的对话。', 'warn');
        return;
      }
      await deleteSession(target);
      return;
    }
    case 'clear': {
      const ok = await confirmDialog({
        title: '清空当前对话',
        message: '所有消息、任务、事实和计划都会被清空，不可恢复。',
        confirmLabel: '清空',
        danger: true,
      });
      if (!ok) return;
      await runAction(() => api.clearSession(), '上下文已清空');
      return;
    }
    case 'session':
      openPanel('info');
      return;
    case 'history':
      toast(`当前对话有 ${store.session?.messages.length ?? 0} 条消息`, 'ok');
      return;
    case 'provider':
    case 'model':
      if (token === 'model' && args && store.session) {
        await saveSettings({ provider: { name: store.info.currentProvider, model: args } }, false);
        toast(`模型已切到 ${args}`, 'ok');
      } else showSettings({ actions: settingsActions });
      return;
    case 'perm':
      showSettings({ actions: settingsActions });
      return;
    case 'tools':
      openPanel('plugins');
      return;
    case 'system':
      showSettings({ actions: settingsActions });
      return;
    case 'compact':
      await runAction(() => api.compact(), '压缩完成');
      return;
    case 'cwd':
      await addWorkspace();
      return;
    case 'verify':
      await runAction(() => api.verify(), '验收已开始', true);
      return;
    case 'review':
      await runAction(() => api.review(), '审查中…', true);
      return;
    case 'undo':
      await runAction(() => api.undo(), '已回滚');
      return;
    case 'save':
      toast('对话会在每条消息后自动保存。', 'ok');
      return;
    case 'phase':
      await runAction(() => api.phase(args || 'next'), '已切换阶段');
      return;
    case 'prefer':
      if (args) {
        const preferences = [...(store.info.preferences ?? []), args];
        await saveSettings({ preferences }, false);
        toast('偏好已添加', 'ok');
      } else showSettings({ actions: settingsActions });
      return;
    case 'image':
      elements.imageInput.click();
      return;
    case 'setup':
      showSettings({ actions: settingsActions });
      return;
    case 'help':
      openPalette();
      return;
    default:
      toast(`/${token} 在 GUI 中暂不支持，请查看帮助。`, 'warn');
  }
}

// 初始化
applyTheme(store.theme);
setLanguage(store.language);
boot();
applyUiPrefs();
