import { For, Show, createEffect, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Icon } from './Icon';
import { Modal, Segmented, SettingRow, Switch } from './ui';
import type { AppState } from '../state/app';
import type { Lang } from '../lib/i18n';

type Section = 'general' | 'appearance' | 'model' | 'search' | 'permissions' | 'tools' | 'workspace' | 'verify' | 'advanced';

const SECTIONS: Array<{ id: Section; key: string }> = [
  { id: 'general', key: 'settingsGeneral' },
  { id: 'appearance', key: 'settingsAppearance' },
  { id: 'model', key: 'settingsModel' },
  { id: 'search', key: 'settingsSearch' },
  { id: 'permissions', key: 'settingsPermissions' },
  { id: 'tools', key: 'settingsTools' },
  { id: 'workspace', key: 'settingsWorkspace' },
  { id: 'verify', key: 'settingsVerify' },
  { id: 'advanced', key: 'settingsAdvanced' },
];

export function Settings(props: { app: AppState }) {
  const { state, t } = props.app;
  const [section, setSection] = createSignal<Section>('general');
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [testDetail, setTestDetail] = createSignal('');
  let importInput: HTMLInputElement | undefined;

  const [draft, setDraft] = createStore({
    provider: '',
    model: '',
    baseUrl: '',
    apiKey: '',
    apiKeyEnv: '',
    clearKey: false,
    permissions: { shell: 'ask', write: 'ask', network: 'allow' } as Record<string, string>,
    searchMode: 'auto',
    searchProvider: 'auto',
    searchDeep: false,
    searchPages: 3,
    searchLanguage: 'zh',
    tavilyKey: '',
    braveKey: '',
    clearTavily: false,
    clearBrave: false,
    showReasoning: true,
    allowOutsideWorkspace: false,
    maxSteps: 30,
    maxContextChars: 120000,
    uiGuard: 'warn',
    systemPrompt: '',
    preferences: '',
    verifyCommands: '',
  });

  createEffect(() => {
    if (!state.settingsOpen) return;
    setSection('general');
    const info = state.info;
    if (!info) return;
    const provider = info.providers?.find((item) => item.name === info.currentProvider);
    setDraft({
      provider: info.currentProvider ?? '',
      model: info.model ?? '',
      baseUrl: provider?.baseUrl ?? '',
      apiKey: '',
      apiKeyEnv: provider?.apiKeyEnv ?? '',
      clearKey: false,
      permissions: {
        shell: info.permissions?.shell ?? 'ask',
        write: info.permissions?.write ?? 'ask',
        network: info.permissions?.network ?? 'allow',
      },
      searchMode: info.search?.mode === 'native' || info.search?.mode === 'api' ? info.search.mode : 'auto',
      searchProvider:
        info.search?.provider === 'tavily' || info.search?.provider === 'brave'
          ? info.search.provider
          : 'auto',
      searchDeep: Boolean(info.search?.deep),
      searchPages: info.search?.deepPages ?? 3,
      searchLanguage: info.search?.language ?? 'zh',
      tavilyKey: '',
      braveKey: '',
      clearTavily: false,
      clearBrave: false,
      showReasoning: info.showReasoning !== false,
      allowOutsideWorkspace: Boolean(info.allowOutsideWorkspace),
      maxSteps: info.maxSteps ?? 30,
      maxContextChars: info.maxContextChars ?? 120000,
      uiGuard: info.uiGuard ?? 'warn',
      systemPrompt: info.systemPrompt ?? '',
      preferences: (info.preferences ?? []).join('\n'),
      verifyCommands: (info.verifyCommands ?? []).join('\n'),
    });
    setTestDetail('');
  });

  function chooseProvider(name: string) {
    const provider = state.info?.providers?.find((item) => item.name === name);
    setDraft({
      provider: name,
      model: provider?.model ?? draft.model,
      baseUrl: provider?.baseUrl ?? '',
      apiKey: '',
      apiKeyEnv: provider?.apiKeyEnv ?? '',
      clearKey: false,
    });
  }

  async function save() {
    setSaving(true);
    const patch: Record<string, unknown> = {
      current: draft.provider,
      provider: {
        name: draft.provider,
        model: draft.model.trim(),
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim() || undefined,
        apiKeyEnv: draft.apiKeyEnv.trim() || undefined,
        clearKey: draft.clearKey || undefined,
      },
      permissions: { ...draft.permissions },
      search: {
        mode: draft.searchMode,
        provider: draft.searchProvider,
        deep: draft.searchDeep,
        deepPages: Number(draft.searchPages) || 3,
        language: draft.searchLanguage,
        tavilyKey: draft.tavilyKey.trim() || undefined,
        braveKey: draft.braveKey.trim() || undefined,
        clearTavily: draft.clearTavily || undefined,
        clearBrave: draft.clearBrave || undefined,
      },
      showReasoning: draft.showReasoning,
      allowOutsideWorkspace: draft.allowOutsideWorkspace,
      maxSteps: Number(draft.maxSteps) || 30,
      maxContextChars: Number(draft.maxContextChars) || 120000,
      uiGuard: draft.uiGuard,
      systemPrompt: draft.systemPrompt,
      preferences: draft.preferences
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      verifyCommands: draft.verifyCommands
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    };
    const ok = await props.app.saveSettings(patch);
    setSaving(false);
    if (ok) props.app.setState('settingsOpen', false);
  }

  async function test() {
    setTesting(true);
    setTestDetail('');
    const result = await props.app.testConnection(draft.provider);
    setTestDetail(result.detail ?? '');
    setTesting(false);
  }

  const langOptions: Array<{ value: Lang; label: string }> = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ];

  return (
    <Modal
      open={state.settingsOpen}
      wide
      title={t().settings}
      onClose={() => props.app.setState('settingsOpen', false)}
      footer={
        <div class="dialog-foot">
          <Show when={testDetail()}>
            <span class={`hint`} style={{ flex: '1' }}>
              {testDetail()}
            </span>
          </Show>
          <span class="spacer" />
          <button class="btn" type="button" onClick={() => props.app.setState('settingsOpen', false)}>
            {t().close}
          </button>
          <button class="btn primary" type="button" disabled={saving()} onClick={() => void save()}>
            {saving() ? t().saving : t().save}
          </button>
        </div>
      }
    >
      <div class="settings">
        <nav class="settings-nav" aria-label={t().settings}>
          <For each={SECTIONS}>
            {(item) => (
              <button
                type="button"
                class={section() === item.id ? 'active' : ''}
                onClick={() => setSection(item.id)}
              >
                {t()[item.key as keyof ReturnType<typeof t>]}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-pane">
          <Show when={section() === 'general'}>
            <div class="settings-section">
              <h3>{t().settingsGeneral}</h3>
              <SettingRow title={t().language}>
                <Segmented value={props.app.lang()} options={langOptions} onChange={(value) => props.app.setLang(value)} />
              </SettingRow>
              <SettingRow title={t().theme}>
                <select class="select" value={props.app.themeMode()} onChange={(event) => props.app.setThemeMode(event.currentTarget.value as 'light' | 'dark' | 'system')}>
                  <option value="system">{t().system}</option>
                  <option value="light">{t().light}</option>
                  <option value="dark">{t().dark}</option>
                </select>
              </SettingRow>
              <SettingRow title={t().showReasoning} hint="关闭后不再显示模型的思考过程">
                <Switch checked={draft.showReasoning} onChange={(value) => setDraft('showReasoning', value)} />
              </SettingRow>
              <SettingRow title={t().data} hint={t().dataHint}>
                <div class="setting-actions">
                  <button class="btn" type="button" onClick={() => importInput?.click()}>
                    {t().import}
                  </button>
                  <button class="btn" type="button" onClick={() => props.app.exportSession('md')}>
                    {t().exportMd}
                  </button>
                </div>
                <input
                  ref={importInput}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void props.app.importSession(file);
                    event.currentTarget.value = '';
                  }}
                />
              </SettingRow>
              <SettingRow title={t().guide} hint={t().guideIntro}>
                <button class="btn" type="button" onClick={() => props.app.openGuide()}>
                  {t().guideTitle}
                </button>
              </SettingRow>
            </div>
          </Show>

          <Show when={section() === 'appearance'}>
            <div class="settings-section">
              <h3>{t().settingsAppearance}</h3>
              <SettingRow title={t().fontSize} hint={`${props.app.fontSize()}px`}>
                <input
                  class="input"
                  type="range"
                  min="12"
                  max="18"
                  step="1"
                  value={props.app.fontSize()}
                  onInput={(event) => props.app.setFontSize(Number(event.currentTarget.value))}
                />
              </SettingRow>
            </div>
          </Show>

          <Show when={section() === 'model'}>
            <div class="settings-section">
              <h3>{t().settingsModel}</h3>
              <p class="settings-desc">API key 只写入本地配置文件，不会回传到接口。</p>
              <For each={state.info?.providers ?? []}>
                {(provider) => (
                  <button
                    type="button"
                    class={`provider-card${draft.provider === provider.name ? ' active' : ''}`}
                    onClick={() => chooseProvider(provider.name)}
                  >
                    <span>
                      <div class="name">{provider.name}</div>
                      <div class="meta">
                        {provider.protocol} · {provider.model} · {provider.hasKey ? '已配置 key' : '缺少 key'}
                      </div>
                    </span>
                    <span class="spacer" />
                    <Show when={draft.provider === provider.name}>
                      <Icon name="check" />
                    </Show>
                  </button>
                )}
              </For>
              <SettingRow title={t().model}>
                <input class="input" value={draft.model} onInput={(event) => setDraft('model', event.currentTarget.value)} />
              </SettingRow>
              <SettingRow title={t().baseUrl}>
                <input class="input" value={draft.baseUrl} onInput={(event) => setDraft('baseUrl', event.currentTarget.value)} placeholder="https://api.example.com/v1" />
              </SettingRow>
              <SettingRow title={t().apiKey} hint={draft.clearKey ? '保存后清除本地 key' : '留空表示不修改'}>
                <input
                  class="input"
                  type="password"
                  autocomplete="new-password"
                  value={draft.apiKey}
                  onInput={(event) => setDraft('apiKey', event.currentTarget.value)}
                  placeholder={draft.clearKey ? '将清除' : 'sk-…'}
                />
              </SettingRow>
              <SettingRow title="Key 环境变量">
                <input class="input" value={draft.apiKeyEnv} onInput={(event) => setDraft('apiKeyEnv', event.currentTarget.value)} placeholder="DEEPSEEK_API_KEY" />
              </SettingRow>
              <SettingRow title="清除已保存的 key">
                <Switch checked={draft.clearKey} onChange={(value) => setDraft('clearKey', value)} />
              </SettingRow>
              <div>
                <button class="btn sm" type="button" disabled={testing()} onClick={() => void test()}>
                  <Icon name="play" /> {testing() ? t().testing : t().test}
                </button>
              </div>
            </div>
          </Show>

          <Show when={section() === 'search'}>
            <div class="settings-section">
              <h3>{t().settingsSearch}</h3>
              <SettingRow title="搜索方式" hint="自动：官方内置优先，失败再降级第三方">
                <select class="select" value={draft.searchMode} onChange={(event) => setDraft('searchMode', event.currentTarget.value)}>
                  <option value="auto">自动</option>
                  <option value="native">只用官方内置</option>
                  <option value="api">只用搜索 API</option>
                </select>
              </SettingRow>
              <SettingRow title="第三方搜索源" hint="官方内置不可用时使用；Tavily / Brave 需要 Key">
                <select class="select" value={draft.searchProvider} onChange={(event) => setDraft('searchProvider', event.currentTarget.value)}>
                  <option value="auto">自动</option>
                  <option value="tavily">Tavily</option>
                  <option value="brave">Brave</option>
                </select>
              </SettingRow>
              <p class="settings-desc">
                {['openai', 'anthropic', 'gemini', 'qwen', 'deepseek', 'moonshot', 'openrouter', 'ollama'].includes(state.info?.currentProvider ?? '')
                  ? '当前模型支持官方内置搜索，按次计费。'
                  : '当前模型没有官方搜索，会自动降级到 Brave / Tavily，都没有时使用免费源。'}
              </p>
              <SettingRow title="深度搜索">
                <Switch checked={draft.searchDeep} onChange={(value) => setDraft('searchDeep', value)} />
              </SettingRow>
              <SettingRow title="抓取页数">
                <input class="input" type="number" min="1" max="8" value={draft.searchPages} onInput={(event) => setDraft('searchPages', Number(event.currentTarget.value))} />
              </SettingRow>
              <SettingRow title="搜索语言">
                <select class="select" value={draft.searchLanguage} onChange={(event) => setDraft('searchLanguage', event.currentTarget.value)}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </SettingRow>
              <SettingRow title="Tavily Key">
                <input class="input" type="password" value={draft.tavilyKey} onInput={(event) => setDraft('tavilyKey', event.currentTarget.value)} placeholder="tvly-…" />
              </SettingRow>
              <SettingRow title="Brave Key">
                <input class="input" type="password" value={draft.braveKey} onInput={(event) => setDraft('braveKey', event.currentTarget.value)} placeholder="BSA…" />
              </SettingRow>
            </div>
          </Show>

          <Show when={section() === 'permissions'}>
            <div class="settings-section">
              <h3>{t().settingsPermissions}</h3>
              <p class="settings-desc">ask = 每次确认，allow = 直接执行，deny = 禁止。</p>
              <For each={[
                { key: 'shell', label: '命令执行' },
                { key: 'write', label: '写 / 改文件' },
                { key: 'network', label: '联网请求' },
              ]}>
                {(item) => (
                  <SettingRow title={item.label}>
                    <select
                      class="select"
                      value={draft.permissions[item.key] ?? 'ask'}
                      onChange={(event) => setDraft('permissions', item.key, event.currentTarget.value)}
                    >
                      <option value="ask">ask</option>
                      <option value="allow">allow</option>
                      <option value="deny">deny</option>
                    </select>
                  </SettingRow>
                )}
              </For>
              <SettingRow title="允许访问工作区外" hint="关闭后所有文件工具限制在工作区内">
                <Switch checked={draft.allowOutsideWorkspace} onChange={(value) => setDraft('allowOutsideWorkspace', value)} />
              </SettingRow>
            </div>
          </Show>

          <Show when={section() === 'tools'}>
            <div class="settings-section">
              <h3>{t().settingsTools}</h3>
              <For each={state.info?.tools ?? []}>
                {(tool) => (
                  <SettingRow title={tool.name} hint={tool.description}>
                    <Switch checked={tool.enabled} label={tool.name} onChange={(value) => void props.app.toggleTool(tool.name, value)} />
                  </SettingRow>
                )}
              </For>
            </div>
          </Show>

          <Show when={section() === 'workspace'}>
            <div class="settings-section">
              <h3>{t().settingsWorkspace}</h3>
              <SettingRow title="当前工作区">
                <button class="btn sm" type="button" onClick={() => void props.app.switchWorkspace()}>
                  {state.info?.workspace ?? '选择目录'}
                </button>
              </SettingRow>
              <SettingRow title="信任状态">
                <span class={`tag ${state.info?.trust?.status === 'trusted' ? 'ok' : 'warn'}`}>
                  {state.info?.trust?.status ?? 'none'}
                </span>
              </SettingRow>
              <SettingRow title="项目配置">
                <span class="hint">
                  {state.info?.trust?.hasConfig ? 'AGENT.md / .banana' : '未发现'}
                </span>
              </SettingRow>
              <div>
                <button class="btn sm" type="button" onClick={() => void props.app.trustWorkspace()}>
                  <Icon name="shield" /> 信任并加载
                </button>
              </div>
            </div>
          </Show>

          <Show when={section() === 'verify'}>
            <div class="settings-section">
              <h3>{t().settingsVerify}</h3>
              <p class="settings-desc">每行一条命令，按顺序运行。</p>
              <textarea
                class="textarea"
                rows={6}
                value={draft.verifyCommands}
                onInput={(event) => setDraft('verifyCommands', event.currentTarget.value)}
                placeholder={'npm test\nnpm run build'}
              />
              <div>
                <button class="btn sm" type="button" onClick={() => void props.app.runVerify()}>
                  <Icon name="play" /> {t().runVerify}
                </button>
              </div>
            </div>
          </Show>

          <Show when={section() === 'advanced'}>
            <div class="settings-section">
              <h3>{t().settingsAdvanced}</h3>
              <SettingRow title="最大步数">
                <input class="input" type="number" min="1" max="200" value={draft.maxSteps} onInput={(event) => setDraft('maxSteps', Number(event.currentTarget.value))} />
              </SettingRow>
              <SettingRow title="最大上下文字符">
                <input class="input" type="number" min="10000" step="1000" value={draft.maxContextChars} onInput={(event) => setDraft('maxContextChars', Number(event.currentTarget.value))} />
              </SettingRow>
              <SettingRow title="UI 审计">
                <select class="select" value={draft.uiGuard} onChange={(event) => setDraft('uiGuard', event.currentTarget.value)}>
                  <option value="off">off</option>
                  <option value="warn">warn</option>
                  <option value="enforce">enforce</option>
                </select>
              </SettingRow>
              <div class="field">
                <span class="field-label">系统提示词</span>
                <textarea class="textarea" rows={5} value={draft.systemPrompt} onInput={(event) => setDraft('systemPrompt', event.currentTarget.value)} />
              </div>
              <div class="field">
                <span class="field-label">用户偏好（每行一条）</span>
                <textarea class="textarea" rows={4} value={draft.preferences} onInput={(event) => setDraft('preferences', event.currentTarget.value)} />
              </div>
              <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
                <button class="btn sm" type="button" onClick={() => void props.app.runCompact()}>
                  <Icon name="refresh" /> {t().compact}
                </button>
                <button class="btn sm" type="button" onClick={() => void props.app.runUndo()}>
                  <Icon name="undo" /> {t().undo}
                </button>
                <button class="btn sm danger" type="button" onClick={() => void props.app.clearSession()}>
                  <Icon name="trash" /> {t().clear}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Modal>
  );
}
