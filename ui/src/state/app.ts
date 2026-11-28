import { createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import {
  api,
  connect,
  type Info,
  type Session,
  type SessionMessage,
  type SessionSummary,
  type Socket,
  type ToolCallInfo,
  type WsEvent,
} from '../lib/api';
import { buildTimeline, groupSessions, toolSummary } from '../lib/format';
import { dictionaries, type Lang } from '../lib/i18n';
import { hasSeenGuide } from '../lib/guide';

export type DockTab = 'terminal' | 'files' | 'tasks' | 'verify' | 'info';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface UiImage {
  id: string;
  dataUrl: string;
  name?: string;
}

export interface Toast {
  id: string;
  title: string;
  kind: 'default' | 'success' | 'error' | 'warn';
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PromptRequest {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
}

type DesktopBridge = {
  isDesktop?: boolean;
  selectDirectory?: () => Promise<string | null>;
  windowControl?: (action: 'minimize' | 'maximize' | 'close') => void;
};

declare global {
  interface Window {
    bananaDesktop?: DesktopBridge;
    Terminal?: new (options: Record<string, unknown>) => {
      open: (element: HTMLElement) => void;
      write: (data: string) => void;
      onData: (handler: (data: string) => void) => void;
      dispose: () => void;
      loadAddon?: (addon: unknown) => void;
      focus?: () => void;
      cols?: number;
      rows?: number;
    };
    FitAddon?: new () => { fit: () => void };
  }
}

function readTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('banana-theme-mode');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readLang(): Lang {
  try {
    return localStorage.getItem('banana-lang') === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function createAppState() {
  const [themeMode, setThemeModeSignal] = createSignal<ThemeMode>(readTheme());
  const [lang, setLangSignal] = createSignal<Lang>(readLang());
  const [fontSize, setFontSizeSignal] = createSignal(readNumber('banana-font-size', 14));
  const [focusTick, setFocusTick] = createSignal(0);
  const [scrollTick, setScrollTick] = createSignal(0);

  const t = createMemo(() => dictionaries[lang()]);

  const [state, setState] = createStore({
    info: null as Info | null,
    sessions: [] as SessionSummary[],
    session: null as Session | null,
    messages: [] as SessionMessage[],
    booting: true,
    running: false,
    online: false,
    status: '',
    query: '',
    threadScrolled: false,
    draft: '',
    images: [] as UiImage[],
    collapsed: {} as Record<string, boolean>,
    approval: null as { id: string; summary?: string; kind?: string } | null,
    toasts: [] as Toast[],
    settingsOpen: false,
    pluginsOpen: false,
    paletteOpen: false,
    paletteQuery: '',
    paletteIndex: 0,
    helpOpen: false,
    guideOpen: false,
    dockOpen:
      typeof window !== 'undefined' && window.innerWidth > 1180
        ? readNumber('banana-dock', 1) === 1
        : false,
    dockTab: 'terminal' as DockTab,
    dockWidth: readNumber('banana-dock-width', 360),
    sidebarOpen: true,
    trustOpen: false,
    confirm: null as ConfirmRequest | null,
    prompt: null as PromptRequest | null,
    fileItems: [] as Array<{ name: string; path: string; type: 'dir' | 'file'; size?: number }>,
    filePreview: null as { path: string; content: string; truncated: boolean; binary: boolean; bytes: number } | null,
    fileLoading: false,
    verifying: false,
    reviewing: false,
    review: '',
    contextTokens: 0,
    commandBusy: false,
  });

  let socket: Socket | null = null;
  let confirmResolver: ((value: boolean) => void) | null = null;
  let promptResolver: ((value: string | null) => void) | null = null;
  let trustDismissedFor = '';

  const visibleMessages = createMemo(() => buildTimeline(state.messages));
  const groups = createMemo(() =>
    groupSessions(state.sessions, state.info?.workspace ?? '', state.query),
  );
  const pendingPlan = createMemo(() => state.session?.plan ?? null);

  function applyAppearance(mode: ThemeMode = themeMode()) {
    const dark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    setThemeModeSignal(mode);
    document.documentElement.style.setProperty('--text-md', `${fontSize()}px`);
    document.documentElement.style.setProperty('--text-base', `${Math.max(12, fontSize() - 1)}px`);
  }

  function setThemeMode(mode: ThemeMode) {
    try {
      localStorage.setItem('banana-theme-mode', mode);
    } catch {
      /* ignore */
    }
    applyAppearance(mode);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setThemeMode(current === 'dark' ? 'light' : 'dark');
  }

  function setLang(next: Lang) {
    setLangSignal(next);
    try {
      localStorage.setItem('banana-lang', next);
    } catch {
      /* ignore */
    }
  }

  function setFontSize(px: number) {
    setFontSizeSignal(px);
    try {
      localStorage.setItem('banana-font-size', String(px));
    } catch {
      /* ignore */
    }
    applyAppearance();
  }

  function toast(title: string, kind: Toast['kind'] = 'default') {
    const id = crypto.randomUUID();
    setState('toasts', (list) => [...list.slice(-3), { id, title, kind }]);
    window.setTimeout(() => {
      setState('toasts', (list) => list.filter((item) => item.id !== id));
    }, kind === 'error' ? 5200 : 3200);
  }

  function dismissToast(id: string) {
    setState('toasts', (list) => list.filter((item) => item.id !== id));
  }

  function askConfirm(request: ConfirmRequest): Promise<boolean> {
    confirmResolver?.(false);
    setState('confirm', request);
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function answerConfirm(value: boolean) {
    confirmResolver?.(value);
    confirmResolver = null;
    setState('confirm', null);
  }

  function askPrompt(request: PromptRequest): Promise<string | null> {
    promptResolver?.(null);
    setState('prompt', request);
    return new Promise((resolve) => {
      promptResolver = resolve;
    });
  }

  function answerPrompt(value: string | null) {
    promptResolver?.(value);
    promptResolver = null;
    setState('prompt', null);
  }

  function applyBootstrap(data: {
    info: Info;
    sessions: SessionSummary[];
    session: Session;
  }) {
    setState({
      info: data.info,
      sessions: data.sessions,
      session: data.session,
      messages: data.session.messages ?? [],
      booting: false,
      status: t().ready,
    });
    if (data.info.trust?.status === 'pending' && data.info.trust.workspace !== trustDismissedFor) {
      setState('trustOpen', true);
    } else if (!hasSeenGuide()) {
      setState('guideOpen', true);
    }
    if (data.info.providerError) setState('status', data.info.providerError);
  }

  async function refresh() {
    try {
      const data = await api.bootstrap();
      applyBootstrap(data);
    } catch (error) {
      setState({ booting: false, status: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function refreshSession() {
    const id = state.session?.id;
    if (!id) return;
    try {
      const data = await api.session(id);
      setState('session', data.session);
      if (!state.running) setState('messages', data.session.messages ?? []);
    } catch {
      /* keep view */
    }
  }

  function setDraft(value: string) {
    setState('draft', value);
  }

  function focusComposer() {
    setFocusTick((n) => n + 1);
  }

  function setQuery(value: string) {
    setState('query', value);
  }

  function toggleGroup(workspace: string) {
    setState('collapsed', workspace, !state.collapsed[workspace]);
  }

  async function pick(id: string) {
    if (state.running) return;
    try {
      const data = await api.activate(id);
      setState({ session: data.session, messages: data.session.messages ?? [], paletteOpen: false });
      if (window.innerWidth <= 840) setState('sidebarOpen', false);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function newSession(title = '新对话') {
    if (state.running) return;
    try {
      const data = await api.create({ title });
      setState('session', data.session);
      setState('messages', []);
      await refresh();
      setState({ pluginsOpen: false });
      if (window.innerWidth <= 840) setState('sidebarOpen', false);
      focusComposer();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function renameSession(item: SessionSummary) {
    const title = await askPrompt({ title: '重命名会话', label: '标题', value: item.title });
    if (!title || title === item.title) return;
    try {
      await api.rename(item.id, title);
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function removeSession(item: SessionSummary) {
    const ok = await askConfirm({
      title: `删除「${item.title || '新对话'}」？`,
      message: '删除后无法恢复。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.remove(item.id);
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function clearSession() {
    const ok = await askConfirm({ title: '清空当前对话？', message: '消息、事实和计划都会被清空。', confirmLabel: '清空', danger: true });
    if (!ok) return;
    try {
      const data = await api.clear();
      setState({ session: data.session, messages: [] });
      toast('对话已清空', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function importSession(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      await api.importSession(data);
      await refresh();
      toast('会话已导入', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function exportSession(format: 'md' | 'json') {
    const id = state.session?.id;
    if (id) window.open(api.exportUrl(id, format), '_blank');
  }

  function ensureAssistant(turnId: string) {
    setState(
      'messages',
      produce((list: SessionMessage[]) => {
        const last = list[list.length - 1];
        if (last?.role === 'assistant' && (last.turnId ?? '') === (turnId ?? '')) return;
        if (last?.role === 'assistant' && !last.content && !last.reasoning && !last.toolCalls?.length) {
          last.turnId = turnId || undefined;
          return;
        }
        list.push({ role: 'assistant', content: '', turnId: turnId || undefined });
      }),
    );
  }

  function updateAssistant(turnId: string, fn: (message: SessionMessage) => SessionMessage) {
    ensureAssistant(turnId);
    setState(
      'messages',
      produce((list: SessionMessage[]) => {
        const index = list.length - 1;
        if (index >= 0) list[index] = fn(list[index]!);
      }),
    );
    setScrollTick((n) => n + 1);
  }

  function addTool(turnId: string, call: ToolCallInfo) {
    ensureAssistant(turnId);
    setState(
      'messages',
      produce((list: SessionMessage[]) => {
        const index = list.length - 1;
        const message = list[index];
        if (!message) return;
        message.toolCalls = [...(message.toolCalls ?? []), call];
      }),
    );
    setScrollTick((n) => n + 1);
  }

  function patchTool(id: string, patch: Partial<ToolCallInfo>) {
    setState(
      'messages',
      produce((list: SessionMessage[]) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const calls = list[i]?.toolCalls;
          if (!calls?.length) continue;
          const index = calls.findIndex((call) => call.id === id);
          if (index === -1) continue;
          calls[index] = { ...calls[index]!, ...patch };
          return;
        }
      }),
    );
    setScrollTick((n) => n + 1);
  }

  function appendToolOutput(id: string, chunk: string) {
    setState(
      'messages',
      produce((list: SessionMessage[]) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const calls = list[i]?.toolCalls;
          if (!calls?.length) continue;
          const call = calls.find((item) => item.id === id);
          if (!call) continue;
          call.output = `${call.output ?? ''}${chunk}`.slice(-20_000);
          return;
        }
      }),
    );
    setScrollTick((n) => n + 1);
  }

  function handleEvent(event: WsEvent) {
    const turnId = String(event.turnId ?? '');
    switch (event.type) {
      case 'ready': {
        applyBootstrap(event as unknown as { info: Info; sessions: SessionSummary[]; session: Session });
        setState('online', true);
        break;
      }
      case 'text':
        setState('running', true);
        updateAssistant(turnId, (message) => ({ ...message, content: `${message.content ?? ''}${String(event.delta ?? '')}` }));
        break;
      case 'reasoning': {
        const delta = String(event.delta ?? '');
        if (!delta) break;
        setState('running', true);
        updateAssistant(turnId, (message) => ({ ...message, reasoning: `${message.reasoning ?? ''}${delta}` }));
        break;
      }
      case 'turn_start':
        setState({ running: true, status: '正在处理' });
        ensureAssistant(turnId);
        break;
      case 'step':
        setState({ running: true, status: `第 ${String(event.step ?? '')} 步` });
        break;
      case 'tool_start': {
        const id = String(event.id ?? event.toolCallId ?? '');
        setState({ running: true, status: `调用 ${String(event.name ?? '工具')}` });
        addTool(turnId, {
          id,
          name: String(event.name ?? 'tool'),
          input: event.input,
          summary: event.summary ? String(event.summary) : undefined,
          status: 'running',
        });
        break;
      }
      case 'tool_output':
        appendToolOutput(String(event.id ?? ''), String(event.chunk ?? ''));
        break;
      case 'tool_end': {
        const id = String(event.id ?? '');
        setState('status', `${String(event.name ?? '工具')}${event.ok === false ? ' 失败' : ' 完成'}`);
        patchTool(id, {
          status: event.ok === false ? 'fail' : 'ok',
          output: event.content ? String(event.content) : undefined,
          durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
          truncated: event.truncated === true,
        });
        break;
      }
      case 'notice':
        setState('status', String(event.message ?? ''));
        if (event.level === 'warn' || event.level === 'error') {
          toast(String(event.message ?? ''), event.level === 'error' ? 'error' : 'warn');
        }
        break;
      case 'retry':
        setState('status', '重试中…');
        break;
      case 'approval_request':
        setState('approval', {
          id: String(event.id ?? ''),
          summary: String(event.summary ?? ''),
          kind: String(event.kind ?? ''),
        });
        break;
      case 'approval_resolved':
        setState('approval', null);
        break;
      case 'turn_end': {
        setState('running', false);
        if (event.error) {
          setState('status', String(event.error));
          updateAssistant(turnId, (message) => ({
            ...message,
            content: `${message.content ?? ''}${message.content ? '\n\n' : ''}> 出错：${String(event.error)}`,
          }));
          toast(String(event.error), 'error');
        } else {
          setState('status', t().ready);
        }
        if (typeof event.contextTokens === 'number') setState('contextTokens', event.contextTokens);
        window.setTimeout(() => void refreshSession(), 150);
        break;
      }
      case 'verify_start':
        setState({ verifying: true, status: '运行验收…' });
        toast(`运行验收：${(Array.isArray(event.commands) ? event.commands : []).join('；')}`, 'warn');
        break;
      case 'verify':
        setState('verifying', false);
        if (state.session) {
          setState('session', 'verification', {
            at: String(event.at ?? new Date().toISOString()),
            results: (Array.isArray(event.results) ? event.results : []) as Array<{ command: string; ok: boolean; ms: number }>,
          });
        }
        setState({ dockOpen: true, dockTab: 'verify' });
        toast('验收完成', 'success');
        break;
      case 'undo':
        toast(`已回滚：恢复 ${Number(event.restored ?? 0)} 个，删除 ${Number(event.deleted ?? 0)} 个`, 'success');
        break;
      case 'compact':
        toast(`已压缩上下文，移除 ${Number(event.removed ?? 0)} 条消息`, 'success');
        break;
      case 'review':
        setState({ review: String(event.text ?? ''), reviewing: false, dockOpen: true, dockTab: 'info' });
        break;
      case 'session':
        if (event.session && typeof event.session === 'object') {
          const session = event.session as Session;
          setState('session', session);
          if (!state.running) setState('messages', session.messages ?? []);
        }
        break;
      case 'sessions':
        if (Array.isArray(event.sessions)) setState('sessions', event.sessions as SessionSummary[]);
        break;
      case 'info':
        if (event.info && typeof event.info === 'object') {
          const info = event.info as Info;
          setState('info', info);
          if (info.trust?.status === 'pending' && info.trust.workspace !== trustDismissedFor) {
            setState('trustOpen', true);
          }
        }
        break;
      case 'error':
        setState('approval', null);
        toast(String(event.message ?? '出错'), 'error');
        break;
      default:
        break;
    }
  }

  socket = connect({
    onEvent: handleEvent,
    onStatus(online) {
      setState('online', online);
      if (online) {
        setState('status', t().ready);
      } else {
        setState('status', t().connectionLost);
      }
    },
  });

  async function send() {
    if (state.running) {
      socket?.send({ type: 'abort' });
      setState('status', '正在停止…');
      return;
    }
    const value = state.draft.trim();
    if (!value && !state.images.length) return;
    if (value.startsWith('/')) {
      setState('draft', '');
      await executeCommand(value);
      return;
    }
    const images = state.images.map((image) => image.dataUrl);
    const ok = socket?.send({
      type: 'turn',
      input: value,
      images: images.length ? images : undefined,
      mode: state.session?.mode ?? 'build',
      reasoning: state.session?.reasoning ?? 'standard',
    });
    if (!ok) {
      toast(t().connectionLost, 'error');
      return;
    }
    setState('messages', (list) => [
      ...list,
      { role: 'user', content: value, images: images.length ? images : undefined },
    ]);
    // 首次发送后才把对话放进侧栏列表。
    const current = state.session;
    if (current) {
      setState('sessions', (list) => {
        if (list.some((item) => item.id === current.id)) return list;
        const flat = value.replace(/\s+/g, ' ').trim();
        return [
          {
            id: current.id,
            title: flat.length > 42 ? `${flat.slice(0, 42)}…` : flat,
            updatedAt: new Date().toISOString(),
            createdAt: current.createdAt ?? new Date().toISOString(),
            turns: 1,
            preview: flat.slice(0, 80),
            workspace: current.workspace,
          },
          ...list,
        ];
      });
    }
    setState({ draft: '', images: [], running: true, status: '正在处理' });
    setScrollTick((n) => n + 1);
    setFocusTick((n) => n + 1);
  }

  function stop() {
    if (!state.running) return;
    socket?.send({ type: 'abort' });
    setState('status', '正在停止…');
  }

  async function setMode(mode: 'plan' | 'build') {
    try {
      const data = await api.mode(mode);
      setState('session', data.session);
      setState('status', mode === 'plan' ? 'Plan 模式：先出方案' : 'Build 模式：直接执行');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function cycleModel(direction: 1 | -1) {
    const providers = (state.info?.providers ?? []).filter((item) => item.hasKey);
    if (providers.length < 2) {
      toast('没有其他已配置的模型', 'warn');
      return;
    }
    if (state.commandBusy) return;
    const current = providers.findIndex((item) => item.name === state.info?.currentProvider);
    const next = providers[(Math.max(0, current) + direction + providers.length) % providers.length]!;
    if (!next || next.name === state.info?.currentProvider) return;
    setState('commandBusy', true);
    try {
      const data = await api.settings({
        current: next.name,
        provider: { name: next.name, model: next.model },
      });
      setState({ info: data.info, session: data.session, status: t().ready });
      toast(`模型：${next.name} / ${next.model}`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setState('commandBusy', false);
    }
  }

  function setReasoning(level: 'fast' | 'standard' | 'deep') {
    if (state.session) setState('session', 'reasoning', level);
  }

  async function approvePlan() {
    try {
      const data = await api.approvePlan();
      setState('session', data.session);
      toast('计划已批准', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function cancelPlan() {
    try {
      const data = await api.cancelPlan();
      setState('session', data.session);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function answerApproval(allow: boolean) {
    const request = state.approval;
    if (!request) return;
    socket?.send({ type: 'approval', id: request.id, allow });
    setState('approval', null);
  }

  async function loadFiles() {
    try {
      const data = await api.tree('');
      setState('fileItems', data.items ?? []);
    } catch (error) {
      setState('fileItems', []);
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function openFile(path: string) {
    setState({ fileLoading: true, dockOpen: true, dockTab: 'files' });
    try {
      const data = await api.file(path);
      setState('filePreview', data);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setState('fileLoading', false);
    }
  }

  async function switchWorkspace(path?: string) {
    let target = path;
    if (!target) {
      target = (await window.bananaDesktop?.selectDirectory?.()) ?? undefined;
      if (!target) {
        target = (await askPrompt({ title: '切换工作区', label: '绝对路径', value: state.info?.workspace ?? '' })) ?? undefined;
      }
    }
    if (!target) return;
    try {
      const data = await api.workspace(target, state.session?.id);
      setState({ session: data.session, info: data.info, messages: data.session.messages ?? [] });
      await refresh();
      setState('filePreview', null);
      toast('工作区已切换', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function trustWorkspace() {
    try {
      const data = await api.trust();
      trustDismissedFor = data.info.trust?.workspace ?? '';
      setState({ info: data.info, session: data.session, trustOpen: false });
      if (!hasSeenGuide()) setState('guideOpen', true);
      toast('已信任当前工作区', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function dismissTrust() {
    trustDismissedFor = state.info?.trust?.workspace ?? '';
    setState('trustOpen', false);
    if (!hasSeenGuide()) setState('guideOpen', true);
  }

  async function saveSettings(patch: Record<string, unknown>, message = '设置已保存') {
    try {
      const data = await api.settings(patch);
      setState({ info: data.info, session: data.session });
      if (message) toast(message, 'success');
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
      return false;
    }
  }

  async function testConnection(name?: string) {
    try {
      const result = await api.testConnection(name);
      toast(result.detail || (result.ok ? '连接正常' : '连接失败'), result.ok ? 'success' : 'error');
      return result;
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
      return { ok: false, detail: String(error) };
    }
  }

  async function toggleTool(name: string, enabled: boolean) {
    try {
      const data = await api.toggleTool(name, enabled);
      setState('info', data.info);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function addPlugin() {
    const path = await askPrompt({
      title: '添加插件',
      label: '插件文件绝对路径（.mjs / .js / .ts）',
      placeholder: 'C:\\path\\to\\plugin.mjs',
    });
    if (!path) return;
    try {
      const data = await api.addPlugin(path.trim());
      setState('info', data.info);
      toast('插件已添加', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function runUndo() {
    try {
      await api.undo();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function runVerify() {
    if (state.verifying) return;
    setState('verifying', true);
    try {
      await api.verify();
    } catch (error) {
      setState('verifying', false);
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function runCompact() {
    try {
      const result = await api.compact();
      await refreshSession();
      toast(`已压缩，移除 ${result.removed} 条消息`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function runReview() {
    if (state.reviewing) return;
    setState('reviewing', true);
    try {
      await api.review();
    } catch (error) {
      setState('reviewing', false);
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function switchPhase(phase: string) {
    try {
      const data = await api.phase(phase);
      setState('session', data.session);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function addImages(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        toast('只支持 png / jpg / gif / webp 图片', 'error');
        continue;
      }
      if (file.size > 4 * 1024 * 1024) {
        toast('图片超过 4MB 上限', 'error');
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      }).catch(() => '');
      if (!dataUrl) continue;
      setState('images', (list) => [...list, { id: crypto.randomUUID(), dataUrl, name: file.name }]);
    }
  }

  function removeImage(id: string) {
    setState('images', (list) => list.filter((item) => item.id !== id));
  }

  function openSettings() {
    setState({ settingsOpen: true, paletteOpen: false, guideOpen: false });
  }

  function openGuide() {
    setState({ guideOpen: true, settingsOpen: false, pluginsOpen: false, paletteOpen: false });
  }

  function openPlugins() {
    setState({ pluginsOpen: true, paletteOpen: false, settingsOpen: false });
  }

  function setDock(tab: DockTab) {
    setState({ dockTab: tab, dockOpen: true });
    try {
      localStorage.setItem('banana-dock', '1');
    } catch {
      /* ignore */
    }
  }

  function toggleDock() {
    setState('dockOpen', (open) => {
      const next = !open;
      try {
        localStorage.setItem('banana-dock', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function executeCommand(raw: string) {
    const value = raw.trim();
    if (!value.startsWith('/')) return;
    const [token = '', ...rest] = value.slice(1).split(/\s+/);
    const args = rest.join(' ').trim();
    const known = new Set((state.info?.commands ?? []).map((item) => item.name));
    if (known.size && !known.has(token)) {
      toast(`未知命令 /${token}`, 'warn');
      return;
    }
    switch (token) {
      case 'new':
        await newSession(args || '新对话');
        break;
      case 'list':
        setState('query', '');
        setState('sidebarOpen', true);
        break;
      case 'use': {
        const needle = args.toLowerCase();
        const target =
          state.sessions.find((item) => item.id.toLowerCase().startsWith(needle)) ??
          state.sessions.find((item) => item.title.toLowerCase().includes(needle)) ??
          state.sessions[Number(args) - 1];
        if (target) await pick(target.id);
        else toast(`没有匹配「${args}」的会话`, 'warn');
        break;
      }
      case 'rename':
        if (state.session) await renameSession(state.session as unknown as SessionSummary);
        break;
      case 'delete':
        if (state.session) await removeSession(state.session as unknown as SessionSummary);
        break;
      case 'clear':
        await clearSession();
        break;
      case 'session':
      case 'history':
        setDock('info');
        break;
      case 'provider':
      case 'model':
      case 'perm':
      case 'tools':
      case 'system':
      case 'prefer':
      case 'setup':
        openSettings();
        break;
      case 'cwd':
        await switchWorkspace(args || undefined);
        break;
      case 'verify':
        await runVerify();
        break;
      case 'undo':
        await runUndo();
        break;
      case 'compact':
        await runCompact();
        break;
      case 'review':
        await runReview();
        break;
      case 'phase':
        await switchPhase(args || 'next');
        break;
      case 'save':
        toast('对话已自动保存', 'success');
        break;
      case 'image':
        toast('请用输入框左侧的图片按钮或拖入图片', 'warn');
        break;
      case 'help':
        setState('helpOpen', true);
        break;
      default:
        openSettings();
        break;
    }
  }

  function dispose() {
    socket?.close();
  }

  return {
    state,
    setState,
    themeMode,
    lang,
    t,
    fontSize,
    focusTick,
    scrollTick,
    visibleMessages,
    groups,
    pendingPlan,
    setThemeMode,
    toggleTheme,
    setLang,
    setFontSize,
    toast,
    dismissToast,
    askConfirm,
    answerConfirm,
    askPrompt,
    answerPrompt,
    refresh,
    refreshSession,
    pick,
    newSession,
    renameSession,
    removeSession,
    clearSession,
    importSession,
    exportSession,
    setDraft,
    setQuery,
    toggleGroup,
    focusComposer,
    send,
    stop,
    setMode,
    setReasoning,
    cycleModel,
    approvePlan,
    cancelPlan,
    answerApproval,
    loadFiles,
    openFile,
    switchWorkspace,
    trustWorkspace,
    dismissTrust,
    saveSettings,
    testConnection,
    toggleTool,
    addPlugin,
    runUndo,
    runVerify,
    runCompact,
    runReview,
    switchPhase,
    addImages,
    removeImage,
    openSettings,
    openGuide,
    openPlugins,
    setDock,
    toggleDock,
    executeCommand,
    dispose,
    toolSummary,
  };
}

export type AppState = ReturnType<typeof createAppState>;
