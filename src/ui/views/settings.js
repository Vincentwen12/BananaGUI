import { create } from '../dom.js';
import { icon } from '../icons.js';
import { openModal, toast } from './dialogs.js';
import { THEME_LABEL } from '../theme.js';
import { store } from '../store.js';

function field(label, input, help) {
  const wrap = create('div', 'field');
  wrap.append(create('label', '', label));
  wrap.append(input);
  if (help) wrap.append(create('div', 'field-help', help));
  return wrap;
}

function select(options, value) {
  const el = create('select');
  for (const [key, label] of options) {
    const option = create('option', '', label);
    option.value = key;
    if (key === value) option.selected = true;
    el.append(option);
  }
  return el;
}

function textarea(value = '', placeholder = '') {
  const el = create('textarea');
  el.value = value;
  el.placeholder = placeholder;
  return el;
}

function input(value = '', placeholder = '', type = 'text') {
  const el = create('input');
  el.type = type;
  el.value = value;
  el.placeholder = placeholder;
  return el;
}

export function showSettings({ actions }) {
  const info = store.info;
  if (!info) {
    toast('界面还在加载。', 'warn');
    return;
  }
  const savedPrefs = (() => {
    try {
      return JSON.parse(localStorage.getItem('banana-ui-prefs') || '{}');
    } catch {
      return {};
    }
  })();
  let active = 'appearance';
  const body = create('div', 'settings');
  const nav = create('div', 'settings-nav');
  const content = create('div', 'settings-body');
  body.append(nav, content);

  const tabs = [
    ['appearance', '通用设置'],
    ['model', '模型'],
    ['tools', '内置插件'],
    ['advanced', 'Agent 预设'],
  ];
  for (const [key, label] of tabs) {
    const button = create('button', 'settings-tab', label);
    button.type = 'button';
    button.dataset.settingsTab = key;
    button.setAttribute('aria-selected', key === active ? 'true' : 'false');
    button.addEventListener('click', () => {
      active = key;
      for (const item of nav.querySelectorAll('[data-settings-tab]')) {
        item.setAttribute('aria-selected', item.dataset.settingsTab === active ? 'true' : 'false');
      }
      renderSection();
    });
    nav.append(button);
  }

  const draft = {
    current: info.currentProvider,
    model: info.model,
    baseUrl: info.providers.find((provider) => provider.name === info.currentProvider)?.baseUrl ?? '',
    apiKey: '',
    apiKeyEnv: info.providers.find((provider) => provider.name === info.currentProvider)?.apiKeyEnv ?? '',
    clearKey: false,
    permissions: { ...info.permissions },
    showReasoning: info.showReasoning,
    search: {
      provider: info.search.provider,
      deep: info.search.deep,
      deepPages: info.search.deepPages,
      language: info.search.language,
      tavilyKey: '',
      braveKey: '',
      clearTavily: false,
      clearBrave: false,
    },
    theme: store.theme,
    language: store.language,
    allowOutsideWorkspace: info.allowOutsideWorkspace,
    maxSteps: info.maxSteps,
    maxContextChars: info.maxContextChars,
    uiGuard: info.uiGuard,
    systemPrompt: info.systemPrompt,
    preferences: (info.preferences ?? []).join('\n'),
    verifyCommands: (info.verifyCommands ?? []).join('\n'),
  };

  function saveUiPrefs(patch) {
    try {
      const next = { ...savedPrefs, ...patch };
      Object.assign(savedPrefs, patch);
      localStorage.setItem('banana-ui-prefs', JSON.stringify(next));
    } catch {
      // 忽略存储错误
    }
    actions.applyUiPrefs?.();
  }

  function settingRow(title, description, control) {
    const row = create('div', 'setting-row');
    const label = create('div', 'setting-label');
    label.append(create('strong', '', title), create('span', '', description));
    const right = create('div', 'setting-control');
    right.append(control);
    row.append(label, right);
    return row;
  }

  function renderAppearance() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '通用设置'));
    section.append(create('p', 'settings-hint', '默认深色对齐参考图；浅色是纯白底 + 黑字 + 香蕉黄。'));

    const permissionControl = select(
      [
        ['ask', '每次询问'],
        ['allow', '直接执行'],
        ['deny', '禁止'],
      ],
      draft.permissions.shell,
    );
    permissionControl.addEventListener('change', () => {
      draft.permissions = {
        shell: permissionControl.value,
        write: permissionControl.value,
        network: permissionControl.value,
      };
    });
    section.append(settingRow('权限', '选择新会话的默认权限模式', permissionControl));

    const languageSelect = select(
      [
        ['zh', '中文'],
        ['en', 'English'],
      ],
      draft.language,
    );
    languageSelect.addEventListener('change', () => {
      draft.language = languageSelect.value;
      actions.setLanguage(languageSelect.value);
    });
    section.append(settingRow('语言', '界面文案语言，不影响模型回答', languageSelect));

    const themeLabel = create('div');
    themeLabel.append(create('h3', '', '外观'), create('p', 'settings-hint', '三态主题；深色是近黑底 + 香蕉黄。'));
    section.append(themeLabel);
    const cards = create('div', 'theme-cards');
    for (const [mode, label, iconName] of [
      ['light', '浅色', 'sun'],
      ['dark', '深色', 'moon'],
      ['system', '跟随系统', 'monitor'],
    ]) {
      const card = create('button', 'theme-card');
      card.type = 'button';
      card.setAttribute('aria-pressed', draft.theme === mode ? 'true' : 'false');
      const mark = create('span');
      mark.innerHTML = icon(iconName);
      card.append(mark, create('span', '', label));
      card.addEventListener('click', () => {
        draft.theme = mode;
        actions.setTheme(mode);
        for (const item of cards.querySelectorAll('.theme-card')) {
          item.setAttribute('aria-pressed', item.textContent?.includes(label) ? 'true' : 'false');
        }
      });
      cards.append(card);
    }
    section.append(cards);

    const fontSize = select(
      [12, 13, 14, 15, 16].map((value) => [String(value), `${value} px`]),
      String(savedPrefs.fontSize ?? 14),
    );
    fontSize.addEventListener('change', () => saveUiPrefs({ fontSize: Number(fontSize.value) }));
    section.append(settingRow('字号大小', '仅影响对话内容的字号', fontSize));

    const steps = select(
      [
        ['standard', '标准'],
        ['detailed', '详细'],
        ['quiet', '简洁'],
      ],
      savedPrefs.steps ?? 'standard',
    );
    steps.addEventListener('change', () => saveUiPrefs({ steps: steps.value }));
    section.append(settingRow('工作步骤展示', '选择希望看到多少工具调用细节', steps));

    const collapse = select(
      [
        ['after', '回答结束后'],
        ['auto', '自动'],
        ['never', '不收起'],
      ],
      savedPrefs.collapse ?? 'after',
    );
    collapse.addEventListener('change', () => saveUiPrefs({ collapse: collapse.value }));
    section.append(settingRow('工作步骤收起时机', '选择何时自动收起工作步骤', collapse));

    const replies = select(
      [
        ['all', '全部回复'],
        ['last', '仅最后一条'],
      ],
      savedPrefs.replies ?? 'all',
    );
    replies.addEventListener('change', () => saveUiPrefs({ replies: replies.value }));
    section.append(settingRow('收起后显示的回复', '工作步骤收起后，保留哪些助手回复', replies));

    const codeView = create('input', 'switch');
    codeView.type = 'checkbox';
    codeView.checked = savedPrefs.codeView !== false;
    codeView.addEventListener('change', () => saveUiPrefs({ codeView: codeView.checked }));
    section.append(settingRow('显示代码工作视图', '在对话里显示代码块和工具输出', codeView));

    frag.append(section);
    return frag;
  }

  function renderTools() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '内置插件'));
    section.append(create('p', 'settings-hint', '内置工具默认全部启用；关闭后 agent 不会调用它。'));
    for (const tool of info.tools.filter((item) => item.builtin)) {
      const toggle = create('input', 'switch');
      toggle.type = 'checkbox';
      toggle.checked = tool.enabled;
      toggle.addEventListener('change', () => {
        actions.toggleTool?.(tool.name, toggle.checked);
      });
      section.append(settingRow(tool.name, tool.description, toggle));
    }
    frag.append(section);
    return frag;
  }

  function renderModel() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '模型服务'));
    section.append(create('p', 'settings-hint', 'API key 只写入本机配置文件，不会从界面或接口回传。'));
    const providerNames = info.providers.map((provider) => [provider.name, provider.name]);
    const providerSelect = select(providerNames, draft.current);
    const providerCurrent = info.providers.find((provider) => provider.name === draft.current);
    const modelInput = input(draft.model, '模型名');
    const baseInput = input(draft.baseUrl, 'https://api.example.com/v1');
    const envInput = input(draft.apiKeyEnv, '例如 DEEPSEEK_API_KEY');
    const keyInput = input('', providerCurrent?.hasKey ? '已保存；留空保持不变' : '粘贴 API key', 'password');
    const keyState = create(
      'div',
      'key-state',
      providerCurrent?.hasKey
        ? `已配置 · ${providerCurrent.keySource === 'env' ? `环境变量 ${providerCurrent.apiKeyEnv}` : providerCurrent.keySource === 'local' ? '本地服务' : '配置文件'}`
        : '未配置',
    );
    const clearKey = create('input');
    clearKey.type = 'checkbox';
    const clearRow = create('label', 'check-row');
    clearRow.append(clearKey, create('span', '', '清除已保存的 API key'));
    clearKey.addEventListener('change', () => {
      draft.clearKey = clearKey.checked;
    });
    const testButton = create('button', 'btn small', '保存并测试');
    testButton.type = 'button';
    const testResult = create('div', 'field-help', '');
    testButton.addEventListener('click', async () => {
      testButton.disabled = true;
      testResult.textContent = '正在保存并测试…';
      try {
        await actions.saveSettings(buildPatch(), false);
        const result = await actions.testConnection(draft.current);
        testResult.textContent = result.ok ? `连接成功：${result.detail}` : `连接失败：${result.detail}`;
      } catch (error) {
        testResult.textContent = `失败：${error.message}`;
      } finally {
        testButton.disabled = false;
      }
    });
    providerSelect.addEventListener('change', () => {
      draft.current = providerSelect.value;
      const next = info.providers.find((provider) => provider.name === draft.current);
      draft.model = next?.model ?? '';
      draft.baseUrl = next?.baseUrl ?? '';
      draft.apiKeyEnv = next?.apiKeyEnv ?? '';
      modelInput.value = draft.model;
      baseInput.value = draft.baseUrl;
      envInput.value = draft.apiKeyEnv;
      keyInput.value = '';
      keyInput.placeholder = next?.hasKey ? '已保存；留空保持不变' : '粘贴 API key';
      keyState.textContent = next?.hasKey ? `已配置 · ${next.keySource === 'env' ? `环境变量 ${next.apiKeyEnv}` : '配置文件'}` : '未配置';
    });
    modelInput.addEventListener('input', () => {
      draft.model = modelInput.value;
    });
    baseInput.addEventListener('input', () => {
      draft.baseUrl = baseInput.value;
    });
    envInput.addEventListener('input', () => {
      draft.apiKeyEnv = envInput.value;
    });
    keyInput.addEventListener('input', () => {
      draft.apiKey = keyInput.value;
    });
    section.append(
      field('Provider', providerSelect),
      field('模型名', modelInput),
      field('Base URL', baseInput, '接自建网关、vLLM、LiteLLM 时改这里。'),
      field('API key 环境变量名', envInput, '优先使用环境变量；本地服务通常不需要 key。'),
      field('API key', keyInput, '保存后不会回显。'),
      keyState,
      clearRow,
      testResult,
      testButton,
    );
    frag.append(section);
    return frag;
  }

  function renderPermissions() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '工具权限'));
    section.append(create('p', 'settings-hint', 'ask = 每次弹窗确认；allow = 直接执行；deny = 禁止。'));
    for (const key of ['shell', 'write', 'network']) {
      const control = select(
        [
          ['ask', 'ask · 每次询问'],
          ['allow', 'allow · 直接执行'],
          ['deny', 'deny · 禁止'],
        ],
        draft.permissions[key],
      );
      control.addEventListener('change', () => {
        draft.permissions[key] = control.value;
      });
      section.append(field(key === 'shell' ? '命令执行' : key === 'write' ? '写 / 改文件' : '网络访问', control));
    }
    const allowOutside = create('input');
    allowOutside.type = 'checkbox';
    allowOutside.checked = draft.allowOutsideWorkspace;
    allowOutside.addEventListener('change', () => {
      draft.allowOutsideWorkspace = allowOutside.checked;
    });
    const row = create('label', 'check-row');
    row.append(allowOutside, create('span', '', '允许 agent 访问工作区之外的路径（谨慎开启；文件面板仍只显示工作区）'));
    section.append(row);
    const reasoning = create('input');
    reasoning.type = 'checkbox';
    reasoning.checked = draft.showReasoning;
    reasoning.addEventListener('change', () => {
      draft.showReasoning = reasoning.checked;
    });
    const reasoningRow = create('label', 'check-row');
    reasoningRow.append(reasoning, create('span', '', '显示推理模型的思考过程'));
    section.append(reasoningRow);
    frag.append(section);
    return frag;
  }

  function renderSearch() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '联网搜索'));
    section.append(create('p', 'settings-hint', '没有 Tavily / Brave key 时会合并免费源；key 不会回传。'));
    const provider = select(
      [
        ['auto', 'auto · 自动选择'],
        ['tavily', 'tavily'],
        ['brave', 'brave'],
        ['free', 'free · 只抓免费源'],
      ],
      draft.search.provider,
    );
    provider.addEventListener('change', () => {
      draft.search.provider = provider.value;
    });
    const language = select(
      [
        ['en', '英文 / 技术源优先'],
        ['auto', '自动'],
        ['zh', '中文'],
      ],
      draft.search.language,
    );
    language.addEventListener('change', () => {
      draft.search.language = language.value;
    });
    const deep = create('input');
    deep.type = 'checkbox';
    deep.checked = draft.search.deep;
    deep.addEventListener('change', () => {
      draft.search.deep = deep.checked;
    });
    const deepRow = create('label', 'check-row');
    deepRow.append(deep, create('span', '', '深度搜索：额外读前几页正文（更慢、更费 token）'));
    const pages = input(String(draft.search.deepPages), '3', 'number');
    pages.min = '1';
    pages.max = '8';
    pages.addEventListener('input', () => {
      draft.search.deepPages = Number(pages.value) || 3;
    });
    const tavily = input('', info.search.hasTavily ? '已配置；留空保持不变' : 'TAVILY_API_KEY', 'password');
    tavily.addEventListener('input', () => {
      draft.search.tavilyKey = tavily.value;
    });
    const brave = input('', info.search.hasBrave ? '已配置；留空保持不变' : 'BRAVE_API_KEY', 'password');
    brave.addEventListener('input', () => {
      draft.search.braveKey = brave.value;
    });
    section.append(
      field('搜索源', provider),
      field('语言偏好', language),
      deepRow,
      field('深度搜索页数', pages),
      field('Tavily key', tavily),
      field('Brave key', brave),
    );
    frag.append(section);
    return frag;
  }

  function renderProject() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '当前工作区'));
    section.append(create('p', 'settings-hint', info.workspace));
    const pathInput = input(info.workspace, '绝对路径');
    pathInput.readOnly = true;
    section.append(field('路径', pathInput));
    if (info.agentDocPath) {
      section.append(create('div', 'field-help', `项目规则：${info.agentDocPath}`));
    }
    if (info.trust?.status === 'pending') {
      const trustButton = create('button', 'btn small', '信任并加载项目产物');
      trustButton.type = 'button';
      trustButton.addEventListener('click', () => {
        actions.trustProject?.();
        toast('正在加载项目产物…', 'warn');
        actions.closeSettings?.();
      });
      section.append(trustButton);
    } else if (info.trust?.status === 'trusted') {
      section.append(create('div', 'field-help', '项目配置/插件/AGENT.md 已信任并加载。'));
    }
    frag.append(section);
    return frag;
  }

  function renderAdvanced() {
    const frag = document.createDocumentFragment();
    const section = create('div', 'settings-section');
    section.append(create('h3', '', '高级'));
    const system = textarea(draft.systemPrompt);
    system.addEventListener('input', () => {
      draft.systemPrompt = system.value;
    });
    const verify = textarea(draft.verifyCommands, '每行一条，例如 npm test');
    verify.addEventListener('input', () => {
      draft.verifyCommands = verify.value;
    });
    const preferences = textarea(draft.preferences, '每行一条偏好');
    preferences.addEventListener('input', () => {
      draft.preferences = preferences.value;
    });
    const maxSteps = input(String(draft.maxSteps), '500', 'number');
    maxSteps.addEventListener('input', () => {
      draft.maxSteps = Number(maxSteps.value) || 500;
    });
    const maxContext = input(String(draft.maxContextChars), '80000', 'number');
    maxContext.addEventListener('input', () => {
      draft.maxContextChars = Number(maxContext.value) || 80000;
    });
    const guard = select(
      [
        ['enforce', 'enforce · 阻止交付'],
        ['warn', 'warn · 只提醒'],
        ['off', 'off · 关闭'],
      ],
      draft.uiGuard,
    );
    guard.addEventListener('change', () => {
      draft.uiGuard = guard.value;
    });
    const row = create('div', 'field-row');
    row.append(field('最大步数', maxSteps), field('上下文上限（字符）', maxContext));
    section.append(
      field('系统提示词', system),
      field('验收命令', verify),
      field('用户偏好', preferences),
      row,
      field('UI 质量门禁', guard),
    );
    frag.append(section);
    return frag;
  }

  function renderSection() {
    content.replaceChildren();
    if (active === 'appearance') {
      content.append(renderAppearance());
      content.append(renderSearch());
      content.append(renderProject());
    } else if (active === 'model') content.append(renderModel());
    else if (active === 'tools') content.append(renderTools());
    else content.append(renderAdvanced());
  }

  function buildPatch() {
    return {
      current: draft.current,
      provider: {
        name: draft.current,
        model: draft.model,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
        apiKeyEnv: draft.apiKeyEnv,
        clearKey: draft.clearKey,
      },
      permissions: draft.permissions,
      search: {
        provider: draft.search.provider,
        deep: draft.search.deep,
        deepPages: draft.search.deepPages,
        language: draft.search.language,
        tavilyKey: draft.search.tavilyKey || undefined,
        braveKey: draft.search.braveKey || undefined,
      },
      showReasoning: draft.showReasoning,
      allowOutsideWorkspace: draft.allowOutsideWorkspace,
      maxSteps: draft.maxSteps,
      maxContextChars: draft.maxContextChars,
      uiGuard: draft.uiGuard,
      systemPrompt: draft.systemPrompt,
      preferences: draft.preferences.split('\n').map((item) => item.trim()).filter(Boolean),
      verifyCommands: draft.verifyCommands.split('\n').map((item) => item.trim()).filter(Boolean),
    };
  }

  const foot = create('div');
  const cancel = create('button', 'btn', '取消');
  cancel.type = 'button';
  const save = create('button', 'btn primary', '保存设置');
  save.type = 'button';
  cancel.addEventListener('click', () => modal.close());
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await actions.saveSettings(buildPatch(), true);
      modal.close();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      save.disabled = false;
    }
  });
  foot.append(cancel, save);
  const configButton = create('button', 'btn small', '打开配置文件');
  configButton.type = 'button';
  configButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('~/.banana/config.json');
      toast('配置文件路径已复制：~/.banana/config.json', 'ok');
    } catch {
      toast('配置文件：~/.banana/config.json（Windows 默认 D:\\BananaCLI-data\\config.json）', 'warn', 6000);
    }
  });
  const modal = openModal({
    title: '设置',
    subtitle: '模型、权限、搜索和界面偏好都保存在本机。',
    body,
    footer: foot,
    wide: true,
    headerAction: configButton,
  });
  renderSection();
  return modal;
}
