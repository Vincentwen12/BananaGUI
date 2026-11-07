// Banana GUI：零依赖前端。只用自绘 SVG 图标，无 emoji，无第三方 UI。
// 注意结尾斜杠：API 是前缀，所有请求都直接拼名字（如 API + 'action'）
const API = location.pathname.replace(/\/+$/, '') + '/api/';

// ---------------- 自绘图标 ----------------
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  sliders: '<path d="M4 8h8M16 8h4M4 16h4M12 16h8"/><circle cx="14" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
  undo: '<path d="M9 8H4m0 0 3.5-3.5M4 8h9a6 6 0 0 1 0 12h-4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3.5l7 2.5V12c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6z"/>',
  file: '<path d="M9 3.5h5l4.5 4.5v12.5H9z"/><path d="M14 3.5V8h4.5"/>',
  terminal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l2.5 2L7 14M12.5 14.5H16"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 20 20"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.4 2.4 13.6 0 16-2.4-2.4-2.4-13.6 0-16z"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  pencil: '<path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19z"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l4.5-4.5L13 16l3-3 4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  folder: '<path d="M4 6.5h5.5L12 9h8v10.5H4z"/>',
  message: '<path d="M4 5.5h16v11H9.5L4 20z"/>',
  listCheck: '<path d="M4 7h10M4 12h10M4 17h6M17 15.5l1.5 1.5L22 13"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  panel: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M14 5v14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  download: '<path d="M12 4v10M8 11l4 4 4-4M5 19h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M12 4a8 8 0 010 16" fill="currentColor" stroke="none"/>',
  plug: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  wrap: '<path d="M4 6h16M4 12h12a3 3 0 1 1 0 6h-3M4 18h4"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  restore: '<rect x="5" y="8" width="9" height="9" rx="1"/><path d="M9 5h9v9"/>',
  diff: '<path d="M6 4v16M18 4v16M3 8h6M15 16h6M3 16h6M15 8h6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4.5v5h5"/><path d="M12 8v4.5l3 1.8"/>',
  attach: '<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.4 3.4 0 0 1 4.8 4.8L10 17a1.8 1.8 0 0 1-2.5-2.5l6.7-6.7"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};

const TOOL_ICON = {
  read_file: 'file', write_file: 'pencil', edit_file: 'pencil', list_dir: 'folder',
  glob: 'search', grep: 'search', shell: 'terminal', web_search: 'globe',
  web_fetch: 'globe', todo_write: 'listCheck', todo_read: 'listCheck',
};

const TOOL_LABEL = {
  read_file: '读取文件',
  write_file: '写入文件',
  edit_file: '修改文件',
  list_dir: '查看目录',
  glob: '查找文件',
  grep: '搜索代码',
  shell: '运行命令',
  web_search: '搜索网页',
  web_fetch: '读取网页',
  todo_write: '更新任务',
  todo_read: '读取任务',
};

function toolLabel(name) {
  return TOOL_LABEL[name] ?? name;
}

function svg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.file}</svg>`;
}

const $ = (id) => document.getElementById(id);

// ---------------- Markdown（够用即可） ----------------
const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 这些值也会进 href/alt 之类的属性，引号必须一起转义。
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function inline(text) {
  const codes = [];
  // 先占位行内代码，避免 `a**b**c` 里的 ** 被粗体规则吃掉。
  let value = escapeHtml(text).replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  value = value
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\[(事实|推断|猜测)-([^\]\n]{1,24})\]/g, (_, kind, source) => {
      const key = kind === '事实' ? 'fact' : kind === '推断' ? 'infer' : 'guess';
      return `<span class="fact-tag is-${key}">${kind} · ${source}</span>`;
    });
  return value.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)] ?? ''}</code>`);
}

/**
 * 流式 Markdown 的稳定切分：空白行之前已经完成的内容不再重绘，
 * 只更新最后一段未完成内容，避免思考/回答在流式时整体高度反复跳。
 */
function splitStableMarkdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  let offset = 0;
  let boundary = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line)) inFence = !inFence;
    offset += line.length + (index < lines.length - 1 ? 1 : 0);
    if (!inFence && /^\s*$/.test(line)) boundary = offset;
  }
  return [source.slice(0, boundary), source.slice(boundary)];
}

function createMarkdownStream(container) {
  const stable = document.createElement('div');
  stable.className = 'stream-stable';
  const tail = document.createElement('div');
  tail.className = 'stream-tail';
  container.replaceChildren(stable, tail);
  let lastHead = '';
  let lastTail = '';
  let finished = false;
  const paint = (text) => {
    const [head, tailText] = splitStableMarkdown(text);
    if (head !== lastHead) {
      stable.innerHTML = markdown(head);
      lastHead = head;
    }
    if (tailText !== lastTail) {
      tail.innerHTML = markdown(tailText);
      lastTail = tailText;
    }
  };
  return {
    render(text) {
      if (!finished) paint(text);
    },
    finish(text) {
      if (finished) return;
      paint(text);
      finished = true;
    },
    setError(html) {
      finished = true;
      container.innerHTML = html;
    },
  };
}

function markdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().replace(/[^\w+-]/g, '');
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      const codeClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre class="code" data-lang="${escapeHtml(lang)}"><code${codeClass}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i += 1; continue; }
    // 简单表格：| a | b | + | --- | --- |
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|')) {
      const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      const separator = cells(lines[i + 1]);
      const isSeparator = separator.length > 0 && separator.every((cell) => /^:?-{2,}:?$/.test(cell));
      if (isSeparator) {
        const header = cells(line);
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
          rows.push(cells(lines[i]));
          i += 1;
        }
        out.push(
          '<div class="table-wrap"><table><thead><tr>' +
            header.map((cell) => `<th>${inline(cell)}</th>`).join('') +
            '</tr></thead><tbody>' +
            rows
              .map((row) => `<tr>${header.map((_, index) => `<td>${inline(row[index] ?? '')}</td>`).join('')}</tr>`)
              .join('') +
            '</tbody></table></div>',
        );
        continue;
      }
    }
    if (/^###\s/.test(line)) { out.push(`<h3>${inline(line.replace(/^###\s/, ''))}</h3>`); i += 1; continue; }
    if (/^##\s/.test(line)) { out.push(`<h2>${inline(line.replace(/^##\s/, ''))}</h2>`); i += 1; continue; }
    if (/^#\s/.test(line)) { out.push(`<h1>${inline(line.replace(/^#\s/, ''))}</h1>`); i += 1; continue; }
    if (/^\s*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s/, '')); i += 1; }
      out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s/, '')); i += 1; }
      out.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const items = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { items.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      out.push(`<blockquote>${items.map((item) => inline(item)).join('<br/>')}</blockquote>`);
      continue;
    }
    const para = [line];
    i += 1;
    while (i < lines.length && !/^(`|#{1,3}\s|>\s?|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('');
}

// ---------------- 语法高亮 ----------------
const LANG_BY_EXT = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  css: 'css', scss: 'scss', less: 'less', sql: 'sql', yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini', diff: 'diff', patch: 'diff', dockerfile: 'dockerfile',
};

function highlightAll(root = document) {
  if (!window.hljs) return;
  for (const node of root.querySelectorAll('pre code')) {
    if (node.dataset.highlighted === 'yes' || !node.textContent.trim()) continue;
    try {
      window.hljs.highlightElement(node);
    } catch {
      /* 单个代码块失败不影响整页 */
    }
  }
}

/** 文件预览：按扩展名挑语言；未知扩展名保持纯文本。 */
function highlightPreview(element, path, code) {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  const lang = LANG_BY_EXT[ext];
  if (!window.hljs || !lang || code.length > 300_000) {
    element.textContent = code;
    return;
  }
  element.innerHTML = `<code class="language-${lang}"></code>`;
  const node = element.firstElementChild;
  node.textContent = code;
  try {
    window.hljs.highlightElement(node);
  } catch {
    element.textContent = code;
  }
}



// ---------------- 状态 ----------------
const state = {
  info: null,
  sessions: [],
  attachments: [],
  busy: false,
  pendingApproval: null,
  settingsCategory: 'model',
  settingsScroll: 0,
  plugins: null,
  preview: null,
  overlay: null,
  ccIndex: 0,
  ccItems: [],
  tabs: [],
  activeTab: null,
  review: { open: false, mode: 'changes', width: 520 },
  sidebar: { open: true, width: 344 },
  sessionQuery: '',
  status: '',
  stickToBottom: true,
  dock: { open: false, height: 280 },
  changes: null,
  changesFile: null,
  todoOpen: true,
  attachmentPath: '',
  trustPrompted: false,
};

const THREAD = $('thread');

// 单一滚动相机：始终追底，用缓动逼近，避免每个 chunk 都重启 smooth 动画。
const camera = {
  raf: 0,
  running: false,
  follow: true,
  lastTop: 0,
  programmaticAt: 0,
  lastUserScroll: 0,
};

function prefersReducedMotion() {
  return (
    document.documentElement.dataset.reduceMotion === '1' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function stopCamera() {
  camera.running = false;
  if (camera.raf) cancelAnimationFrame(camera.raf);
  camera.raf = 0;
}

function cameraMax() {
  return Math.max(0, THREAD.scrollHeight - THREAD.clientHeight);
}

function cameraTick() {
  if (!camera.running) return;
  if (!camera.follow) {
    stopCamera();
    return;
  }
  const target = cameraMax();
  const current = THREAD.scrollTop;
  const distance = target - current;
  if (distance <= 0.8) {
    THREAD.scrollTop = target;
    camera.lastTop = target;
    camera.programmaticAt = Date.now();
    stopCamera();
    return;
  }
  const step = Math.min(64, Math.max(1, distance * 0.12));
  THREAD.scrollTop = current + step;
  camera.lastTop = THREAD.scrollTop;
  camera.programmaticAt = Date.now();
  camera.raf = requestAnimationFrame(cameraTick);
}

function setCameraFollow(follow) {
  camera.follow = Boolean(follow);
  state.stickToBottom = camera.follow;
  // 暂停跟随时恢复浏览器滚动锚定，用户在读旧内容时不会被上方新内容推走。
  THREAD.style.overflowAnchor = camera.follow ? 'none' : 'auto';
  if (!camera.follow) {
    stopCamera();
    if (THREAD.querySelector('.msg')) $('jumpLatest').hidden = false;
  }
}

// 历史消息 / 新回复渲染完成后统一高亮，避免流式过程中反复解析
let highlightFrame = 0;
const highlightObserver = new MutationObserver(() => {
  if (highlightFrame) return;
  highlightFrame = requestAnimationFrame(() => {
    highlightFrame = 0;
    highlightAll(THREAD);
  });
});
highlightObserver.observe(THREAD, { childList: true, subtree: true });

// ---------------- 渲染 ----------------
function hydrate(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    if (node.dataset.iconDone) return;
    node.innerHTML = svg(node.dataset.icon);
    node.dataset.iconDone = '1';
  });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** 窄屏下侧边栏是覆盖层，选完会话必须收起来，否则挡住对话。 */
function closeSidebarIfOverlay() {
  if (window.matchMedia('(max-width: 900px)').matches && state.sidebar.open) setSidebar(false);
}

let switching = false;
/**
 * 切换会话。直接吃 POST 返回的 info/sessions，不再多跑一次 refresh：
 * 少一次往返、也不会和其他请求抢着改 state（之前表现为「点了没反应」）。
 */
async function switchSession(ref) {
  if (switching) return;
  if (state.busy) {
    toast('正在生成，先停止当前任务再切换会话');
    return;
  }
  switching = true;
  document.body.classList.add('switching');
  try {
    const result = await post('session', { action: 'switch', ref });
    if (result?.info) state.info = result.info;
    if (result?.sessions) state.sessions = result.sessions;
    state.changes = null;
    // 附件属于当前草稿，切会话时不能带到另一个会话里。
    state.attachments = [];
    renderAttachments();
    renderHeader();
    renderSidebar();
    renderThread();
    $('input').value = '';
    grow();
    $('filesTitle').textContent = `项目文件 · ${state.info?.workspace ?? ''}`;
    setActiveTab(state.info?.session?.id ?? null);
    if (state.review.open && state.review.mode === 'changes') void loadChanges(true);
    closeSidebarIfOverlay();
  } catch (error) {
    toast('切换会话失败：' + (error?.message ?? error));
    await refresh(true);
  } finally {
    switching = false;
    document.body.classList.remove('switching');
  }
}

/** 新建会话。命令 /new 和顶部 + 共用同一条路径，避免两套逻辑漂移。 */
async function createSession(title = '') {
  if (state.busy) {
    toast('正在生成，先停止当前任务再新建对话');
    return null;
  }
  try {
    const result = await post('session', { action: 'new', ...(title ? { title } : {}) });
    if (result?.info) state.info = result.info;
    if (result?.sessions) state.sessions = result.sessions;
    state.changes = null;
    state.attachments = [];
    renderAttachments();
    renderHeader();
    renderSidebar();
    renderThread();
    if (state.dock.open) termClose();
    closeSidebarIfOverlay();
    setActiveTab(state.info?.session?.id ?? null);
    $('input').value = '';
    grow();
    $('input').focus();
    return result;
  } catch (error) {
    toast('新建对话失败：' + (error?.message ?? error));
    return null;
  }
}

// ---------------- 会话标签条 ----------------
function tabTitleFor(id) {
  if (state.info?.session?.id === id && state.info.session.title) return state.info.session.title;
  return state.sessions.find((item) => item.id === id)?.title || '新对话';
}

function saveTabs() {
  try {
    localStorage.setItem(
      SHELL_STORAGE.tabState,
      JSON.stringify({ all: state.tabs, active: state.activeTab }),
    );
  } catch {}
}

function upsertTab(id, title) {
  if (!id) return;
  const existing = state.tabs.find((tab) => tab.id === id);
  if (existing) {
    if (title) existing.title = title;
    return;
  }
  state.tabs.push({ id, title: title || tabTitleFor(id) });
}

function setActiveTab(id) {
  state.activeTab = id;
  if (id) upsertTab(id);
  saveTabs();
  renderTabs();
  renderSidebar();
}

function renderTabs() {
  const strip = $('tabStrip');
  if (!strip) return;
  strip.innerHTML = '';
  for (const tab of state.tabs) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `tab${tab.id === state.activeTab ? ' is-active' : ''}`;
    node.draggable = true;
    node.dataset.id = tab.id;
    const title = tabTitleFor(tab.id) || tab.title || '新对话';
    const isNew = title === '新对话';
    node.classList.toggle('is-running', state.busy && tab.id === state.activeTab);
    node.innerHTML =
      `<span class="tab-avatar${isNew ? ' is-new' : ''}">${isNew ? '' : escapeHtml(title.slice(0, 1))}</span>` +
      `<span class="tab-title">${escapeHtml(title)}</span>` +
      `<span class="tab-close" title="关闭标签"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></span>`;
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.tab-close')) return;
      if (tab.id !== state.activeTab) {
        event.preventDefault();
        switchSession(tab.id);
      }
    });
    node.addEventListener('click', (event) => {
      if (event.target.closest('.tab-close')) {
        event.stopPropagation();
        closeTab(tab.id);
        return;
      }
      if (event.detail === 0) switchSession(tab.id);
    });
    node.addEventListener('auxclick', (event) => {
      if (event.button === 1) closeTab(tab.id);
    });
    node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', tab.id);
      node.classList.add('is-dragging');
    });
    node.addEventListener('dragend', () => node.classList.remove('is-dragging'));
    node.addEventListener('dragover', (event) => event.preventDefault());
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      const source = event.dataTransfer.getData('text/plain');
      const from = state.tabs.findIndex((item) => item.id === source);
      const to = state.tabs.findIndex((item) => item.id === tab.id);
      if (from < 0 || to < 0 || from === to) return;
      const [picked] = state.tabs.splice(from, 1);
      state.tabs.splice(to, 0, picked);
      saveTabs();
      renderTabs();
    });
    strip.appendChild(node);
  }
}

function closeTab(id) {
  if (state.busy && id === state.activeTab) {
    toast('正在生成，先停止当前任务再关闭标签');
    return;
  }
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  state.tabs.splice(index, 1);
  saveTabs();
  if (state.activeTab !== id) {
    renderTabs();
    return;
  }
  if (state.tabs.length) {
    const next = state.tabs[Math.max(0, index - 1)] ?? state.tabs[0];
    switchSession(next.id);
  } else {
    state.activeTab = null;
    renderTabs();
    $('newChat').click();
  }
}

function initTabs() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SHELL_STORAGE.tabState) || 'null');
  } catch {}
  const draft = Boolean(state.info?.session?.draft);
  if (saved && Array.isArray(saved.all)) {
    const known = new Set(state.sessions.map((item) => item.id));
    if (state.info?.session?.id && !draft) known.add(state.info.session.id);
    state.tabs = saved.all.filter((tab) => tab && typeof tab.id === 'string' && known.has(tab.id));
    state.activeTab = saved.active ?? null;
  }
  const current = draft ? null : state.info?.session?.id;
  if (current) upsertTab(current, state.info.session.title);
  if (!state.activeTab || !state.tabs.some((tab) => tab.id === state.activeTab)) {
    state.activeTab = current ?? state.tabs[0]?.id ?? null;
  }
  renderTabs();
}

function renderSidebar() {
  const list = $('sessionList');
  list.innerHTML = '';
  let group = '';
  const dayOf = (iso) => {
    const date = new Date(iso);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const value = date.getTime();
    if (value >= start) return '今天';
    if (value >= start - 86_400_000) return '昨天';
    return '更早';
  };
  const sessions = state.sessions.filter((item) => {
    const q = state.sessionQuery.trim().toLowerCase();
    return !q || String(item.title ?? '').toLowerCase().includes(q);
  });
  if (!sessions.length) {
    const hint = document.createElement('div');
    hint.className = 'sb-empty';
    hint.textContent = state.sessionQuery ? '没有匹配的会话' : '还没有对话';
    list.appendChild(hint);
    return;
  }
  sessions.forEach((item, index) => {
    const label = dayOf(item.updatedAt);
    if (label !== group) {
      group = label;
      const head = document.createElement('div');
      head.className = 'sb-group';
      head.textContent = label;
      list.appendChild(head);
    }
    const active = item.id === state.info?.session?.id ? ' is-active' : '';
    const node = document.createElement('div');
    node.className = `session-item${active}`;
    node.style.setProperty('--i', String(Math.min(index, 12)));
    node.innerHTML =
      `<span class="s-actions">` +
      `<span class="s-act" data-menu="${item.id}" title="更多">${svg('dots')}</span>` +
      `<span class="s-act" data-del="${item.id}" title="删除">${svg('trash')}</span>` +
      `</span>` +
      `<span class="s-title">${escapeHtml(item.title || '新对话')}</span>` +
      `<span class="s-meta">${item.turns} 轮 · ${relativeTime(item.updatedAt)}</span>`;

    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.addEventListener('click', (event) => {
      if (event.target.closest('[data-del], [data-menu]')) return;
      switchSession(item.id);
    });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        switchSession(item.id);
      }
    });

    node.querySelector('[data-del]').addEventListener('click', async (event) => {
      event.stopPropagation();
      if (state.busy) {
        toast('正在生成，先停止当前任务再删除会话');
        return;
      }
      const confirmed = await openAppDialog({
        title: '删除这个会话？',
        body: `「${item.title || '新对话'}」会从本地删除，无法恢复。`,
        confirmLabel: '删除',
        danger: true,
      });
      if (!confirmed) return;
      try {
        const wasActive = item.id === state.info?.session?.id;
        const result = await post('session', { action: 'delete', ref: item.id });
        state.tabs = state.tabs.filter((tab) => tab.id !== item.id);
        if (result?.sessions) state.sessions = result.sessions;
        if (wasActive) {
          state.changes = null;
          if (result?.info) state.info = result.info;
          state.attachments = [];
          renderAttachments();
          $('input').value = '';
          grow();
          if (state.info?.session?.draft) {
            // 删光所有会话：回到干净的空白首页，不再自动建一个「新对话」。
            state.tabs = [];
            state.activeTab = null;
            saveTabs();
            renderTabs();
            renderHeader();
            renderSidebar();
            renderThread();
          } else {
            saveTabs();
            renderHeader();
            renderSidebar();
            renderThread();
            setActiveTab(state.info?.session?.id ?? null);
          }
        } else {
          saveTabs();
          renderSidebar();
          renderTabs();
        }
        toast(state.info?.session?.draft ? '已删除最后一个会话' : '已删除会话');
      } catch (error) {
        toast('删除失败：' + (error?.message ?? error));
      }
    });

    node.querySelector('[data-menu]').addEventListener('click', (event) => {
      event.stopPropagation();
      openSessionMenu(item, node);
    });
    list.appendChild(node);
  });
}

/** 会话操作菜单：切换 / 重命名 / 导出 Markdown / 导出 JSON */
function openSessionMenu(item, anchor) {
  document.querySelector('.popover')?.remove();
  const rect = anchor.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.innerHTML = `
    <button data-act="switch">打开会话</button>
    <button data-act="rename">重命名</button>
    <button data-act="md">导出 Markdown</button>
    <button data-act="json">导出 JSON</button>`;
  document.body.appendChild(pop);
  // 先量再定位：贴着按钮右边缘，并且始终留在视口内
  pop.style.visibility = 'hidden';
  pop.style.left = '0px';
  pop.style.top = '0px';
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const top = rect.bottom + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = '';

  const close = () => {
    pop.remove();
    document.removeEventListener('click', close, true);
  };
  document.addEventListener('click', close, true);

  pop.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action) return;
    event.stopPropagation();
    close();
    if (action === 'switch') {
      await switchSession(item.id);
    } else if (action === 'rename') {
      await renameSession(item);
    } else {
      await downloadSession(action === 'json' ? 'json' : 'md', item.id);
    }
  });
}

/** 重命名指定会话。不会像以前那样先切过去，避免打断当前阅读/生成。 */
async function renameSession(item) {
  if (item.id === state.info?.session?.id && state.busy) {
    toast('正在生成，先停止当前任务再重命名');
    return;
  }
  const title = await openAppDialog({
    title: '重命名会话',
    value: item.title || '',
    placeholder: '输入新的标题',
    confirmLabel: '保存',
  });
  if (title === null) return;
  if (!title) {
    toast('标题不能为空');
    return;
  }
  try {
    const result = await post('session', { action: 'rename', ref: item.id, title });
    if (result?.info) state.info = result.info;
    if (result?.sessions) state.sessions = result.sessions;
    renderHeader();
    renderSidebar();
    renderTabs();
    toast('已重命名');
  } catch (error) {
    toast('重命名失败：' + (error?.message ?? error));
  }
}

function sessionToMarkdown(messages, title) {
  const lines = [`# ${title || '对话'}`, '', `导出时间：${new Date().toLocaleString()}`, ''];
  for (const message of messages) {
    if (message.role === 'tool') continue;
    lines.push(message.role === 'user' ? '## 你' : '## Banana', '');
    lines.push(message.content || '(空)');
    if (message.toolCalls?.length) {
      lines.push('', '工具调用：');
      for (const call of message.toolCalls) {
        lines.push(`- \`${call.name}\` ${JSON.stringify(call.input ?? {}).slice(0, 200)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function downloadSession(format, id) {
  // 始终从服务端读取完整会话：/api/info 为了性能裁掉了图片 base64 和附件全文。
  const targetId = id || state.info?.session?.id;
  if (!targetId) return;
  let session;
  try {
    const result = await post('session', { action: 'load', ref: targetId });
    session = result?.session;
  } catch (error) {
    toast('导出失败：' + (error?.message ?? error));
    return;
  }
  if (!session) {
    toast('导出失败：没找到这个对话');
    return;
  }
  const blob =
    format === 'json'
      ? JSON.stringify(session, null, 2)
      : sessionToMarkdown(session.messages, session.title);
  const blobUrl = URL.createObjectURL(new Blob([blob], { type: format === 'json' ? 'application/json' : 'text/markdown' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${(session.title || id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  toast(`已导出 ${format === 'json' ? 'JSON' : 'Markdown'}`);
}

function toolSummaryText(call) {
  const input = call.input ?? {};
  if (typeof input.command === 'string') return input.command;
  return JSON.stringify(input).slice(0, 110);
}

function ensureToolOutput(row, initial = '', isError = false) {
  let out = row.nextElementSibling;
  if (!out || !out.classList.contains('tool-output')) {
    out = document.createElement('div');
    out.className = 'tool-output';
    out.hidden = true;
    row.after(out);
  }
  out.classList.toggle('is-error', isError);
  if (initial) out.textContent = initial;
  row.classList.add('is-clickable');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-expanded', String(!out.hidden));
  row.title = '点击展开命令输出';
  if (!row.dataset.bound) {
    row.dataset.bound = '1';
    const toggle = () => {
      const box = row.nextElementSibling;
      if (!box?.classList.contains('tool-output')) return;
      const open = box.hidden;
      box.hidden = !open;
      row.classList.toggle('is-open', open);
      row.setAttribute('aria-expanded', String(open));
      row.title = open ? '点击收起命令输出' : '点击展开命令输出';
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  }
  return out;
}

function toolRowNode(name, detail, stateHtml, ms) {
  const row = document.createElement('div');
  row.className = 'tool-row';
  row.innerHTML =
    `<span class="t-ico">${svg(TOOL_ICON[name] ?? 'file')}</span>` +
    `<span class="t-name">${escapeHtml(toolLabel(name))}</span>` +
    `<span class="t-detail">${escapeHtml(detail)}</span>` +
    `<span class="t-state">${stateHtml}</span>` +
    (ms ? `<span class="t-time">${(ms / 1000).toFixed(1)}s</span>` : '');
  return row;
}

function toolGroup(calls, results) {
  const wrap = document.createElement('details');
  wrap.className = 'work-group';
  const hasError = calls.some((call) => results.get(call.id)?.isError);
  wrap.open = hasError;
  wrap.classList.toggle('has-error', hasError);
  const summary = document.createElement('summary');
  summary.innerHTML =
    `<span class="wg-dot"></span><span class="wg-title">完成 ${calls.length} 个操作</span>` +
    `<span class="wg-state">${hasError ? '有失败' : ''}</span>`;
  const body = document.createElement('div');
  body.className = 'tool-group-body';
  for (const call of calls) {
    const result = results.get(call.id);
    const row = toolRowNode(
      call.name,
      toolSummaryText(call),
      result ? (result.isError ? '失败' : '完成') : '已调用',
    );
    row.classList.toggle('is-error', Boolean(result?.isError));
    if (result?.content) ensureToolOutput(row, result.content, Boolean(result.isError));
    body.appendChild(row);
  }
  wrap.append(summary, body);
  return wrap;
}

function reasoningDetails(text) {
  const details = document.createElement('details');
  details.className = 'think';
  const summary = document.createElement('summary');
  const length = text.length > 999 ? `${(text.length / 1000).toFixed(1)}k 字` : `${text.length} 字`;
  summary.innerHTML =
    '<span class="think-title">思考</span>' +
    `<span class="think-len">${length}</span>`;
  const body = document.createElement('div');
  body.className = 'think-body';
  body.innerHTML = markdown(text);
  details.append(summary, body);
  return details;
}

function messageActions(node, text, role) {
  const actions = document.createElement('div');
  actions.className = `msg-actions ${role === 'user' ? 'is-user' : 'is-assistant'}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'msg-action';
  button.title = '复制';
  button.setAttribute('aria-label', '复制');
  button.innerHTML = svg('copy');
  button.addEventListener('click', () => copyText(text ?? '', '已复制'));
  actions.appendChild(button);
  node.appendChild(actions);
}

function renderMessage(message) {
  if (message.role === 'tool') return null;
  const node = document.createElement('article');
  node.className = `msg ${message.role}`;
  const role = document.createElement('div');
  role.className = 'msg-role';
  role.textContent = message.role === 'user' ? '你' : 'Banana';
  const body = document.createElement('div');
  body.className = 'msg-body';
  if (message.role === 'user') {
    body.textContent = message.content;
    if (message.attachments?.length) {
      const chips = document.createElement('div');
      chips.className = 'attachments msg-attachments';
      renderAttachmentChips(chips, message.attachments);
      node.append(role, body, chips);
      if (message.content?.trim()) messageActions(node, message.content, message.role);
      return node;
    }
  } else {
    body.innerHTML = markdown(message.content || '');
    if (message.reasoning && state.info?.showReasoning !== false) {
      body.insertBefore(reasoningDetails(message.reasoning), body.firstChild);
    }
    if (message.toolCalls?.length) {
      const results = new Map(
        (state.info?.session?.messages ?? []).filter((m) => m.role === 'tool').map((m) => [m.toolCallId, m]),
      );
      body.insertBefore(toolGroup(message.toolCalls, results), body.firstChild);
    }
  }
  node.append(role, body);
  if (message.content?.trim()) messageActions(node, message.content, message.role);
  return node;
}

function renderEmpty() {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  // 新会话：只保留 wordmark，操作提示放到 composer 下方，和 opencode 的首页一致
  wrap.innerHTML =
    `<div class="home-wordmark" aria-hidden="true">
       <span class="wm-text">Banana</span>
       <svg class="wm-leaf" viewBox="0 0 72 72"><path d="M14 42c2-16 14-27 34-28 0 18-8 31-24 35"/><path d="M14 58c8-15 18-24 32-31"/><path d="M44 14c-3 7-4 13-3 20"/></svg>
     </div>`;

  const tips = $('homeTips');
  if (tips) {
    const provider = state.info?.provider;
    const current = state.info?.providers?.find((item) => item.current);
    const hasKey = Boolean(current?.keyReady);
    tips.innerHTML =
      (hasKey
        ? ''
        : `<div class="empty-warn">
             <strong>还差一步：填上 API Key</strong>
             <span>没有 key 就没法对话。点下面的按钮，填进去立刻就能用（key 只存在你自己的电脑上）。</span>
             <button class="btn primary" id="emptySetup">现在去填</button>
           </div>`) +
      '<div class="suggest">' +
      ['这个仓库是做什么的', '跑一下测试并修复失败', '给我一个重构方案，先别改代码', '把 README 翻译成英文']
        .map((text) => `<button>${escapeHtml(text)}</button>`)
        .join('') +
      '</div>' +
      `<div class="empty-tips">
         <span><b>/</b> 调命令（/help 看全部）</span>
         <span><b>@</b> 引用项目里的文件</span>
         <span><b>${escapeHtml(provider?.name ?? '')}</b> 当前模型</span>
       </div>`;
    tips.querySelectorAll('.suggest button').forEach((btn) => {
      btn.addEventListener('click', () => { $('input').value = btn.textContent; $('input').focus(); grow(); });
    });
    const setup = tips.querySelector('#emptySetup');
    if (setup) setup.addEventListener('click', () => openSettings('model'));
  }
  return wrap;
}

function renderThread() {
  stopCamera();
  THREAD.innerHTML = '';
  setCameraFollow(true);
  $('jumpLatest').hidden = true;
  const messages = state.info?.session?.messages ?? [];
  if (messages.length === 0) THREAD.appendChild(renderEmpty());
  else {
    const divider = document.createElement('div');
    divider.className = 'thread-divider';
    THREAD.appendChild(divider);
  }
  for (const message of messages) {
    const node = renderMessage(message);
    if (node) THREAD.appendChild(node);
  }
  const plan = state.info?.session?.plan;
  // 计划卡只代表「等你批准」；批准/取消后不再固定追加到最新消息下面。
  if (plan?.status === 'pending') THREAD.appendChild(planCardNode(plan));
  renderTurnMeta();
  renderTodos();
  updateHomeMode();
  // 切换会话时瞬间定位到底部；平滑滚动只用于新消息
  scrollToEnd(false, true);
}

function renderTurnMeta() {
  const meta = $('threadMeta');
  if (state.busy && state.status) { meta.textContent = state.status; return; }
  const usage = state.info?.session?.usage;
  if (!usage || (!usage.inputTokens && !usage.outputTokens)) { meta.textContent = ''; return; }
  const total = usage.inputTokens + usage.outputTokens;
  const parts = [total >= 1000 ? `${(total / 1000).toFixed(1)}k tokens` : `${total} tokens`];
  if (usage.costUsd) parts.push(`$${usage.costUsd.toFixed(4)}`);
  meta.textContent = parts.join(' · ');
}

function scrollToEnd(smooth = true, force = false) {
  if (force) setCameraFollow(true);
  if (!camera.follow) return;
  if (!smooth || prefersReducedMotion()) {
    stopCamera();
    THREAD.scrollTop = cameraMax();
    camera.lastTop = THREAD.scrollTop;
    camera.programmaticAt = Date.now();
    return;
  }
  if (!camera.running) {
    camera.running = true;
    camera.raf = requestAnimationFrame(cameraTick);
  }
}

function setStatus(text) {
  state.status = text || '';
  const hint = $('composerHint');
  if (hint) {
    hint.textContent = text || workspaceHint();
    hint.dataset.kind = text ? 'live' : 'idle';
  }
  const meta = $('threadMeta');
  if (meta && text && state.busy) meta.textContent = text;
}

function workspaceHint() {
  const info = state.info;
  if (!info) return '';
  return `工作区 ${info.workspace}`;
}

function renderHeader() {
  const info = state.info;
  if (!info) return;
  $('threadTitle').textContent = info.session.title || '新对话';
  $('modelLabel').textContent = `${info.provider.name} / ${info.provider.model}`;
  const mode = info.session?.mode ?? 'build';
  const modeButtons = $('modeSwitch')?.querySelectorAll('[data-mode]') ?? [];
  modeButtons.forEach((button) => {
    const on = button.dataset.mode === mode;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  });
  $('modeBadge').hidden = mode !== 'plan';
  const level = info.session?.reasoning ?? 'standard';
  $('reasoningLabel').textContent = REASONING_LABELS[level] ?? '标准';
  $('reasoningBtn').classList.toggle('is-unsupported', info.reasoning?.supported === false);
  $('reasoningBtn').setAttribute('aria-disabled', String(info.reasoning?.supported === false));
  $('reasoningBtn').title = info.reasoning?.supported === false
    ? '当前模型不支持显式思考强度'
    : `思考强度：${REASONING_LABELS[level] ?? '标准'}`;
  if (!state.busy) $('composerHint').textContent = workspaceHint();
  else if (state.status) $('composerHint').textContent = state.status;
  renderTurnMeta();
}

let toastTimer = null;
function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => { node.hidden = true; }, 200);
  }, 2200);
}

// ---------------- 请求 ----------------
async function get(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

async function refresh(path) {
  const info = await get('info');
  state.info = info;
  const { sessions } = await get('sessions');
  state.sessions = sessions;
  // 空白草稿不是会话：不占标签，也不出现在侧栏；发出第一条消息后才补标签。
  if (state.info?.session?.id && !state.info.session.draft) {
    upsertTab(state.info.session.id, state.info.session.title);
    state.activeTab = state.info.session.id;
  } else {
    state.activeTab = null;
  }
  renderHeader();
  renderSidebar();
  renderTabs();
  renderTodos();
  if (state.review.open && state.review.mode === 'verify') renderVerify();
  if (path) renderThread();
}

/** 首轮结束后异步生成标题，不再阻塞 done/用时统计。 */
async function requestAutoTitle(sessionId) {
  if (!sessionId) return;
  try {
    const result = await post('title', { session: sessionId });
    if (!result?.title) return;
    if (result.sessions) state.sessions = result.sessions;
    if (state.info?.session?.id === sessionId) {
      state.info.session.title = result.title;
      renderHeader();
    }
    renderTabs();
    renderSidebar();
  } catch {
    // 标题失败不影响对话；保留首条消息截断的标题即可。
  }
}

/** 设置面板里的改动要立刻反映在面板上，所以改完重画面板内容。 */
async function refreshSettings() {
  await refresh(false);
  if (!$('settingsSheet').hidden) renderSettings();
}

// ---------------- 覆盖层与通用交互 ----------------
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function hideAnimated(element, className = 'is-closing', ms = 180) {
  if (!element || element.hidden) return Promise.resolve();
  element.classList.add(className);
  return sleep(ms).then(() => {
    // 动画期间如果又被打开，就不要把面板藏起来
    if (!element.classList.contains(className)) return;
    element.hidden = true;
    element.classList.remove(className);
  });
}

let appDialog = null;
/**
 * 轻量自定义对话框。Electron 不实现 window.prompt，重命名/删除不能依赖原生弹窗。
 * 返回值：有输入框时是字符串或 null；纯确认时是 true 或 null。
 */
function openAppDialog({ title, body = '', value = null, placeholder = '', confirmLabel = '确定', danger = false }) {
  // 防止双击/连点开出两个对话框，留下一个永远不 resolve 的 Promise。
  if (appDialog) return Promise.resolve(null);
  return new Promise((resolve) => {
    // 任何弹层打开前先收掉选择工具条、会话菜单和模型/思考弹层，避免视觉层叠混乱。
    hideSelectionTools();
    document.querySelector('.popover')?.remove();
    closeModelPop?.();
    closeReasoningPop?.();
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'appDialog';
    const card = document.createElement('div');
    card.className = 'modal-card dialog-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);
    const heading = document.createElement('div');
    heading.className = 'modal-head';
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.className = 'dialog-text';
    copy.textContent = body;
    copy.hidden = !body;
    const input = document.createElement('input');
    input.className = 'dialog-input';
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value ?? '';
    input.hidden = value === null;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = `btn ${danger ? 'danger' : 'primary'}`;
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    card.append(heading, copy, input, actions);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    syncOverlayState();

    const finish = (result) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      if (appDialog === wrap) appDialog = null;
      syncOverlayState();
      resolve(result);
    };
    const confirm = () => finish(value === null ? true : input.value.trim());
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [input, cancel, ok].filter((node) => !node.hidden && !node.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Enter') {
        // 焦点在「取消」上时交给按钮自己处理，不能误确认删除。
        if (document.activeElement === cancel) return;
        if (document.activeElement === input || value === null) {
          event.preventDefault();
          confirm();
        }
      }
    };
    appDialog = wrap;
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', confirm);
    wrap.addEventListener('mousedown', (event) => {
      if (event.target === wrap) finish(null);
    });
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      if (!input.hidden) {
        input.focus();
        input.select();
      } else if (danger) {
        // 删除/清空这类不可逆操作，默认焦点放在「取消」，避免顺手回车。
        cancel.focus();
      } else {
        ok.focus();
      }
    });
  });
}

function syncOverlayState() {
  const open =
    !$('commandCenter').hidden ||
    !$('codeViewer').hidden ||
    !$('attachmentViewer').hidden ||
    !$('settingsSheet').hidden ||
    !$('approvalModal').hidden ||
    Boolean($('appDialog'));
  document.body.classList.toggle('has-overlay', open);
}

function closeTopOverlay() {
  if (!$('selectionTools').hidden) return hideSelectionTools();
  if (!$('commandCenter').hidden) return closeCommandCenter();
  if (!$('attachmentViewer').hidden) {
    $('attachmentViewer').hidden = true;
    syncOverlayState();
    return true;
  }
  if (!$('codeViewer').hidden) return closeViewer();
  if (!$('settingsSheet').hidden) return closeSettings();
  if (!$('approvalModal').hidden) return closeApproval(false);
  if (state.review.open) return closeReview();
  return false;
}

async function copyText(text, message = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(message);
}

function insertComposer(text) {
  const input = $('input');
  input.value = text;
  grow();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function askAboutText(text, path, kind = 'code') {
  const trimmed = text.trim();
  if (!trimmed) return;
  const clipped = trimmed.length > 12_000 ? `${trimmed.slice(0, 12_000)}\n…（已截断）` : trimmed;
  const body =
    kind === 'terminal'
      ? `这段终端输出看起来有问题，帮我分析原因，并给出可以直接执行的修复步骤：\n\n\`\`\`\n${clipped}\n\`\`\``
      : `请解释并检查这段代码${path ? `（${path}）` : ''}，指出潜在问题，必要时给出修改方案：\n\n\`\`\`\n${clipped}\n\`\`\``;
  insertComposer(body);
  toast(kind === 'terminal' ? '已带入终端输出，回车发送' : '已带入选中代码，回车发送');
  hideSelectionTools();
}

function hideSelectionTools() {
  const box = $('selectionTools');
  box.hidden = true;
  box.innerHTML = '';
  syncOverlayState();
}

function showSelectionTools(x, y, buttons) {
  const box = $('selectionTools');
  box.innerHTML = '';
  for (const item of buttons) {
    const button = document.createElement('button');
    button.textContent = item.label;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', item.run);
    box.appendChild(button);
  }
  box.hidden = false;
  box.style.visibility = 'hidden';
  box.style.left = '0px';
  box.style.top = '0px';
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  box.style.left = `${Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8))}px`;
  box.style.top = `${Math.max(8, Math.min(y - height - 10, window.innerHeight - height - 8))}px`;
  box.style.visibility = '';
  syncOverlayState();
}

function languageFor(path) {
  const ext = String(path ?? '').split('.').pop()?.toLowerCase() ?? '';
  return LANG_BY_EXT[ext] ?? '';
}

/** 代码容器：左侧行号 + 右侧高亮代码，整体共用一个滚动区域。 */
function renderCode(container, code, path) {
  const lines = String(code ?? '').split('\n');
  const gutter = lines.map((_, index) => index + 1).join('\n');
  const lang = languageFor(path);
  container.innerHTML =
    `<div class="code-scroll"><pre class="code-gutter">${gutter}</pre>` +
    `<pre class="code-pre"><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}></code></pre></div>`;
  const node = container.querySelector('code');
  node.textContent = String(code ?? '');
  if (window.hljs && lang && String(code ?? '').length <= 300_000) {
    try {
      window.hljs.highlightElement(node);
    } catch {
      /* 单个文件失败保持纯文本 */
    }
  }
}


// ---------------- 任务清单 / 计划 / 附件 ----------------
const REASONING_LABELS = { fast: '快', standard: '标准', deep: '深入' };
const REASONING_HINTS = {
  fast: '低推理，响应快、消耗少',
  standard: '日常默认，速度和准确率平衡',
  deep: '高推理，更慢但更适合复杂任务',
};

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentIcon(kind) {
  return kind === 'image' ? 'image' : kind === 'text' ? 'file' : 'file';
}

function renderAttachmentChips(container, items, removable = false, index = 0) {
  if (!items?.length) return;
  container.classList.add('is-message-attachments');
  for (const item of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'att';
    chip.title = item.path ?? '';
    chip.innerHTML =
      `<span class="att-ico">${svg(attachmentIcon(item.kind))}</span>` +
      `<span class="att-name">${escapeHtml(item.name ?? '附件')}</span>` +
      (removable
        ? `<span class="att-remove" data-remove="${index}" aria-label="移除">${svg('x')}</span>`
        : `<span class="att-size">${escapeHtml(formatFileSize(item.size))}</span>`);
    chip.addEventListener('click', (event) => {
      if (event.target.closest('[data-remove]')) return;
      openAttachmentPreview(item);
    });
    if (removable) {
      chip.querySelector('[data-remove]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        state.attachments.splice(index, 1);
        renderAttachments();
      });
    }
    container.appendChild(chip);
  }
}

function renderAttachments() {
  const box = $('attachments');
  box.hidden = state.attachments.length === 0;
  box.innerHTML = '';
  state.attachments.forEach((item, index) => renderAttachmentChips(box, [item], true, index));
}

async function openAttachmentPreview(item) {
  if (!item?.path) return;
  state.attachmentPath = item.path;
  $('attachmentName').textContent = item.name ?? '附件';
  $('attachmentMeta').textContent = `${formatFileSize(item.size)}${item.mime ? ` · ${item.mime}` : ''}`;
  const body = $('attachmentBody');
  body.innerHTML = '<div class="hint" style="padding:16px">读取中…</div>';
  $('attachmentViewer').hidden = false;
  document.body.classList.add('has-overlay');
  try {
    const data = await get(`attachment?path=${encodeURIComponent(item.path)}`);
    if (data.dataUrl && data.kind === 'image') {
      body.innerHTML = `<div class="attachment-image"><img alt="${escapeHtml(item.name)}" src="${data.dataUrl}" /></div>`;
    } else if (data.dataUrl && data.kind === 'pdf') {
      body.innerHTML = `<iframe class="attachment-pdf" title="PDF 预览" src="${data.dataUrl}"></iframe>`;
    } else if (typeof data.content === 'string') {
      renderCode(body, data.content, item.name);
      if (data.truncated) body.insertAdjacentHTML('beforeend', '<div class="hint" style="padding:8px 12px">内容较长，只预览了前 120000 字符。</div>');
    } else {
      body.innerHTML =
        `<div class="attachment-info"><strong>${escapeHtml(item.name ?? '附件')}</strong>` +
        `<span>${escapeHtml(data.kind ?? item.kind ?? '文件')} · ${escapeHtml(formatFileSize(data.bytes ?? item.size))}</span>` +
        `<span class="mono">${escapeHtml(item.path)}</span>` +
        '<span>这类文件不解析正文；发送时会只把路径和元信息交给模型。</span></div>';
    }
  } catch (error) {
    body.innerHTML = `<div class="hint" style="padding:16px">${escapeHtml(error.message)}</div>`;
  }
}

function todoMark(status) {
  if (status === 'done') return svg('check');
  if (status === 'in_progress') return '<span class="todo-pulse"></span>';
  return '';
}

function renderTodos() {
  const todos = Array.isArray(state.info?.session?.todos) ? state.info.session.todos : [];
  const done = todos.filter((item) => item.status === 'done').length;
  const dock = $('todoDock');
  if (!dock) return;
  dock.hidden = todos.length === 0;
  dock.classList.toggle('is-open', state.todoOpen);
  $('todoSummary').setAttribute('aria-expanded', String(state.todoOpen));
  $('todoCount').textContent = `${done}/${todos.length}`;
  $('todoBarFill').style.width = todos.length ? `${Math.round((done / todos.length) * 100)}%` : '0%';
  const list = $('todoList');
  list.innerHTML = '';
  todos.forEach((item) => {
    const row = document.createElement('div');
    row.className = `todo-item is-${item.status}`;
    row.innerHTML = `<span class="todo-mark">${todoMark(item.status)}</span><span>${escapeHtml(item.text)}</span>`;
    list.appendChild(row);
  });

  const panelList = $('tasksList');
  if (panelList) {
    panelList.innerHTML = '';
    $('tasksEmpty').hidden = todos.length > 0;
    todos.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `task-row is-${item.status}`;
      row.innerHTML =
        `<span class="task-index">${index + 1}</span>` +
        `<span class="task-mark">${todoMark(item.status)}</span>` +
        `<span class="task-text">${escapeHtml(item.text)}</span>` +
        `<span class="task-state">${item.status === 'done' ? '完成' : item.status === 'in_progress' ? '进行中' : '待办'}</span>`;
      panelList.appendChild(row);
    });
  }
}

function planCardNode(plan) {
  const card = document.createElement('div');
  card.className = `plan-card is-${plan.status ?? 'pending'}`;
  const title =
    plan.status === 'approved'
      ? `计划已批准${plan.currentPhase ? ` · 当前阶段 ${plan.currentPhase}` : ''}`
      : plan.status === 'cancelled'
        ? '计划已取消'
        : '计划 · 等你批准';
  card.innerHTML =
    `<div class="plan-head"><span class="plan-dot"></span><span>${title}</span>` +
    (plan.status === 'pending' ? '<span class="plan-hint">Plan 模式不会改动文件</span>' : '') +
    '</div>';
  const list = document.createElement('div');
  list.className = 'plan-list';
  const items = plan.items ?? [];
  if (!items.length) {
    list.innerHTML = '<div class="plan-empty">这一轮没有生成结构化清单，可以直接批准后按上面的计划执行。</div>';
  } else {
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `plan-item is-${item.status}`;
      row.innerHTML =
        `<span class="plan-index">${index + 1}</span>` +
        `<span class="plan-mark">${todoMark(item.status)}</span>` +
        `<span class="plan-text">${escapeHtml(item.text)}</span>`;
      const meta = [
        item.phase ? `阶段 ${item.phase}` : '',
        item.files?.length ? item.files.join(' · ') : '',
        item.verify ? `验证 ${item.verify}` : '',
        item.confidence ? `置信度 ${item.confidence}` : '',
        item.dependsOn?.length ? `依赖 ${item.dependsOn.join('、')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      if (meta) {
        const note = document.createElement('span');
        note.className = 'plan-meta';
        note.textContent = meta;
        row.appendChild(note);
      }
      list.appendChild(row);
    });
  }
  card.appendChild(list);
  if (plan.status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'plan-actions';
    const approve = document.createElement('button');
    approve.className = 'btn primary';
    approve.textContent = '批准并执行';
    approve.addEventListener('click', () => approvePlan(card));
    const revise = document.createElement('button');
    revise.className = 'btn';
    revise.textContent = '修改计划';
    revise.addEventListener('click', () => revisePlan());
    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => cancelPlan(card));
    actions.append(approve, revise, cancel);
    card.appendChild(actions);
  } else if (plan.status === 'approved') {
    const phases = [...new Set((plan.items ?? []).map((item) => item.phase).filter(Boolean))];
    const index = phases.indexOf(plan.currentPhase);
    if (phases.length > 1 && index >= 0 && index < phases.length - 1) {
      const actions = document.createElement('div');
      actions.className = 'plan-actions';
      const next = document.createElement('button');
      next.className = 'btn primary';
      next.textContent = `下一阶段：${phases[index + 1]}`;
      next.addEventListener('click', () => nextPlanPhase());
      actions.appendChild(next);
      card.appendChild(actions);
    }
  }
  return card;
}

function renderThreadPlan() {
  THREAD.querySelector('.plan-card')?.remove();
  const plan = state.info?.session?.plan;
  if (plan?.status !== 'pending') return;
  THREAD.appendChild(planCardNode(plan));
  scrollToEnd(false);
}

function renderPendingPlan(plan) {
  THREAD.querySelector('.plan-card')?.remove();
  if (!plan || plan.status === 'cancelled') return;
  THREAD.appendChild(planCardNode(plan));
  scrollToEnd();
}

async function approvePlan(card) {
  if (state.busy) return;
  try {
    const result = await post('plan', { action: 'approve', session: state.info?.session?.id });
    if (result?.info) state.info = result.info;
    card.remove();
    renderHeader();
    renderTodos();
    renderTabs();
    const input = $('input');
    input.value = '计划已批准，按清单执行。';
    await send();
  } catch (error) {
    toast('批准失败：' + error.message);
  }
}

async function revisePlan() {
  try {
    const result = await post('plan', { action: 'revise', session: state.info?.session?.id });
    if (result?.info) state.info = result.info;
    THREAD.querySelector('.plan-card')?.remove();
    renderHeader();
    renderTodos();
    const input = $('input');
    input.value = '请修改计划：';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    grow();
  } catch (error) {
    toast('操作失败：' + error.message);
  }
}

async function nextPlanPhase() {
  if (state.busy) return;
  try {
    const result = await post('plan', { action: 'nextPhase', session: state.info?.session?.id });
    if (result?.info) state.info = result.info;
    renderHeader();
    renderTodos();
    if (state.review.open && state.review.mode === 'verify') renderVerify();
    const next = state.info?.session?.plan?.currentPhase;
    if (next) {
      toast(`进入阶段：${next}`);
      const input = $('input');
      input.value = `进入下一阶段：${next}，按清单执行。`;
      await send();
    }
  } catch (error) {
    toast('切换阶段失败：' + (error?.message ?? error));
  }
}

async function cancelPlan(card) {
  try {
    const result = await post('plan', { action: 'cancel', session: state.info?.session?.id });
    if (result?.info) state.info = result.info;
    card.remove();
    renderHeader();
    renderTodos();
    toast('计划已取消');
  } catch (error) {
    toast('取消失败：' + error.message);
  }
}

let reasoningPop = null;
function closeReasoningPop() {
  reasoningPop?.remove();
  reasoningPop = null;
  document.removeEventListener('click', onReasoningOutside, true);
  document.removeEventListener('keydown', onReasoningKey, true);
}
function onReasoningOutside(event) {
  if (event.target.closest('#reasoningPop, #reasoningBtn')) return;
  closeReasoningPop();
}
function onReasoningKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    // capture 阶段就消费掉，否则事件继续冒泡到全局 Esc，会把正在生成的 turn 停掉。
    event.stopPropagation();
    closeReasoningPop();
    $('reasoningBtn')?.focus();
  }
}
function toggleReasoningPop() {
  if (reasoningPop) return closeReasoningPop();
  const info = state.info;
  if (!info) return;
  const supported = info.reasoning?.supported !== false;
  const current = info.session?.reasoning ?? info.reasoning?.level ?? 'standard';
  const pop = document.createElement('div');
  pop.className = 'model-pop reasoning-pop';
  pop.id = 'reasoningPop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '思考强度');
  pop.innerHTML = '<div class="mp-head"><span>思考强度</span><span class="mp-sub">下一轮生效</span></div>';
  for (const level of ['fast', 'standard', 'deep']) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `mp-row reasoning-row${level === current ? ' is-on' : ''}`;
    row.disabled = !supported;
    row.innerHTML =
      `<span class="reasoning-text"><span class="mp-name">${REASONING_LABELS[level]}</span>` +
      `<span class="reasoning-desc">${REASONING_HINTS[level]}</span></span>` +
      (level === current ? `<span class="mp-check">${svg('check')}</span>` : '<span></span>');
    row.addEventListener('click', async () => {
      if (!supported) return;
      try {
        const result = await post('session', { action: 'reasoning', value: level });
        if (result?.info) state.info = result.info;
        renderHeader();
        closeReasoningPop();
        toast(`思考强度：${REASONING_LABELS[level]}`);
      } catch (error) {
        toast('保存失败：' + error.message);
      }
    });
    pop.appendChild(row);
  }
  if (!supported) {
    const note = document.createElement('div');
    note.className = 'reasoning-note';
    note.textContent = '当前模型不支持显式思考强度，选择会被忽略。';
    pop.appendChild(note);
  }
  document.body.appendChild(pop);
  reasoningPop = pop;
  const rect = $('reasoningBtn').getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 16);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  if (rect.top > 260) {
    pop.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
    pop.style.maxHeight = `${Math.max(160, rect.top - 16)}px`;
  } else {
    pop.style.top = `${Math.max(8, rect.bottom + 8)}px`;
    pop.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - 16)}px`;
  }
  pop.style.overflowY = 'auto';
  void pop.offsetHeight;
  pop.classList.add('is-on');
  setTimeout(() => {
    document.addEventListener('click', onReasoningOutside, true);
    document.addEventListener('keydown', onReasoningKey, true);
  }, 0);
}

// ---------------- 聊天流 ----------------
let controller = null;

function grow() {
  const input = $('input');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  const send = $('sendBtn');
  if (!state.busy) send.disabled = input.value.trim() === '';
  // composer 长高会把最后几行挤出视口；跟随状态下重新贴底。
  if (camera.follow) requestAnimationFrame(() => scrollToEnd());
}

function stopTurn() {
  if (!state.busy) return;
  // 停止时把审批弹窗一起收掉，否则它会一直停在页面上等一个永远不会来的答复。
  if (!$('approvalModal').hidden) closeApproval(false);
  setStatus('正在停止…');
  controller?.abort();
  void post('abort').catch(() => {});
}

function setBusy(busy) {
  state.busy = busy;
  const send = $('sendBtn');
  const composer = $('composer');
  composer?.classList.toggle('is-busy', busy);
  composer?.setAttribute('aria-busy', String(busy));
  THREAD.setAttribute('aria-busy', String(busy));
  // 发送键在原位切换成停止键，不再让用户去右上角找
  send.innerHTML = busy ? svg('stop') : svg('send');
  send.title = busy ? '停止生成' : '发送';
  send.setAttribute('aria-label', busy ? '停止生成' : '发送');
  send.dataset.mode = busy ? 'stop' : 'send';
  send.disabled = busy ? false : $('input').value.trim() === '';
  document.body.style.cursor = busy ? 'progress' : '';
  if (state.tabs?.length) renderTabs();
}

function askApproval(payload) {
  return new Promise((resolve) => {
    state.pendingApproval = resolve;
    $('approvalKind').textContent = payload.kind === 'shell' ? '确认执行命令' : payload.kind === 'write' ? '确认写入文件' : '确认网络请求';
    $('approvalSummary').textContent = payload.summary;
    const preview = $('approvalPreview');
    preview.textContent = payload.preview ?? '';
    preview.hidden = !payload.preview;
    $('approvalModal').hidden = false;
    $('approvalYes').focus();
  });
}

function closeApproval(allowed) {
  $('approvalModal').hidden = true;
  const resolve = state.pendingApproval;
  state.pendingApproval = null;
  if (resolve) resolve(allowed);
}

async function send() {
  const input = $('input');
  const text = input.value.trim();
  if (!text || state.busy) return;
  if (!state.info?.session) return;
  const runSessionId = state.info.session.id;
  stopCamera();
  setCameraFollow(true);
  input.value = '';
  grow();
  closePalette();
  // 斜杠开头的是命令，不走对话
  if (text.startsWith('/')) {
    await runCommand(text);
    grow();
    return;
  }

  const messages = state.info.session.messages ?? (state.info.session.messages = []);
  const files = state.attachments.map((item) => ({ ...item }));
  const images = files.filter((item) => item.kind === 'image').map((item) => item.path);

  // 首页空状态整块移除，否则第一条消息会被追加在 wordmark 下面
  THREAD.querySelector('.empty')?.remove();
  $('chatCard').classList.remove('home-mode');
  $('homeTips').hidden = true;
  messages.push({ role: 'user', content: text, ...(files.length ? { attachments: files } : {}) });

  const userMsg = document.createElement('article');
  userMsg.className = 'msg user enter';
  userMsg.innerHTML = '<div class="msg-role">你</div>';
  const userBody = document.createElement('div');
  userBody.className = 'msg-body';
  userBody.textContent = text;
  userMsg.appendChild(userBody);
  if (files.length) {
    const chips = document.createElement('div');
    chips.className = 'attachments msg-attachments';
    renderAttachmentChips(chips, files);
    userMsg.appendChild(chips);
  }
  messageActions(userMsg, text, 'user');
  const divider = document.createElement('div');
  divider.className = 'thread-divider';
  if (!THREAD.querySelector('.thread-divider')) THREAD.appendChild(divider);
  THREAD.appendChild(userMsg);
  scrollToEnd(false);

  const botMsg = document.createElement('article');
  botMsg.className = 'msg assistant enter';
  botMsg.innerHTML = '<div class="msg-role">Banana</div>';

  // 工具调用：默认折叠成一行工作摘要，失败时自动展开
  const work = document.createElement('details');
  work.className = 'work-group';
  work.hidden = true;
  const workSummary = document.createElement('summary');
  workSummary.innerHTML =
    '<span class="wg-dot"></span><span class="wg-title">正在处理</span><span class="wg-state"></span>';
  const workBody = document.createElement('div');
  workBody.className = 'tool-group-body';
  work.append(workSummary, workBody);
  work.classList.add('is-running');
  // 工具默认只显示一行活动摘要；用户主动展开或失败时才看详情，避免面板反复撑高再收起。
  workSummary.addEventListener('click', () => {
    work.dataset.user = '1';
  });

  // 思考过程默认折叠成一行实时摘要：用户点开才看全文，避免收起时整页跳动。
  const reasoning = document.createElement('details');
  reasoning.className = 'think is-live';
  reasoning.hidden = true;
  reasoning.open = false;
  const reasonSummary = document.createElement('summary');
  reasonSummary.innerHTML =
    '<span class="think-title">思考中…</span><span class="think-peek"></span><span class="think-len"></span>';
  const reasonBody = document.createElement('div');
  reasonBody.className = 'think-body';
  const reasoningStream = createMarkdownStream(reasonBody);
  reasoning.append(reasonSummary, reasonBody);
  // 用户手动展开后，后续流式内容不要再强行收起。
  reasonSummary.addEventListener('click', () => {
    reasoning.dataset.user = '1';
  });

  const body = document.createElement('div');
  body.className = 'msg-body caret';
  // 流式内容每几十毫秒重绘一次，aria-live 会反复播报；完成时由状态区统一提示。
  body.setAttribute('aria-live', 'off');
  const answerStream = createMarkdownStream(body);
  const meta = document.createElement('div');
  meta.className = 'turn-meta';
  const working = document.createElement('div');
  working.className = 'working-row';
  working.innerHTML = '<span class="wg-dot"></span><span class="shimmer working-text">正在准备…</span>';
  botMsg.append(working, work, reasoning, body, meta);
  THREAD.appendChild(botMsg);
  scrollToEnd(false);

  let reasoningStarted = 0;
  let reasoningText = '';
  let reasonPending = 0;
  let lastReasonPaint = 0;
  let toolStarted = 0;
  let toolCount = 0;
  let toolErrors = false;
  const toolRows = new Map();

  const paintReasoning = (final = false) => {
    reasonPending = 0;
    const text = reasoningText;
    if (final) reasoningStream.finish(text);
    else reasoningStream.render(text);
    const len = reasonSummary.querySelector('.think-len');
    if (len) len.textContent = text.length > 999 ? `${(text.length / 1000).toFixed(1)}k 字` : `${text.length} 字`;
    const peek = reasonSummary.querySelector('.think-peek');
    if (peek) {
      const line = text
        .split(/\r?\n/)
        .map((item) => item.replace(/^[#>*\-\s]+/, '').trim())
        .filter(Boolean)
        .pop();
      peek.textContent = final ? '' : line ? `· ${line.slice(0, 80)}` : '';
    }
    if (final) reasoning.classList.remove('is-live');
    // 只有用户展开并没有上滚时才跟随最新思考
    if (reasoning.open) {
      const nearBottom = reasonBody.scrollHeight - reasonBody.scrollTop - reasonBody.clientHeight < 48;
      if (nearBottom) reasonBody.scrollTop = reasonBody.scrollHeight;
    }
    scrollToEnd();
  };
  const scheduleReasoning = () => {
    if (!reasonPending) {
      reasonPending = requestAnimationFrame(() => {
        // 思考也限速，避免每个 token 都重排
        if (Date.now() - lastReasonPaint < 60) {
          reasonPending = 0;
          scheduleReasoning();
          return;
        }
        lastReasonPaint = Date.now();
        paintReasoning(false);
      });
    }
  };

  const finishReasoning = () => {
    if (reasoning.hidden || reasoning.dataset.done === '1') return;
    reasoning.dataset.done = '1';
    reasoning.classList.remove('is-live');
    if (reasonPending) cancelAnimationFrame(reasonPending);
    paintReasoning(true);
    if (reasoning.dataset.user !== '1') reasoning.open = false;
    const seconds = reasoningStarted ? ((Date.now() - reasoningStarted) / 1000).toFixed(1) : '0';
    reasonSummary.querySelector('.think-title').textContent = `思考了 ${seconds}s`;
  };

  const setWorking = (text) => {
    const node = working.querySelector('.working-text');
    if (node) node.textContent = text;
    working.hidden = false;
  };

  const finishWork = () => {
    if (work.hidden || work.dataset.done === '1') return;
    work.dataset.done = '1';
    work.classList.remove('is-running');
    const seconds = toolStarted ? ((Date.now() - toolStarted) / 1000).toFixed(1) : '0';
    workSummary.querySelector('.wg-title').textContent =
      toolCount === 1 ? '完成 1 个操作' : `完成 ${toolCount} 个操作`;
    workSummary.querySelector('.wg-state').textContent = `${seconds}s${toolErrors ? ' · 有失败' : ''}`;
    work.classList.toggle('has-error', toolErrors);
    if (!toolErrors && work.dataset.user !== '1') work.open = false;
  };

  state.attachments = [];
  renderAttachments();

  let buffer = '';
  let pending = 0;
  let lastPaint = 0;
  let streamEnded = false;

  const paint = () => {
    pending = 0;
    const now = performance.now();
    // 流式 markdown 限制到约 12fps，避免长回答每帧重排 + 高亮
    if (!streamEnded && now - lastPaint < 50) {
      schedule();
      return;
    }
    lastPaint = now;
    answerStream.render(buffer);
    // 流式过程中保持光标
    if (!streamEnded) body.classList.add('caret');
    scrollToEnd();
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(paint);
  };

  setBusy(true);
  const composer = $('composer');
  composer.classList.add('is-busy');
  setStatus('正在连接模型…');
  controller = new AbortController();
  const metaLine = (label, value) => {
    const span = document.createElement('span');
    span.textContent = `${label} ${value}`;
    meta.appendChild(span);
  };

  try {
    const res = await fetch(API + 'chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: text,
        images,
        attachments: files,
        session: runSessionId,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let bufferRaw = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bufferRaw += decoder.decode(value, { stream: true });
      let cut = bufferRaw.indexOf('\n\n');
      while (cut !== -1) {
        const chunk = bufferRaw.slice(0, cut);
        bufferRaw = bufferRaw.slice(cut + 2);
        cut = bufferRaw.indexOf('\n\n');
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text') {
            finishReasoning();
            working.hidden = true;
            setStatus('正在回答…');
            buffer += event.chunk;
            schedule();
          } else if (event.type === 'reasoning') {
            if (state.info?.showReasoning !== false) {
              if (!reasoningStarted) {
                reasoningStarted = Date.now();
                reasoning.hidden = false;
                // 默认只显示一行实时摘要，点开才看全文。
                reasoning.open = reasoning.dataset.user === '1';
              }
              reasoningText += event.chunk;
              scheduleReasoning();
            }
            setWorking('正在思考…');
            setStatus('思考中…');
            working.hidden = false;
          } else if (event.type === 'tool_start') {
            if (!toolStarted) toolStarted = Date.now();
            toolCount += 1;
            work.hidden = false;
            workSummary.querySelector('.wg-title').textContent =
              toolCount === 1 ? '正在执行 1 个操作' : `正在执行 ${toolCount} 个操作`;
            workSummary.querySelector('.wg-state').textContent = '';
            work.classList.add('is-updating');
            setTimeout(() => work.classList.remove('is-updating'), 220);
            const command = typeof event.input?.command === 'string' ? event.input.command : event.detail;
            const row = toolRowNode(
              event.name,
              command,
              '<span class="spin"></span>',
            );
            row.dataset.id = event.id;
            row.dataset.started = String(Date.now());
            const time = document.createElement('span');
            time.className = 't-time';
            time.textContent = '0.0s';
            row.appendChild(time);
            row._timer = setInterval(() => {
              const began = Number(row.dataset.started);
              time.textContent = `${((Date.now() - began) / 1000).toFixed(1)}s`;
            }, 400);
            toolRows.set(event.id, row);
            workBody.appendChild(row);
            if (command) ensureToolOutput(row, `$ ${command}\n`, false);
            setWorking(`正在${toolLabel(event.name)}…`);
            setStatus(`正在${toolLabel(event.name)}…`);
            working.hidden = false;
            scrollToEnd();
          } else if (event.type === 'tool_output') {
            const row = toolRows.get(event.id);
            if (row) {
              row._out = `${row._out ?? ''}${event.chunk}`;
              if (row._out.length > 12000) row._out = row._out.slice(-12000);
              // 实时输出先缓存在隐藏面板里，默认不把页面撑到 300px 高。
              ensureToolOutput(row, row._out);
              const state = row.querySelector('.t-state');
              if (state && !state.querySelector('.spin')) state.innerHTML = '<span class="spin"></span>';
              setStatus(`${row.querySelector('.t-name')?.textContent ?? '命令'} · 正在输出…`);
            }
          } else if (event.type === 'tool_end') {
            const row = toolRows.get(event.id) ?? [...toolRows.values()].pop();
            if (row) {
              clearInterval(row._timer);
              row.dataset.done = '1';
              row.querySelector('.t-state').innerHTML = event.ok ? svg('check') : svg('x');
              row.classList.toggle('is-error', !event.ok);
              if (!event.ok) toolErrors = true;
              const time = row.querySelector('.t-time');
              if (time && event.ms) time.textContent = `${(event.ms / 1000).toFixed(1)}s`;
              const outText = row._out || event.detail || '';
              if (outText) {
                const out = ensureToolOutput(row, outText, !event.ok);
                if (!event.ok) {
                  out.hidden = false;
                  row.classList.add('is-open');
                }
              }
              if (!event.ok) {
                work.open = true;
                setWorking('有个步骤失败了，已展开详情');
              } else {
                setWorking('正在整理结果…');
              }
              scrollToEnd();
            }
          } else if (event.type === 'step') {
            setStatus('正在处理…');
            setWorking('正在处理…');
            working.hidden = false;
          } else if (event.type === 'status') {
            if (event.message) {
              setStatus(event.message);
              setWorking(event.message);
              working.hidden = false;
            }
          } else if (event.type === 'todos') {
            if (state.info?.session) state.info.session.todos = event.todos ?? [];
            renderTodos();
            scrollToEnd();
          } else if (event.type === 'approval') {
            const allowed = await askApproval(event);
            await post('approve', { id: event.id, allowed });
          } else if (event.type === 'error') {
            // 服务端提前收尾（没配 key、请求出错等）：给出能照做的下一步
            finishReasoning();
            finishWork();
            body.classList.remove('caret');
            answerStream.setError(markdown(`**${escapeHtml(event.message ?? '出错了')}**`));
            if (event.hint) metaLine('提示', event.hint);
            if (event.code === 'no_api_key') openSettings();
            streamEnded = true;
          } else if (event.type === 'done') {
            finishReasoning();
            finishWork();
            if (pending) {
              cancelAnimationFrame(pending);
              pending = 0;
            }
            body.classList.remove('caret');
            streamEnded = true;
            if (event.error) answerStream.setError(markdown(`**请求失败** ${escapeHtml(event.error)}`));
            else if (!buffer.trim()) answerStream.setError(markdown('这一轮没有返回内容。'));
            else answerStream.finish(buffer);
            if (buffer.trim() && !botMsg.querySelector('.msg-actions')) {
              messageActions(botMsg, buffer, 'assistant');
            }
            metaLine('用时', (event.ms / 1000).toFixed(1) + 's');
            if (event.steps > 0) metaLine('过程', `${event.steps} 步`);
            if (event.cost && event.cost !== '≈$0') metaLine('花费', event.cost);
            if (event.stopReason === 'max_steps') metaLine('状态', '达到步数上限');
            else if (event.stopReason === 'aborted') metaLine('状态', '已停止');
            // 防御性校验：只有这一轮仍属于当前会话时才更新标题/正文状态。
            const stillCurrent = state.info?.session?.id === runSessionId;
            if (stillCurrent && event.info) {
              state.info = event.info;
              if (event.todos) state.info.session.todos = event.todos;
              if (event.plan) state.info.session.plan = event.plan;
              // 空白草稿在第一条消息完成后才真正变成一个会话标签。
              if (!state.info.session.draft && state.activeTab !== state.info.session.id) {
                setActiveTab(state.info.session.id);
              }
            }
            const { sessions } = await get('sessions');
            state.sessions = sessions;
            renderSidebar();
            renderTabs();
            if (stillCurrent) {
              renderHeader();
              renderTodos();
              if (event.plan?.status === 'pending') renderPendingPlan(event.plan);
              if (state.review.open && state.review.mode === 'changes') void loadChanges(true);
            }
            if (event.firstTurn && event.titleSource !== 'user' && event.stopReason === 'done') {
              setTimeout(() => void requestAutoTitle(runSessionId), 200);
            }
          }
        }
      }
    }
    // 流结束了却没收到 done/error：多半是被中断，别让界面一直转圈
    if (!streamEnded) {
      finishReasoning();
      finishWork();
      body.classList.remove('caret');
      if (!buffer.trim() && workBody.childElementCount === 0) {
        answerStream.setError(markdown('这一轮没有返回内容。可以重试，或按发送键停止后换个说法。'));
      }
      await refresh();
    }
  } catch (error) {
    body.classList.remove('caret');
    const aborted = controller?.signal.aborted || /abort/i.test(String(error?.message ?? ''));
    if (aborted) {
      answerStream.setError(markdown(buffer.trim() || '已停止生成。'));
      metaLine('状态', '已停止');
      streamEnded = true;
    } else if (!buffer.trim()) {
      answerStream.setError(markdown(`**中断** ${escapeHtml(error.message)}`));
    }
    await refresh();
  } finally {
    finishReasoning();
    for (const row of toolRows.values()) {
      clearInterval(row._timer);
      if (!row.dataset.done) {
        row.dataset.done = '1';
        row.classList.remove('is-open');
        row.classList.add('is-error');
        const stateNode = row.querySelector('.t-state');
        if (stateNode) stateNode.innerHTML = svg('x');
        row.querySelector('.t-time')?.remove();
        toolErrors = true;
      }
    }
    finishWork();
    working.hidden = true;
    body.classList.remove('caret');
    if (!$('approvalModal').hidden) closeApproval(false);
    controller = null;
    setBusy(false);
    $('composer').classList.remove('is-busy');
    setStatus(null);
    renderHeader();
    scrollToEnd();
    if (state.review.open && state.review.mode === 'changes') void loadChanges(true);
  }
}

// ---------------- 主题 ----------------
// 三态：跟随系统 / 浅色 / 深色，选择记在本地
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
const THEME_ICON = { auto: 'contrast', light: 'sun', dark: 'moon' };

function applyTheme(theme) {
  // 主题切换时短暂开启颜色过渡，避免整页硬切
  const root = document.documentElement;
  root.classList.add('theme-anim');
  clearTimeout(applyTheme.timer);
  applyTheme.timer = setTimeout(() => root.classList.remove('theme-anim'), 300);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('banana-theme', theme);
  } catch {}
  const button = $('themeBtn');
  if (button) {
    button.innerHTML = svg(THEME_ICON[theme]);
    button.title = `主题：${THEME_LABEL[theme]}（点击切换）`;
  }
  document.dispatchEvent(new CustomEvent('banana:theme'));
}

function loadTheme() {
  let saved = 'auto';
  try {
    saved = localStorage.getItem('banana-theme') ?? 'auto';
  } catch {}
  if (!THEMES.includes(saved)) saved = 'auto';
  applyTheme(saved);
}

function cycleTheme() {
  const current = (() => {
    try {
      return localStorage.getItem('banana-theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  })();
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
  toast(`主题：${THEME_LABEL[next]}`);
}

// ---------------- 补全面板：/ 命令与 @ 文件共用一套 ----------------
let commandList = [];

function renderCommandPalette(query) {
  const box = $('commandPalette');
  const term = query.replace(/^\//, '').toLowerCase();
  const matches = commandList
    .filter((item) => !term || item.name.startsWith(term) || item.aliases.some((alias) => alias.startsWith(term)))
    .slice(0, 8);
  state.commandMatches = matches.map((item) => ({ kind: 'command', item, insert: item.usage.startsWith('/') ? item.usage + ' ' : '/' + item.name + ' ' }));
  state.commandIndex = 0;
  paintPalette();
}

function paintPalette() {
  const box = $('commandPalette');
  box.innerHTML = '';
  const rows = state.commandMatches ?? [];
  if (!rows.length) {
    box.innerHTML = '<div class="cmd-empty">没有匹配项</div>';
    return;
  }
  rows.forEach((entry, index) => {
    const row = document.createElement('button');
    row.className = `cmd-item${index === state.commandIndex ? ' is-on' : ''}`;
    row.type = 'button';
    if (entry.kind === 'command') {
      row.innerHTML =
        `<span class="cmd-name">/${escapeHtml(entry.item.name)}</span>` +
        `<span class="cmd-summary">${escapeHtml(entry.item.summary)}</span>` +
        `<span class="cmd-usage">${escapeHtml(entry.item.usage)}</span>`;
    } else {
      row.innerHTML =
        `<span class="cmd-name">${escapeHtml(entry.item.split('/').pop())}</span>` +
        `<span class="cmd-summary">${escapeHtml(entry.item)}</span>` +
        '<span class="cmd-usage">文件</span>';
    }
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      applyCompletion(entry);
    });
    box.appendChild(row);
  });
}

/** 用候选替换输入框里对应的片段。 */
function applyCompletion(entry) {
  const input = $('input');
  const value = input.value;
  const replace = state.paletteReplace ?? '';
  if (replace && value.endsWith(replace)) {
    input.value = value.slice(0, value.length - replace.length) + entry.insert;
  } else {
    input.value = `${value.trimEnd()} ${entry.insert}`;
  }
  closePalette();
  input.focus();
  grow();
}

/** 命令面板：本地过滤，无需请求。 */
function openPalette(query) {
  const box = $('commandPalette');
  box.hidden = false;
  box.dataset.kind = 'command';
  state.paletteReplace = '';
  renderCommandPalette(query);
}

function closePalette() {
  $('commandPalette').hidden = true;
  state.commandMatches = [];
  state.paletteReplace = '';
  state.pendingFiles = [];
}

function movePalette(step) {
  const box = $('commandPalette');
  if (box.hidden) return;
  const rows = [...box.querySelectorAll('.cmd-item')];
  if (!rows.length) return;
  state.commandIndex = (state.commandIndex + step + rows.length) % rows.length;
  rows.forEach((row, index) => row.classList.toggle('is-on', index === state.commandIndex));
  rows[state.commandIndex].scrollIntoView({ block: 'nearest' });
}

/** @ 补全：走服务端，和 CLI 用同一份 completeFileReference。 */
let completeTimer = null;
async function requestFileComplete(value) {
  clearTimeout(completeTimer);
  completeTimer = setTimeout(async () => {
    try {
      const data = await get(`complete?line=${encodeURIComponent(value)}`);
      if (data.kind !== 'file' || !data.candidates.length) {
        if (!$('commandPalette').hidden && $('commandPalette').dataset.kind === 'file') closePalette();
        return;
      }
      // 补全请求返回时用户可能已经继续输入了，丢弃过期结果
      if ($('input').value !== value) return;
      state.pendingFiles = data.candidates.map((path) => ({ kind: 'file', item: path, insert: path + ' ' }));
      $('commandPalette').hidden = false;
      $('commandPalette').dataset.kind = 'file';
      state.paletteReplace = data.replace;
      state.commandMatches = state.pendingFiles;
      state.commandIndex = 0;
      paintPalette();
    } catch {
      /* 补全失败不影响输入 */
    }
  }, 90);
}

// GUI 已经有对应界面的命令才放出来；其余命令由 runCommand 明确提示，避免“显示成功但没生效”。
const GUI_COMMANDS = new Set([
  'help', 'h', '?', 'new', 'list', 'ls', 'use', 'switch', 'resume', 'rename',
  'session', 'history', 'provider', 'model', 'perm', 'system', 'cwd', 'undo', 'save', 'clear', 'delete',
  'review', 'prefer', 'template', 'feedback', 'phase', 'verify',
]);

function leaveHomeMode() {
  THREAD.querySelector('.empty')?.remove();
  $('chatCard').classList.remove('home-mode');
  $('homeTips').hidden = true;
}

async function clearCurrentSession() {
  if (state.busy) {
    toast('正在生成，先停止当前任务再清空');
    return;
  }
  const confirmed = await openAppDialog({
    title: '清空当前对话？',
    body: '消息、任务清单和计划都会被清空，这个操作无法撤回。',
    confirmLabel: '清空',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const result = await post('session', { action: 'clear' });
    if (result?.info) state.info = result.info;
    if (result?.sessions) state.sessions = result.sessions;
    state.changes = null;
    renderHeader();
    renderSidebar();
    renderThread();
    renderTodos();
    if (state.info?.session && !state.info.session.draft) setActiveTab(state.info.session.id);
    else {
      state.tabs = [];
      state.activeTab = null;
      saveTabs();
      renderTabs();
    }
    toast('已清空当前对话');
  } catch (error) {
    toast('清空失败：' + (error?.message ?? error));
  }
}

async function renameCurrentSession(title) {
  const session = state.info?.session;
  if (!session) return;
  if (state.busy) {
    toast('正在生成，先停止当前任务再重命名');
    return;
  }
  let value = String(title ?? '').trim();
  if (!value) {
    const input = await openAppDialog({
      title: '重命名会话',
      value: session.title || '',
      placeholder: '输入新的标题',
      confirmLabel: '保存',
    });
    if (input === null) return;
    value = input;
  }
  if (!value) {
    toast('标题不能为空');
    return;
  }
  try {
    const result = await post('session', { action: 'rename', ref: session.id, title: value });
    if (result?.info) state.info = result.info;
    if (result?.sessions) state.sessions = result.sessions;
    renderHeader();
    renderSidebar();
    // 空白草稿被显式重命名后会落盘，补上标签。
    if (state.info?.session && !state.info.session.draft) setActiveTab(state.info.session.id);
    else renderTabs();
    toast('已重命名');
  } catch (error) {
    toast('重命名失败：' + (error?.message ?? error));
  }
}

/** 执行命令：会话类命令直接调用界面的同一套逻辑，避免前后端状态脱节。 */
async function runCommand(text) {
  closePalette();
  const raw = text.replace(/^\//, '').trim();
  const [name = '', ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ').trim();

  if (name === 'new') {
    await createSession(arg);
    return;
  }
  if (name === 'use' || name === 'switch' || name === 'resume') {
    if (!arg) return toast('用法：/use <序号、id 前缀或标题>');
    await switchSession(arg);
    return;
  }
  if (name === 'clear') {
    await clearCurrentSession();
    return;
  }
  if (name === 'rename') {
    await renameCurrentSession(arg);
    return;
  }
  if (!GUI_COMMANDS.has(name)) {
    toast(`GUI 里请直接用界面操作；/${name} 在这里不会生效`);
    return;
  }

  let confirmed = false;
  if (name === 'delete' || (name === 'cwd' && arg)) {
    const ok = await openAppDialog({
      title: name === 'delete' ? '删除对话？' : '切换工作目录？',
      body:
        name === 'delete'
          ? '匹配到的对话会被删除，无法恢复。'
          : 'agent 的文件工具范围会切换到新目录。',
      confirmLabel: name === 'delete' ? '删除' : '切换',
      danger: name === 'delete',
    });
    if (!ok) return;
    confirmed = true;
  }

  leaveHomeMode();
  const userMsg = document.createElement('article');
  userMsg.className = 'msg user cmd';
  userMsg.innerHTML = '<div class="msg-role">你</div>';
  const userBody = document.createElement('div');
  userBody.className = 'msg-body';
  userBody.textContent = text;
  userMsg.appendChild(userBody);
  if (!THREAD.querySelector('.thread-divider')) {
    const divider = document.createElement('div');
    divider.className = 'thread-divider';
    THREAD.appendChild(divider);
  }
  THREAD.appendChild(userMsg);

  const botMsg = document.createElement('article');
  botMsg.className = 'msg assistant enter';
  const role = document.createElement('div');
  role.className = 'msg-role';
  role.textContent = '命令输出';
  const out = document.createElement('div');
  out.className = 'msg-body cmd-out';
  botMsg.append(role, out);
  THREAD.appendChild(botMsg);
  out.textContent = '执行中…';
  scrollToEnd();

  try {
    const result = await post('command', { input: text, ...(confirmed ? { confirmed: true } : {}) });
    // CLI 在 TTY 下会输出 ANSI 颜色；GUI 里统一去掉，避免出现 [36m 之类的乱码。
    const cleaned = String(result.output ?? '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
    out.textContent = cleaned || (result.ok ? '（没有输出）' : '');
    out.classList.toggle('is-error', !result.ok);
    if (result.error) out.textContent += (out.textContent ? '\n' : '') + result.error;
    if ((name === 'help' || name === 'h' || name === '?') && !result.error) {
      out.textContent += '\nGUI 提示：/tools /compact /cls /exit /image /setup 已隐藏，请用界面里的对应功能。';
    }
    const beforeId = state.info?.session?.id;
    if (result.info) state.info = result.info;
    if (result.sessions) state.sessions = result.sessions;
    if (result.info && beforeId !== state.info.session.id) {
      renderThread();
      setActiveTab(state.info.session.id);
    }
    // \u001b[clear 之类的终端指令：清空当前视图
    if ((result.output || '').includes('\u001b[clear]')) renderThread();
    renderHeader();
    renderSidebar();
    renderTodos();
  } catch (error) {
    out.textContent = error.message;
    out.classList.add('is-error');
  }
  scrollToEnd();
}

// ---------------- 附件 ----------------
function attachmentKindOf(file) {
  const name = String(file.name ?? '').toLowerCase();
  if (/^image\//.test(file.type) && !name.endsWith('.svg')) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    /^text\//.test(file.type) ||
    /\.(txt|md|json|js|mjs|cjs|ts|tsx|jsx|css|html?|xml|ya?ml|toml|py|go|rs|java|c|h|cpp|hpp|sh|bash|ps1|sql|ini|conf|env|lock)$/i.test(name)
  ) {
    return 'text';
  }
  return 'binary';
}

async function attach(file) {
  const kind = attachmentKindOf(file);
  const limit = kind === 'image' ? 4 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > limit) {
    toast(`${file.name} 超过 ${formatFileSize(limit)}`);
    return;
  }
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
    const result = await post('attach?name=' + encodeURIComponent(file.name), { data: base64 });
    state.attachments.push({
      name: file.name,
      path: result.path,
      size: result.bytes ?? file.size,
      mime: result.mime ?? file.type,
      kind: result.kind ?? kind,
    });
    renderAttachments();
    toast('已附加 ' + file.name);
  } catch (error) {
    toast('附加失败：' + (error?.message ?? error));
  }
}

// ---------------- 控制中心 ----------------
const SETTINGS_NAV = [
  { id: 'model', label: '模型', icon: 'chip' },
  { id: 'search', label: '联网搜索', icon: 'globe' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'terminal', label: '终端', icon: 'terminal' },
  { id: 'workspace', label: '工作区', icon: 'folder' },
  { id: 'plugins', label: '插件', icon: 'plug' },
  { id: 'about', label: '关于', icon: 'info' },
];

function closeModelPop() {
  const pop = $('modelPop');
  if (!pop) return;
  pop.remove();
  document.removeEventListener('click', onModelPopOutside, true);
  document.removeEventListener('keydown', onModelPopKey, true);
}

function onModelPopOutside(event) {
  if (event.target.closest('#modelPop, #modelBtn')) return;
  closeModelPop();
}

function onModelPopKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeModelPop();
    $('modelBtn')?.focus();
  }
}

function toggleModelPop() {
  if ($('modelPop')) return closeModelPop();
  const info = state.info;
  if (!info) return;
  const pop = document.createElement('div');
  pop.className = 'model-pop';
  pop.id = 'modelPop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '切换模型');
  const head = document.createElement('div');
  head.className = 'mp-head';
  head.innerHTML = '<span>模型</span><span class="mp-sub">切换后新消息生效</span>';
  pop.appendChild(head);

  for (const provider of info.providers ?? []) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `mp-row${provider.current ? ' is-on' : ''}`;
    row.innerHTML =
      `<span class="mp-name">${escapeHtml(provider.name)}</span>` +
      `<span class="mp-model">${escapeHtml(provider.model)}</span>` +
      (provider.current ? `<span class="mp-check">${svg('check')}</span>` : '');
    row.addEventListener('click', async () => {
      if (provider.current) return closeModelPop();
      try {
        await saveSetting('provider', { name: provider.name });
        await refresh(false);
        closeModelPop();
        toast(`已切换到 ${provider.name}`);
      } catch (error) {
        toast('切换失败：' + error.message);
      }
    });
    pop.appendChild(row);
  }

  const form = document.createElement('div');
  form.className = 'mp-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = info.provider.model;
  input.placeholder = '模型名';
  input.setAttribute('aria-label', '模型名');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn tiny primary';
  save.textContent = '保存';
  save.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return toast('请填写模型名');
    try {
      await saveSetting('model', { value });
      await refresh(false);
      closeModelPop();
      toast('模型已更新');
    } catch (error) {
      toast('保存失败：' + error.message);
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save.click();
    }
  });
  form.append(input, save);
  pop.appendChild(form);

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'mp-more';
  more.textContent = '更多模型与 Key 设置';
  more.addEventListener('click', () => {
    closeModelPop();
    openSettings('model');
  });
  pop.appendChild(more);
  document.body.appendChild(pop);

  const rect = $('modelBtn').getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 16);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  if (rect.top > 300) {
    pop.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
    pop.style.maxHeight = `${Math.max(180, rect.top - 16)}px`;
  } else {
    pop.style.top = `${Math.max(8, rect.bottom + 8)}px`;
    pop.style.maxHeight = `${Math.max(180, window.innerHeight - rect.bottom - 16)}px`;
  }
  pop.style.overflowY = 'auto';
  void pop.offsetHeight;
  pop.classList.add('is-on');
  setTimeout(() => {
    document.addEventListener('click', onModelPopOutside, true);
    document.addEventListener('keydown', onModelPopKey, true);
  }, 0);
}

function openSettings(category) {
  // 设置是整页层级，先收掉所有可能悬在上面的小弹层。
  closeModelPop();
  closeReasoningPop();
  document.querySelector('.popover')?.remove();
  if (category) state.settingsCategory = category;
  state.settingsScroll = 0;
  state.settingsReturn = document.activeElement;
  renderSettings({ resetScroll: true });
  const sheet = $('settingsSheet');
  sheet.classList.remove('is-closing');
  sheet.hidden = false;
  document.body.classList.add('has-overlay');
  requestAnimationFrame(() => {
    $('settingsBody').scrollTop = 0;
    $('settingsSheet').querySelector('.settings-panel')?.focus?.();
  });
}

function closeSettings() {
  const sheet = $('settingsSheet');
  if (sheet.hidden) return;
  state.settingsScroll = $('settingsBody').scrollTop;
  void hideAnimated(sheet, 'is-closing', 170).then(syncOverlayState);
  const back = state.settingsReturn;
  state.settingsReturn = null;
  if (back && back.isConnected) back.focus();
  else $('input')?.focus();
}

const DIALOG_ROOTS = ['approvalModal', 'commandCenter', 'codeViewer', 'attachmentViewer', 'settingsSheet'];

/** 对最上层可见弹层做 Tab 焦点循环，避免键盘焦点跑到背景页面。 */
function trapDialogFocus(event) {
  for (const id of DIALOG_ROOTS) {
    const root = $(id);
    if (!root || root.hidden) continue;
    return trapFocusWithin(root, event);
  }
  return false;
}

function trapFocusWithin(root, event) {
  const focusable = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && node.offsetParent !== null);
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function trapSettingsFocus(event) {
  return trapFocusWithin($('settingsSheet'), event);
}

function settingsCard() {
  const card = document.createElement('div');
  card.className = 'set-card';
  return card;
}

function settingsRow(title, desc, control) {
  const row = document.createElement('div');
  row.className = 'set-row';
  const copy = document.createElement('div');
  copy.className = 'set-copy';
  copy.innerHTML = `<strong>${escapeHtml(title)}</strong>${desc ? `<span>${escapeHtml(desc)}</span>` : ''}`;
  row.appendChild(copy);
  if (control) {
    const holder = document.createElement('div');
    holder.className = 'set-control';
    holder.appendChild(control);
    row.appendChild(holder);
  }
  return row;
}

function settingsButton(label, onClick, primary = false) {
  const button = document.createElement('button');
  button.className = `btn tiny${primary ? ' primary' : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function settingsInput(value, placeholder, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  input.placeholder = placeholder ?? '';
  input.spellcheck = false;
  return input;
}

function settingsSwitch(on, onChange) {
  const button = document.createElement('button');
  button.className = `switch${on ? ' is-on' : ''}`;
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(Boolean(on)));
  button.addEventListener('click', () => {
    const next = !button.classList.contains('is-on');
    button.classList.toggle('is-on', next);
    button.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return button;
}

function settingsSeg(options, current, onChange) {
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = option.value;
    button.textContent = option.label;
    button.classList.toggle('is-on', option.value === current);
    button.addEventListener('click', () => {
      if (button.classList.contains('is-on')) return;
      seg.querySelectorAll('button').forEach((item) => item.classList.toggle('is-on', item === button));
      onChange(option.value);
    });
    seg.appendChild(button);
  }
  return seg;
}

function settingsSection(title, sub) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML = `<h3 class="settings-title">${escapeHtml(title)}</h3>${sub ? `<p class="settings-sub">${escapeHtml(sub)}</p>` : ''}`;
  return section;
}

async function saveSetting(action, payload) {
  try {
    const result = await post('action', { action, ...payload });
    if (result?.info) state.info = result.info;
    return result;
  } catch (error) {
    toast('保存失败：' + (error?.message ?? error));
    throw error;
  }
}

function renderSettings({ resetScroll = false } = {}) {
  const info = state.info;
  if (!info) return;
  const body = $('settingsBody');
  const nav = $('settingsNav');
  // 切换分类必须回到顶部；保存设置时保留当前位置。
  const scroll = resetScroll ? 0 : body.scrollTop || state.settingsScroll || 0;
  nav.innerHTML = '';
  for (const item of SETTINGS_NAV) {
    const button = document.createElement('button');
    button.innerHTML = `${svg(item.icon)}<span>${item.label}</span>`;
    button.classList.toggle('is-on', item.id === state.settingsCategory);
    button.addEventListener('click', () => {
      if (state.settingsCategory === item.id) return;
      state.settingsCategory = item.id;
      state.settingsScroll = 0;
      renderSettings({ resetScroll: true });
    });
    nav.appendChild(button);
  }

  body.innerHTML = '';
  const category = state.settingsCategory;
  if (category === 'model') renderModelSettings(body);
  else if (category === 'search') renderSearchSettings(body);
  else if (category === 'appearance') renderAppearanceSettings(body);
  else if (category === 'terminal') renderTerminalSettings(body);
  else if (category === 'workspace') renderWorkspaceSettings(body);
  else if (category === 'plugins') renderPluginSettings(body);
  else renderAboutSettings(body);
  requestAnimationFrame(() => { body.scrollTop = scroll; });
}

function renderModelSettings(body) {
  const info = state.info;
  const active = info.providers.find((item) => item.current);
  const section = settingsSection('模型', '选择 provider、模型和密钥。CLI 与 GUI 共用同一份配置。');

  const card = settingsCard();
  const providerSelect = document.createElement('select');
  providerSelect.innerHTML = info.providers
    .map((item) => `<option value="${escapeHtml(item.name)}" ${item.current ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.model)}</option>`)
    .join('');
  providerSelect.addEventListener('change', async () => {
    await saveSetting('provider', { name: providerSelect.value });
    await refresh(false);
    renderSettings();
    toast('已切换到 ' + providerSelect.value);
  });
  card.appendChild(settingsRow('Provider', '切换后新消息使用这个 provider。', providerSelect));

  const modelInput = settingsInput(info.provider.model, '模型名，例如 deepseek-chat');
  const saveModel = settingsButton('保存', async () => {
    const value = modelInput.value.trim();
    if (!value) return toast('请填写模型名');
    await saveSetting('model', { value });
    await refresh(false);
    renderSettings();
    toast('模型已更新');
  }, true);
  modelInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveModel.click(); });
  const modelBox = document.createElement('div');
  modelBox.style.display = 'flex';
  modelBox.style.gap = '6px';
  modelBox.append(modelInput, saveModel);
  card.appendChild(settingsRow('模型', '保存后立即生效。', modelBox));

  const keyInput = settingsInput('', active?.keySaved ? '已保存，留空表示不修改' : '粘贴 API Key', 'password');
  const saveKey = settingsButton('保存', async () => {
    const value = keyInput.value.trim();
    if (!value) return toast('留空表示不修改');
    await saveSetting('apiKey', { value });
    keyInput.value = '';
    await refresh(false);
    renderSettings();
    toast('API Key 已保存');
  }, true);
  keyInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveKey.click(); });
  const keyBox = document.createElement('div');
  keyBox.style.display = 'flex';
  keyBox.style.gap = '6px';
  keyBox.append(keyInput, saveKey);
  const keyHint = active?.keyEnv
    ? `也可以只设置环境变量 ${active.keyEnv}，当前${active.keyReady ? '已就绪' : '未设置'}。`
    : '更安全的做法是使用环境变量，不要把 key 写进仓库。';
  card.appendChild(settingsRow('API Key', keyHint, keyBox));
  card.appendChild(
    settingsRow(
      '显示思考过程',
      '推理模型会展示思考内容；关闭后只保留最终回答。',
      settingsSwitch(info.showReasoning !== false, async (on) => {
        await saveSetting('showReasoning', { value: String(on) });
        await refresh(false);
        toast(on ? '已显示思考过程' : '已隐藏思考过程');
      }),
    ),
  );
  section.appendChild(card);

  const promptCard = settingsCard();
  const stack = document.createElement('div');
  stack.className = 'set-stack';
  stack.innerHTML = '<div class="set-copy"><strong>系统提示词</strong><span>给模型的长期指令，会影响所有对话。</span></div>';
  const area = document.createElement('textarea');
  area.value = info.systemPrompt ?? '';
  area.placeholder = '例如：回答尽量简洁，优先给可执行命令。';
  stack.appendChild(area);
  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.append(
    settingsButton('恢复默认', async () => {
      area.value = '';
      await saveSetting('system', { value: '' });
      await refresh(false);
      renderSettings();
      toast('已清空，使用内置系统提示词');
    }),
    settingsButton('保存提示词', async () => {
      await saveSetting('system', { value: area.value });
      await refresh(false);
      toast('系统提示词已保存');
    }, true),
  );
  stack.appendChild(actions);
  promptCard.appendChild(stack);
  section.appendChild(promptCard);
  body.appendChild(section);
}

function renderSearchSettings(body) {
  const info = state.info;
  const search = info?.search ?? {
    provider: 'auto',
    deep: false,
    language: 'en',
    tavily: { saved: false, ready: false, env: 'TAVILY_API_KEY' },
    brave: { saved: false, ready: false, env: 'BRAVE_API_KEY' },
  };
  const section = settingsSection('联网搜索', '免费源开箱即用；填入 Key 后自动升级到更稳定的搜索 API。');

  const card = settingsCard();
  const providerSelect = document.createElement('select');
  providerSelect.innerHTML = [
    ['auto', '自动（有 Key 用 API，否则免费源）'],
    ['tavily', 'Tavily'],
    ['brave', 'Brave'],
    ['free', '只用免费源'],
  ]
    .map(([value, label]) => `<option value="${value}" ${search.provider === value ? 'selected' : ''}>${label}</option>`)
    .join('');
  providerSelect.addEventListener('change', async () => {
    await saveSetting('searchProvider', { value: providerSelect.value });
    await refresh(false);
    renderSettings();
    toast('搜索方式已更新');
  });
  card.appendChild(
    settingsRow('搜索方式', '自动模式优先用已配置的 Key；API 失败时会回退到免费源。', providerSelect),
  );

  const keyRow = (name, label, spec) => {
    const input = settingsInput('', spec.saved ? '已保存，留空表示不修改' : `粘贴 ${label} API Key`, 'password');
    const save = settingsButton('保存', async () => {
      const value = input.value.trim();
      if (!value) return toast('留空表示不修改');
      await saveSetting('searchKey', { name, value });
      input.value = '';
      await refresh(false);
      renderSettings();
      toast(label + ' Key 已保存');
    }, true);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save.click();
    });
    const box = document.createElement('div');
    box.style.display = 'flex';
    box.style.gap = '6px';
    box.append(input, save);
    if (spec.saved) {
      const clear = settingsButton('清除', async () => {
        await saveSetting('searchKey', { name, value: '' });
        await refresh(false);
        renderSettings();
        toast(label + ' Key 已清除');
      });
      clear.classList.add('ghost');
      box.append(clear);
    }
    const hint = `也可以只设置环境变量 ${spec.env}，当前${spec.ready ? '已就绪' : '未设置'}。`;
    card.appendChild(settingsRow(label, hint, box));
  };
  keyRow('tavily', 'Tavily', search.tavily);
  keyRow('brave', 'Brave', search.brave);

  card.appendChild(
    settingsRow(
      '深度搜索',
      '开启后每次搜索会自动读前 3 页正文，答案更准，但会多花几秒。默认关闭；对话里也可以临时要求 deep。',
      settingsSwitch(Boolean(search.deep), async (on) => {
        await saveSetting('searchDeep', { value: String(on) });
        await refresh(false);
        toast(on ? '已开启深度搜索' : '已关闭深度搜索');
      }),
    ),
  );

  card.appendChild(
    settingsRow(
      '结果语言',
      '英文/技术优先会更多命中官方文档、GitHub 和 Stack Overflow；自动会跟随问题语言。',
      settingsSeg(
        [
          { value: 'en', label: '英文/技术优先' },
          { value: 'auto', label: '自动' },
          { value: 'zh', label: '中文优先' },
        ],
        search.language ?? 'en',
        async (value) => {
          await saveSetting('searchLanguage', { value });
          await refresh(false);
          toast('搜索语言偏好已更新');
        },
      ),
    ),
  );

  section.appendChild(card);
  body.appendChild(section);
}

function renderAppearanceSettings(body) {
  const saved = (() => {
    try {
      return localStorage.getItem('banana-theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  })();
  const section = settingsSection('外观', '黑白主题，柔和对比。切换会同步终端和代码高亮。');
  const card = settingsCard();
  card.appendChild(
    settingsRow(
      '主题',
      '跟随系统最省心；也可以固定浅色或深色。',
      settingsSeg(
        [
          { value: 'auto', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
        ],
        saved,
        (value) => {
          applyTheme(value);
          toast('主题：' + (value === 'auto' ? '跟随系统' : value === 'dark' ? '深色' : '浅色'));
        },
      ),
    ),
  );
  section.appendChild(card);

  const motion = settingsCard();
  motion.appendChild(
    settingsRow('减少动效', '关闭大部分弹簧和入场动画，适合晕动或低性能设备。', settingsSwitch(
      document.documentElement.dataset.reduceMotion === '1',
      (on) => {
        if (on) document.documentElement.dataset.reduceMotion = '1';
        else delete document.documentElement.dataset.reduceMotion;
        localStorage.setItem('banana.reduceMotion', on ? '1' : '0');
        toast(on ? '已减少动效' : '已恢复弹力动画');
      },
    )),
  );
  section.appendChild(motion);
  body.appendChild(section);
}

function renderTerminalSettings(body) {
  const section = settingsSection('终端', '真实 PTY，支持 PowerShell、cmd、Git Bash 和 WSL。关面板不会杀进程。');
  const card = settingsCard();

  card.appendChild(
    settingsRow(
      '字号',
      '只影响终端显示，不改变 shell 行为。',
      settingsSeg(
        [12, 13, 14, 15, 16].map((size) => ({ value: String(size), label: `${size}px` })),
        String(term.fontSize),
        (value) => {
          term.fontSize = Number(value) || 13;
          localStorage.setItem(TERM_STORAGE.fontSize, String(term.fontSize));
          termRestyle();
        },
      ),
    ),
  );

  const shellSelect = document.createElement('select');
  const preferred = localStorage.getItem(TERM_STORAGE.shell) || term.defaultShell || 'powershell';
  shellSelect.innerHTML = (term.shells.length ? term.shells : [{ id: 'powershell', name: 'PowerShell' }])
    .map((shell) => `<option value="${escapeHtml(shell.id)}" ${shell.id === preferred ? 'selected' : ''}>${escapeHtml(shell.name)}</option>`)
    .join('');
  shellSelect.addEventListener('change', () => {
    localStorage.setItem(TERM_STORAGE.shell, shellSelect.value);
    const picker = $('termShell');
    if (picker) picker.value = shellSelect.value;
    toast('新标签将使用 ' + (term.shells.find((item) => item.id === shellSelect.value)?.name ?? shellSelect.value));
  });
  card.appendChild(settingsRow('默认 Shell', '新建终端标签时使用。', shellSelect));

  const isTermOpen = state.dock.open;
  const openBtn = settingsButton(isTermOpen ? '收起终端' : '打开终端', () => {
    closeSettings();
    if (isTermOpen) termClose();
    else termOpen();
  }, true);
  card.appendChild(settingsRow('终端面板', '在底部 dock 打开，不会挡住输入框。快捷键 Ctrl+`。', openBtn));
  section.appendChild(card);

  const help = settingsSection('常用快捷键', '');
  const helpCard = settingsCard();
  for (const [keys, text] of [
    ['Ctrl+`', '打开 / 收起终端工作台'],
    ['Ctrl+K', '全局命令中心'],
    ['Ctrl+Shift+F', '打开文件工作台'],
    ['Ctrl+Shift+G', '查看本会话改动'],
    ['Esc', '关闭最上层；在终端里留给 shell'],
    ['Enter / Shift+Enter', '发送 / 换行'],
    ['@', '引用项目文件'],
    ['/', '打开命令面板'],
  ]) {
    const row = settingsRow(keys, text);
    row.querySelector('.set-copy strong').style.fontFamily = 'var(--mono)';
    helpCard.appendChild(row);
  }
  help.appendChild(helpCard);
  body.append(section, help);
}

function renderWorkspaceSettings(body) {
  const info = state.info;
  const section = settingsSection('工作区', '文件工具和命令都只能在这个目录下执行。');
  const card = settingsCard();
  const input = settingsInput(info.workspace ?? '', '绝对路径，例如 D:\\project');
  const switchBtn = settingsButton('切换', async () => {
    const value = input.value.trim();
    if (!value) return toast('请填写目录路径');
    try {
      await saveSetting('workspace', { value });
      state.trustPrompted = false;
      await refresh(false);
      renderHeader();
      renderSettings();
      $('filesTree').innerHTML = '';
      toast('工作区已切换到 ' + value);
      void maybePromptProjectTrust();
    } catch (error) {
      toast('切换失败：' + (error?.message ?? error));
    }
  }, true);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') switchBtn.click(); });
  const box = document.createElement('div');
  box.style.display = 'flex';
  box.style.gap = '6px';
  box.append(input, switchBtn);
  card.appendChild(settingsRow('当前工作区', '切换后插件也会重新加载项目目录。', box));
  const docNote = document.createElement('span');
  docNote.className = 'hint';
  docNote.textContent =
    info.projectTrust?.status === 'pending'
      ? '检测到未信任的项目级配置/插件/AGENT.md；信任后才会加载。'
      : info.agentDocPath
        ? `已加载：${info.agentDocPath}`
        : '未找到 AGENT.md；可在项目根目录创建，或运行 /env 查看模板。';
  card.appendChild(
    settingsRow(
      '项目规则 AGENT.md',
      '用户确认过的环境、路径、命令和限制会直接采用，不再重复探测。',
      docNote,
    ),
  );
  section.appendChild(card);

  const permSection = settingsSection('权限', '不确定就保持「每次问」。改动会立刻保存，CLI 和 GUI 共用。');
  const permCard = settingsCard();
  const PERM_INFO = {
    shell: { name: '执行命令', hint: '运行 npm test、git status 等命令。' },
    write: { name: '写入文件', hint: '新建或修改文件，可用左下角撤销回滚。' },
    network: { name: '联网', hint: '搜索和抓取网页。' },
  };
  for (const key of ['shell', 'write', 'network']) {
    const spec = PERM_INFO[key];
    permCard.appendChild(
      settingsRow(
        spec.name,
        spec.hint,
        settingsSeg(
          [
            { value: 'ask', label: '每次问' },
            { value: 'allow', label: '允许' },
            { value: 'deny', label: '禁止' },
          ],
          info.permissions[key],
          async (mode) => {
            await saveSetting('permission', { name: key, value: mode });
            await refresh(false);
            toast(`「${spec.name}」已设为：${mode === 'ask' ? '每次问' : mode === 'allow' ? '允许' : '禁止'}`);
          },
        ),
      ),
    );
  }
  permSection.appendChild(permCard);
  body.append(section, permSection);
}

function pluginBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'plugin-badge';
  badge.textContent = text;
  return badge;
}

function renderPluginSettings(body) {
  const section = settingsSection('插件工坊', '插件就是 .mjs 文件。可以生成模板、查看错误、试运行和启用停用。');

  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.style.justifyContent = 'flex-start';
  actions.style.marginBottom = '12px';
  actions.append(
    settingsButton('重新加载', async () => {
      try {
        state.plugins = await post('plugins', { action: 'reload' });
        await refresh(false);
        renderSettings();
        toast('插件已重新加载');
      } catch (error) {
        toast('重载失败：' + (error?.message ?? error));
      }
    }, true),
    settingsButton('新建模板', async () => {
      try {
        const result = await post('plugins', { action: 'create' });
        state.plugins = result;
        await refresh(false);
        renderSettings();
        toast('已创建 ' + result.file);
      } catch (error) {
        toast('创建失败：' + (error?.message ?? error));
      }
    }),
    settingsButton('打开全局目录', () => {
      post('plugins', { action: 'open', scope: 'global' }).catch((error) => toast('打开失败：' + error.message));
    }),
    settingsButton('打开项目目录', () => {
      post('plugins', { action: 'open', scope: 'project' }).catch((error) => toast('打开失败：' + error.message));
    }),
  );
  section.appendChild(actions);

  const list = document.createElement('div');
  list.innerHTML = '<div class="plugin-empty">读取插件中…</div>';
  section.appendChild(list);
  body.appendChild(section);

  void (async () => {
    let data;
    try {
      data = await get('plugins');
      state.plugins = data;
    } catch (error) {
      list.innerHTML = `<div class="plugin-empty">${escapeHtml(error.message)}</div>`;
      return;
    }
    if (state.settingsCategory !== 'plugins') return;
    list.innerHTML = '';
    if (!data.plugins?.length) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty';
      empty.textContent = '还没有插件。点「新建模板」生成第一个，或把 .mjs 放进插件目录。';
      list.appendChild(empty);
    }
    for (const plugin of data.plugins ?? []) {
      list.appendChild(renderPluginCard(plugin));
    }
    const dirs = document.createElement('div');
    dirs.className = 'hint';
    dirs.style.marginTop = '12px';
    dirs.textContent = '全局：' + (data.dirs?.find((dir) => dir.id === 'global')?.path ?? '') + '　项目：' + (data.dirs?.find((dir) => dir.id === 'project')?.path ?? '');
    list.appendChild(dirs);
  })();
}

function renderPluginCard(plugin) {
  const card = document.createElement('div');
  card.className = `plugin-card${plugin.enabled ? '' : ' is-off'}`;
  const main = document.createElement('div');
  main.className = 'plugin-main';
  const name = document.createElement('div');
  name.className = 'plugin-name';
  name.textContent = plugin.name || plugin.file.split(/[\\/]/).pop();
  name.appendChild(pluginBadge(plugin.ok ? (plugin.disabled ? '已停用' : '已加载') : '加载失败'));
  if (plugin.approval && plugin.approval !== 'never') name.appendChild(pluginBadge(plugin.approval));
  main.appendChild(name);
  const desc = document.createElement('div');
  desc.className = 'plugin-desc';
  desc.textContent = plugin.description || (plugin.ok ? '没有填写说明。' : '插件文件存在错误，模型暂时无法调用。');
  main.appendChild(desc);
  const file = document.createElement('div');
  file.className = 'plugin-file';
  file.textContent = plugin.file;
  main.appendChild(file);
  if (plugin.error) {
    const error = document.createElement('div');
    error.className = 'plugin-error';
    error.textContent = plugin.error;
    main.appendChild(error);
  }

  const acts = document.createElement('div');
  acts.className = 'plugin-actions';
  if (plugin.ok) {
    acts.appendChild(
      settingsSwitch(plugin.enabled, async (on) => {
        try {
          const result = await post('plugins', { action: 'toggle', name: plugin.name, disabled: !on });
          state.plugins = result;
          await refresh(false);
          renderSettings();
          toast(on ? `已启用 ${plugin.name}` : `已停用 ${plugin.name}`);
        } catch (error) {
          toast('操作失败：' + (error?.message ?? error));
          renderSettings();
        }
      }),
    );
    const test = settingsButton('试运行', () => {
      const existing = card.querySelector('.plugin-test');
      if (existing) {
        existing.remove();
        return;
      }
      const box = document.createElement('div');
      box.className = 'plugin-test';
      box.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px';
      const area = document.createElement('textarea');
      area.className = 'plugin-json';
      area.value = '{\n  "text": "hello"\n}';
      const run = settingsButton('运行', async () => {
        output.textContent = '运行中…';
        try {
          const result = await post('plugins', { action: 'test', file: plugin.file, input: area.value });
          output.textContent = result.result ?? '(无输出)';
        } catch (error) {
          output.textContent = '失败：' + (error?.message ?? error);
        }
      }, true);
      const output = document.createElement('pre');
      output.className = 'plugin-error';
      output.textContent = '输入 JSON，然后点运行。';
      box.append(area, run, output);
      main.appendChild(box);
    });
    acts.appendChild(test);
  }
  card.append(main, acts);
  return card;
}

function renderAboutSettings(body) {
  const info = state.info;
  const section = settingsSection('关于 Banana', '一个把 CLI 内核完整搬进图形界面的本地 agent。');
  const card = settingsCard();
  card.appendChild(settingsRow('CLI 版本', 'CLI 与 GUI 使用同一套 agent 循环和工具。', pluginBadge('v' + (info.version ?? '0.6.0'))));
  card.appendChild(settingsRow('工作区', info.workspace ?? '', null));
  card.appendChild(settingsRow('工具数量', `${info.tools?.length ?? 0} 个`, null));
  card.appendChild(settingsRow('平台', info.platform === 'win32' ? 'Windows' : info.platform === 'darwin' ? 'macOS' : 'Linux', null));
  section.appendChild(card);

  const tip = settingsCard();
  tip.appendChild(settingsRow('命令中心', '按 Ctrl+K 搜索会话、文件、动作和设置。', settingsButton('打开', () => { closeSettings(); openCommandCenter(); })));
  tip.appendChild(settingsRow('项目文件', '代码支持行号、全屏查看和选中后问 AI。', settingsButton('打开', () => { closeSettings(); openFiles(); })));
  section.appendChild(tip);
  body.appendChild(section);
}

// ---------------- 外壳：侧栏 / Review / 终端 dock ----------------
const SHELL_STORAGE = {
  sidebarWidth: 'banana.sidebar.width',
  sidebarOpen: 'banana.sidebar.open.v2',
  reviewWidth: 'banana.review.width',
  reviewMode: 'banana.review.mode',
  tabState: 'banana.tabs.v1',
  dockHeight: 'banana.dock.height',
  dockOpen: 'banana.dock.open',
};

function applySidebarWidth(width) {
  const max = Math.max(240, Math.min(430, window.innerWidth * 0.42));
  state.sidebar.width = Math.max(240, Math.min(Number(width) || 344, max));
  document.documentElement.style.setProperty('--sidebar', `${Math.round(state.sidebar.width)}px`);
}

function setSidebar(open) {
  state.sidebar.open = Boolean(open);
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const sidebar = $('sidebar');
  sidebar.classList.toggle('open', state.sidebar.open && narrow);
  // 桌面端收起 = 真正隐藏；窄屏收起 = 平移出屏，但仍需 inert
  sidebar.hidden = !state.sidebar.open && !narrow;
  sidebar.inert = !state.sidebar.open;
  sidebar.setAttribute('aria-hidden', String(!state.sidebar.open));
  $('toggleSidebar').classList.toggle('is-on', state.sidebar.open);
  $('toggleSidebar').setAttribute('aria-expanded', String(state.sidebar.open));
  try {
    localStorage.setItem(SHELL_STORAGE.sidebarOpen, state.sidebar.open ? '1' : '0');
  } catch {}
}

function toggleSidebar() {
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  setSidebar(!state.sidebar.open || (narrow && !$('sidebar').classList.contains('open')));
}

function applyReviewWidth(width) {
  const max = Math.max(480, Math.min(800, window.innerWidth * 0.7));
  state.review.width = Math.max(480, Math.min(Number(width) || 520, max));
  $('reviewPanel').style.setProperty('--review-width', `${Math.round(state.review.width)}px`);
}

function setReviewMode(mode) {
  if (!['changes', 'files', 'tasks', 'verify'].includes(mode)) mode = 'changes';
  state.review.mode = mode;
  try {
    localStorage.setItem(SHELL_STORAGE.reviewMode, mode);
  } catch {}
  for (const name of ['Changes', 'Files', 'Tasks', 'Verify']) {
    $(`reviewTab${name}`)?.classList.toggle('is-on', mode === name.toLowerCase());
  }
  for (const name of ['changes', 'files', 'tasks', 'verify']) {
    $(`${name}Panel`)?.classList.toggle('is-on', mode === name);
  }
  if (mode === 'changes') void loadChanges();
  else if (mode === 'tasks') renderTodos();
  else if (mode === 'verify') renderVerify();
  else {
    applyFilesLayout();
    $('filesTitle').textContent = `工作区文件 · ${state.info?.workspace ?? ''}`;
    if (!$('filesTree').childElementCount) void loadTree('.');
  }
}

function renderVerify() {
  const list = $('verifyList');
  if (!list) return;
  const session = state.info?.session;
  if (!session) {
    list.innerHTML = '<div class="hint" style="padding:12px">还没有会话。</div>';
    return;
  }
  const todos = Array.isArray(session.todos) ? session.todos : [];
  const facts = Array.isArray(session.facts) ? session.facts : [];
  const unknowns = Array.isArray(session.unknowns) ? session.unknowns : [];
  const done = todos.filter((item) => item.status === 'done').length;
  const pending = todos.filter((item) => item.status !== 'done');
  const plan = session.plan;
  const planText = plan
    ? `${plan.status === 'approved' ? '已批准' : plan.status === 'pending' ? '等待批准' : '已取消'}${
        plan.currentPhase ? ` · 当前阶段 ${plan.currentPhase}` : ''
      }`
    : '没有计划';
  const rows = [
    ['计划', planText],
    ['任务', `${done}/${todos.length} 完成`],
    ['事实', `${facts.length} 条已确认`],
    ['未验证项', unknowns.length ? unknowns.map((item) => item.item).join('、') : '未记录'],
    ['下一步', pending.length ? pending.slice(0, 6).map((item) => item.text).join('；') : '没有待办'],
  ];
  const verification = session.verification;
  if (verification?.results?.length) {
    const failed = verification.results.filter((result) => !result.ok).length;
    rows.push([
      '验收',
      `${verification.results.length - failed}/${verification.results.length} 通过 · ${new Date(verification.at).toLocaleString()}`,
    ]);
    for (const result of verification.results) {
      rows.push([
        result.ok ? '✓ 通过' : '✗ 失败',
        `${result.command} · ${(result.ms / 1000).toFixed(1)}s`,
      ]);
    }
  } else {
    rows.push(['验收', '还没有运行 /verify']);
  }
  list.innerHTML =
    rows
      .map(
        ([key, value]) =>
          `<div class="verify-row"><span class="verify-key">${escapeHtml(key)}</span><span class="verify-value">${escapeHtml(value)}</span></div>`,
      )
      .join('') +
    '<div class="hint" style="padding:10px 12px">交付前请运行 /verify 跑测试和构建；结果会自动写入这里。</div>';

  const phases = [...new Set((plan?.items ?? []).map((item) => item.phase).filter(Boolean))];
  const phaseIndex = phases.indexOf(plan?.currentPhase);
  if (plan?.status === 'approved' && phaseIndex >= 0 && phaseIndex < phases.length - 1) {
    const next = document.createElement('button');
    next.className = 'btn primary';
    next.style.margin = '10px 12px';
    next.textContent = `下一阶段：${phases[phaseIndex + 1]}`;
    next.addEventListener('click', () => nextPlanPhase());
    list.appendChild(next);
  }
}

function syncReviewScrim() {
  const scrim = $('reviewScrim');
  if (!scrim) return;
  const overlay = window.matchMedia('(max-width: 1180px)').matches;
  scrim.hidden = !(state.review.open && overlay);
}

function openReview(mode = 'changes') {
  state.review.open = true;
  state.reviewRestore = document.activeElement;
  const panel = $('reviewPanel');
  panel.classList.remove('is-closing');
  panel.hidden = false;
  applyReviewWidth(state.review.width);
  setReviewMode(mode);
  syncReviewScrim();
  syncOverlayState();
}

function closeReview() {
  const panel = $('reviewPanel');
  if (!state.review.open) return;
  state.review.open = false;
  panel.classList.add('is-closing');
  $('reviewScrim').hidden = true;
  setTimeout(() => {
    if (state.review.open) return;
    panel.hidden = true;
    panel.classList.remove('is-closing');
    syncOverlayState();
    const back = state.reviewRestore;
    state.reviewRestore = null;
    if (back && back.isConnected) back.focus();
    else $('input')?.focus();
    termFitActive();
  }, 200);
}

function initShell() {
  try {
    const sw = Number(localStorage.getItem(SHELL_STORAGE.sidebarWidth));
    applySidebarWidth(sw || 344);
    const rw = Number(localStorage.getItem(SHELL_STORAGE.reviewWidth));
    applyReviewWidth(rw || 520);
    const rm = localStorage.getItem(SHELL_STORAGE.reviewMode);
    if (rm) state.review.mode = rm;
    const dh = Number(localStorage.getItem(SHELL_STORAGE.dockHeight));
    if (dh) state.dock.height = Math.max(120, Math.min(dh, window.innerHeight * 0.6));
    const openSidebar = localStorage.getItem(SHELL_STORAGE.sidebarOpen);
    // 历史栏默认收起：顶部标签才是主入口
    state.sidebar.open = openSidebar === '1';
  } catch {
    applySidebarWidth(344);
    applyReviewWidth(520);
  }
  setSidebar(state.sidebar.open);
  $('reviewTabChanges').addEventListener('click', () => setReviewMode('changes'));
  $('reviewTabFiles').addEventListener('click', () => setReviewMode('files'));
  $('reviewTabTasks').addEventListener('click', () => setReviewMode('tasks'));
  $('reviewTabVerify').addEventListener('click', () => setReviewMode('verify'));
  $('reviewClose').addEventListener('click', closeReview);
  $('reviewScrim').addEventListener('click', closeReview);
  $('reviewRefresh').addEventListener('click', () => {
    state.changes = null;
    if (state.review.mode === 'changes') void loadChanges(true);
    else if (state.review.mode === 'tasks') renderTodos();
    else $('filesTree').innerHTML = '', void loadTree('.');
  });
  $('sbResizer').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const move = (moveEvent) => applySidebarWidth(moveEvent.clientX - 8);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(SHELL_STORAGE.sidebarWidth, String(Math.round(state.sidebar.width)));
      } catch {}
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  $('reviewResizer').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const move = (moveEvent) => {
      applyReviewWidth(window.innerWidth - 8 - moveEvent.clientX);
      termFitActive();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(SHELL_STORAGE.reviewWidth, String(Math.round(state.review.width)));
      } catch {}
      termFitActive();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  window.addEventListener('resize', () => {
    applyReviewWidth(state.review.width);
    syncReviewScrim();
    setSidebar(state.sidebar.open);
    termFitActive();
  });
}

// ---------------- 变更（Diff） ----------------
async function loadChanges(force = false) {
  if (!force && state.changes) {
    renderChanges();
    return;
  }
  const list = $('changesList');
  list.innerHTML = '<div class="hint" style="padding:12px">读取改动…</div>';
  try {
    const data = await get('changes');
    state.changes = data;
    renderChanges();
  } catch (error) {
    list.innerHTML = `<div class="hint" style="padding:12px">${escapeHtml(error.message)}</div>`;
  }
}

function renderChanges() {
  const list = $('changesList');
  const detail = $('changesDetail');
  const stats = $('reviewStats');
  list.innerHTML = '';
  const turns = state.changes?.turns ?? [];
  if (!turns.length) {
    stats.textContent = '';
    list.innerHTML = '<div class="changes-empty"><strong>还没有改动</strong><span>让 Banana 改一次文件后，这里会出现增删行。</span></div>';
    detail.innerHTML = '<div class="hint">没有可显示的改动。</div>';
    return;
  }
  let total = 0;
  let additions = 0;
  let deletions = 0;
  for (const turn of turns) {
    const group = document.createElement('div');
    group.className = 'changes-group';
    const head = document.createElement('div');
    head.className = 'changes-turn';
    head.textContent = new Date(turn.at).toLocaleString();
    group.appendChild(head);
    for (const file of turn.files) {
      total += 1;
      additions += file.additions;
      deletions += file.deletions;
      const button = document.createElement('button');
      button.className = 'change-file';
      button.innerHTML =
        `<span class="change-status ${file.missing ? 'deleted' : file.existed ? 'modified' : 'added'}">${file.missing ? 'D' : file.existed ? 'M' : 'A'}</span>` +
        `<span class="cf-name">${escapeHtml(file.path)}</span>` +
        (file.skipped
          ? '<span class="cf-count" title="文件超过 4MB，未备份，/undo 无法恢复"><i class="minus">未备份</i></span>'
          : `<span class="cf-count"><i class="plus">+${file.additions}</i><i class="minus">-${file.deletions}</i></span>`);
      button.addEventListener('click', () => {
        list.querySelectorAll('.change-file.is-on').forEach((node) => node.classList.remove('is-on'));
        button.classList.add('is-on');
        renderDiff(file);
      });
      group.appendChild(button);
    }
    list.appendChild(group);
  }
  stats.innerHTML = `<i class="plus">+${additions}</i> <i class="minus">-${deletions}</i> · ${total} 个文件`;
  // 默认打开第一个有内容的文件
  const firstFile = turns.find((turn) => turn.files.length)?.files[0];
  if (firstFile) {
    const firstButton = list.querySelector('.change-file');
    firstButton?.classList.add('is-on');
    renderDiff(firstFile);
  } else {
    detail.innerHTML = '<div class="hint">没有可显示的改动。</div>';
  }
}

function renderDiff(file) {
  const detail = $('changesDetail');
  detail.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'diff-head';
  head.innerHTML =
    `<span class="diff-path">${escapeHtml(file.path)}</span>` +
    `<span class="diff-stat"><i class="plus">+${file.additions}</i><i class="minus">-${file.deletions}</i></span>` +
    (file.missing ? '<span class="plugin-badge">文件已不存在</span>' : '');
  detail.appendChild(head);
  const body = document.createElement('div');
  body.className = 'diff-body';
  const lines = file.lines ?? [];
  if (!lines.length) {
    body.innerHTML = '<div class="hint" style="padding:10px">没有行级差异（可能只是换行符变化）。</div>';
  } else {
    for (const line of lines) {
      const row = document.createElement('div');
      row.className = `diff-line ${line.type}`;
      const oldNo = line.oldLine ?? '';
      const newNo = line.newLine ?? '';
      row.innerHTML =
        `<span class="diff-no">${oldNo}</span><span class="diff-no">${newNo}</span>` +
        `<span class="diff-sign">${line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span>` +
        `<span class="diff-text"></span>`;
      row.querySelector('.diff-text').textContent = line.text;
      body.appendChild(row);
    }
  }
  if (file.truncated) {
    const note = document.createElement('div');
    note.className = 'hint';
    note.style.padding = '8px 10px';
    note.textContent = '改动较大，只显示前面一部分。';
    body.appendChild(note);
  }
  detail.appendChild(body);
  detail.scrollTop = 0;
}

// ---------------- 文件面板 ----------------


const FILE_ICON = { dir: 'folder', file: 'file' };
const FILE_STORAGE = { tree: 'banana.files.tree', wrap: 'banana.files.wrap' };

async function loadTree(path = '.', container = $('filesTree')) {
  container.innerHTML = '<div class="hint" style="padding:8px 10px">读取中…</div>';
  try {
    const { entries } = await get(`files?path=${encodeURIComponent(path)}`);
    container.innerHTML = '';
    if (!entries.length) {
      container.innerHTML = '<div class="hint" style="padding:8px 10px">（空目录）</div>';
      return;
    }
    entries.forEach((entry, index) => {
      const row = document.createElement('button');
      row.className = 'file-row';
      row.dataset.path = entry.path;
      row.style.setProperty('--i', String(Math.min(index, 14)));
      row.innerHTML =
        `<span class="tool-caret">${entry.type === 'dir' ? svg('chevron') : ''}</span>` +
        `<span>${svg(FILE_ICON[entry.type])}</span>` +
        `<span class="f-name">${escapeHtml(entry.name)}</span>`;
      row.addEventListener('click', async () => {
        if (entry.type === 'dir') {
          const holder = row.nextElementSibling;
          if (holder?.classList.contains('file-children')) {
            holder.remove();
            row.classList.remove('is-open');
            return;
          }
          row.classList.add('is-open');
          const box = document.createElement('div');
          box.className = 'file-children';
          row.after(box);
          await loadTree(entry.path, box);
        } else {
          await openFile(entry.path);
        }
      });
      container.appendChild(row);
    });
  } catch (error) {
    container.innerHTML = `<div class="hint" style="padding:8px 10px">${escapeHtml(error.message)}</div>`;
  }
}

function applyFilesLayout() {
  const panel = $('filesPanel');
  const tree = Number(localStorage.getItem(FILE_STORAGE.tree));
  if (tree) panel.style.setProperty('--tree-height', `${tree}px`);
  const wrap = localStorage.getItem(FILE_STORAGE.wrap) === '1';
  $('previewBody').classList.toggle('is-wrap', wrap);
  $('viewerBody').classList.toggle('is-wrap', wrap);
  $('previewWrap').classList.toggle('is-on', wrap);
  $('viewerWrap').classList.toggle('is-on', wrap);
}

function openFiles() {
  applyFilesLayout();
  $('filesTitle').textContent = `工作区文件 · ${state.info?.workspace ?? ''}`;
  openReview('files');
}

function openChanges() {
  openReview('changes');
  void loadChanges(true);
}

function closeFiles() {
  closeReview();
}

function toggleFiles() {
  if (state.review.open && state.review.mode === 'files') closeReview();
  else openFiles();
}

function closePreview() {
  const panel = $('filesPanel');
  const box = $('filesPreview');
  if (box.hidden) return;
  panel.classList.remove('previewing');
  box.hidden = true;
  state.preview = null;
}

async function openFile(path) {
  const box = $('filesPreview');
  const body = $('previewBody');
  $('filesPanel').classList.add('previewing');
  box.hidden = false;
  $('previewName').textContent = path;
  $('insertPath').dataset.path = path;
  body.innerHTML = '<div class="hint" style="padding:14px">读取中…</div>';
  document.querySelectorAll('.file-row.is-active').forEach((node) => node.classList.remove('is-active'));
  document.querySelectorAll('.file-row').forEach((node) => {
    if (node.dataset.path === path) node.classList.add('is-active');
  });
  try {
    const data = await get(`file?path=${encodeURIComponent(path)}`);
    state.preview = { path, code: data.content ?? '', binary: Boolean(data.binary), tooLarge: Boolean(data.tooLarge) };
    if (data.binary) {
      body.innerHTML = `<div class="hint" style="padding:14px">二进制文件（${data.bytes} 字节），无法预览。</div>`;
    } else if (data.tooLarge) {
      body.innerHTML = `<div class="hint" style="padding:14px">文件较大（${data.bytes} 字节），未加载。</div>`;
    } else {
      renderCode(body, data.content ?? '', path);
    }
  } catch (error) {
    body.innerHTML = `<div class="hint" style="padding:14px">${escapeHtml(error.message)}</div>`;
  }
}

function openViewer() {
  const preview = state.preview;
  if (!preview?.code) return toast('没有可查看的代码');
  $('viewerName').textContent = preview.path;
  renderCode($('viewerBody'), preview.code, preview.path);
  applyFilesLayout();
  $('codeViewer').classList.remove('is-closing');
  $('codeViewer').hidden = false;
  document.body.classList.add('has-overlay');
}

function closeViewer() {
  const viewer = $('codeViewer');
  if (viewer.hidden) return;
  void hideAnimated(viewer, 'is-closing', 160).then(syncOverlayState);
}

function toggleWrap() {
  const on = !$('previewBody').classList.contains('is-wrap');
  $('previewBody').classList.toggle('is-wrap', on);
  $('viewerBody').classList.toggle('is-wrap', on);
  $('previewWrap').classList.toggle('is-on', on);
  $('viewerWrap').classList.toggle('is-on', on);
  localStorage.setItem(FILE_STORAGE.wrap, on ? '1' : '0');
}

function initFileResize() {
  const panel = $('filesPanel');
  $('filesDivider').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const split = $('filesSplit');
    const move = (moveEvent) => {
      const rect = split.getBoundingClientRect();
      const height = Math.max(76, Math.min(rect.height - 140, moveEvent.clientY - rect.top));
      panel.style.setProperty('--tree-height', `${height}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      localStorage.setItem(FILE_STORAGE.tree, String(Math.round($('filesTree').getBoundingClientRect().height)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}


// ---------------- 工具输出详情 ----------------
function toggleToolOutput(row, detail, isError) {
  const existing = row.nextElementSibling;
  if (existing?.classList.contains('tool-output')) {
    existing.remove();
    row.classList.remove('is-open');
    return;
  }
  const pre = document.createElement('div');
  pre.className = `tool-output${isError ? ' is-error' : ''}`;
  pre.textContent = detail || '(无输出)';
  row.after(pre);
  row.classList.add('is-open');
}

// ---------------- 启动 ----------------
// ---------------- 内嵌终端（xterm + PTY） ----------------
const TERM_FONT = '"Cascadia Mono", "JetBrains Mono", "SF Mono", Consolas, "Microsoft YaHei", monospace';
const TERM_STORAGE = {
  fontSize: 'banana.term.fontSize',
  shell: 'banana.term.shell',
};

const term = {
  open: false,
  fontSize: Number(localStorage.getItem(TERM_STORAGE.fontSize)) || 13,
  shells: [],
  defaultShell: '',
  tabs: [],
  activeId: null,
  counter: 0,
  loadedShells: false,
};

function termIsDark() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// scanner-allow: terminal-palette
/** 柔和配色：不用纯红纯绿，降低饱和度，长时间看不刺眼。 */
function termTheme() {
  const dark = termIsDark();
  return {
    background: dark ? '#101013' : '#fbfbfa',
    foreground: dark ? '#d9d9d4' : '#26262b',
    cursor: dark ? '#e8e8e2' : '#16161a',
    cursorAccent: dark ? '#101013' : '#fbfbfa',
    selectionBackground: dark ? 'rgba(220, 222, 141, 0.3)' : 'rgba(138, 109, 18, 0.18)',
    black: dark ? '#2a2a30' : '#3a3a40',
    red: dark ? '#d1786e' : '#b4453a',
    green: dark ? '#86b98d' : '#2f7d50',
    yellow: dark ? '#d2b06a' : '#8f6b1f',
    blue: dark ? '#8aa9dc' : '#3b63b0',
    magenta: dark ? '#b294cd' : '#7b4d9e',
    cyan: dark ? '#82bdbd' : '#257f80',
    white: dark ? '#c9c9c4' : '#55555c',
    brightBlack: dark ? '#6c6c75' : '#8c8c93',
    brightRed: dark ? '#e29a90' : '#c9564a',
    brightGreen: dark ? '#a3d2a8' : '#3f9a66',
    brightYellow: dark ? '#e6ca8c' : '#b0852d',
    brightBlue: dark ? '#a9c3ee' : '#527cd1',
    brightMagenta: dark ? '#cbb0e2' : '#9a67c4',
    brightCyan: dark ? '#a2d4d4' : '#2f9a9a',
    brightWhite: dark ? '#f2f2ee' : '#16161a',
  };
}
// scanner-allow-end

function termActiveTab() {
  return term.tabs.find((tab) => tab.id === term.activeId) ?? null;
}

function termFitActive() {
  if ($('terminalPanel').hidden) return;
  const tab = termActiveTab();
  if (!tab) return;
  try {
    tab.fit.fit();
    tab.sendResize();
  } catch {
    /* 面板还没布局完成 */
  }
}

function applyDockHeight(height, persist = true) {
  const max = Math.max(160, window.innerHeight * 0.6);
  state.dock.height = Math.max(120, Math.min(Number(height) || 280, max));
  $('terminalPanel').style.setProperty('--term-height', `${Math.round(state.dock.height)}px`);
  if (persist) {
    try {
      localStorage.setItem(SHELL_STORAGE.dockHeight, String(Math.round(state.dock.height)));
    } catch {}
  }
  requestAnimationFrame(() => termFitActive());
}

function termUpdateCwd(cwd) {
  const label = $('termCwd');
  if (label && cwd) label.textContent = cwd;
}

let termShellsPromise = null;
async function termLoadShells() {
  if (termShellsPromise) return termShellsPromise;
  term.loadedShells = true;
  termShellsPromise = (async () => {
    try {
      const data = await get('shells');
      term.shells = Array.isArray(data.shells) ? data.shells : [];
      term.defaultShell = data.default || term.shells[0]?.id || 'cmd';
      const select = $('termShell');
      const preferred = localStorage.getItem(TERM_STORAGE.shell);
      select.innerHTML = term.shells
        .map((shell) => `<option value="${escapeHtml(shell.id)}">${escapeHtml(shell.name)}</option>`)
        .join('');
      select.value = term.shells.some((shell) => shell.id === preferred) ? preferred : term.defaultShell;
      select.addEventListener('change', () => {
        localStorage.setItem(TERM_STORAGE.shell, select.value);
        closeTermMenu();
        // 这里只记录“新标签”用哪个 shell；真正新建走 + 按钮。
        toast('新标签将使用 ' + (term.shells.find((shell) => shell.id === select.value)?.name ?? select.value));
      });
    } catch {
      term.shells = [{ id: 'cmd', name: '终端' }];
      term.defaultShell = 'cmd';
    }
  })();
  return termShellsPromise;
}

function termRenderTabs() {
  const holder = $('termTabs');
  holder.innerHTML = '';
  for (const tab of term.tabs) {
    const node = document.createElement('div');
    node.className = 'term-tab' + (tab.id === term.activeId ? ' active' : '');
    node.tabIndex = 0;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(tab.id === term.activeId));
    node.innerHTML = `<span class="term-tab-name">${escapeHtml(tab.name)}</span><button class="term-tab-close" title="关闭标签" aria-label="关闭标签"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    node.addEventListener('keydown', (event) => {
      if (event.target.closest('.term-tab-close')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        termActivate(tab.id);
      }
    });
    node.addEventListener('click', (event) => {
      if (event.target.closest('.term-tab-close')) {
        event.stopPropagation();
        termCloseTab(tab.id);
        return;
      }
      termActivate(tab.id);
    });
    holder.appendChild(node);
  }
}

function termActivate(id) {
  term.activeId = id;
  for (const tab of term.tabs) {
    const active = tab.id === id;
    tab.pane.classList.toggle('active', active);
    if (active) {
      requestAnimationFrame(() => {
        try {
          tab.fit.fit();
        } catch {
          /* 面板还没显示 */
        }
        tab.terminal.focus();
      });
    }
  }
  termRenderTabs();
}

function termConnect(tab) {
  const url = new URL(API + 'terminal/ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('shell', tab.shell || term.defaultShell || 'cmd');
  url.searchParams.set('cwd', state.info?.workspace ?? '');
  url.searchParams.set('cols', String(tab.terminal.cols || 100));
  url.searchParams.set('rows', String(tab.terminal.rows || 28));
  if (tab.termId) url.searchParams.set('id', tab.termId);

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (error) {
    tab.terminal.write(`\r\n\x1b[31m连接终端失败：${error?.message ?? error}\x1b[0m\r\n`);
    return;
  }
  tab.ws = ws;

  ws.addEventListener('open', () => {
    requestAnimationFrame(() => {
      try {
        tab.fit.fit();
      } catch {
        /* 忽略 */
      }
      tab.sendResize();
    });
  });
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'id' || message.type === 'ready') {
      if (message.id) tab.termId = message.id;
      if (message.cwd) termUpdateCwd(message.cwd);
    } else if (message.type === 'data') {
      tab.terminal.write(message.data);
    } else if (message.type === 'exit') {
      // 用户主动 exit 后不要自动重连，否则关闭的 shell 会悄悄重启。
      tab.alive = false;
      tab.terminal.write(`\r\n\x1b[90m[进程已退出，代码 ${message.code ?? 0}]\x1b[0m\r\n`);
    } else if (message.type === 'error') {
      tab.terminal.write(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`);
    }
  });
  ws.addEventListener('close', () => {
    if (!tab.alive) return;
    // 服务重启或网络抖动时自动重连；服务端会按 tab.termId 把会话接回来
    setTimeout(() => {
      if (tab.alive && (!tab.ws || tab.ws.readyState > 1)) termConnect(tab);
    }, 900);
  });

  tab.sendResize = () => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'resize', cols: tab.terminal.cols, rows: tab.terminal.rows }));
  };
}

function termCreateTab(shellId) {
  if (!term.shells.length) {
    void termLoadShells().then(() => {
      if (term.shells.length) termCreateTab(shellId);
    });
    return;
  }
  const shell = term.shells.find((item) => item.id === shellId) ?? term.shells[0];
  const name = shell?.name ?? '终端';
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  $('termBody').appendChild(pane);

  const terminal = new window.Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: TERM_FONT,
    fontSize: term.fontSize,
    lineHeight: 1.45,
    letterSpacing: 0,
    scrollback: 8000,
    allowTransparency: true,
    theme: termTheme(),
    rightClickSelectsWord: true,
  });
  const fit = new window.FitAddon.FitAddon();
  terminal.loadAddon(fit);
  terminal.open(pane);

  const tab = {
    id: `tab${++term.counter}`,
    name,
    shell: shell?.id ?? '',
    terminal,
    fit,
    pane,
    ws: null,
    termId: null,
    alive: true,
    sendResize: () => {},
  };
  term.tabs.push(tab);
  term.activeId = tab.id;
  // 输入监听只注册一次；重连只换 WebSocket，不能重复绑定，否则一个按键发两遍
  terminal.onData((data) => {
    if (tab.ws?.readyState === 1) tab.ws.send(JSON.stringify({ type: 'input', data }));
  });
  terminal.onResize(() => tab.sendResize());
  termRenderTabs();
  termActivate(tab.id);
  // 先连 WebSocket（不依赖页面可见性），再等布局完成 fit
  termConnect(tab);
  requestAnimationFrame(() => termFitActive());
  setTimeout(() => termFitActive(), 320);
  return tab;
}

function termCloseTab(id) {
  const index = term.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tab = term.tabs[index];
  tab.alive = false;
  try {
    if (tab.ws?.readyState === 1) tab.ws.send(JSON.stringify({ type: 'close' }));
    tab.ws?.close();
  } catch {
    /* 已经断开 */
  }
  try {
    tab.terminal.dispose();
  } catch {
    /* 忽略 */
  }
  tab.pane.remove();
  term.tabs.splice(index, 1);
  if (term.tabs.length === 0) {
    termClose();
    return;
  }
  if (term.activeId === id) {
    const next = term.tabs[Math.max(0, index - 1)] ?? term.tabs[0];
    termActivate(next.id);
  } else {
    termRenderTabs();
  }
}

function termEnsure() {
  if (term.tabs.length) {
    termActivate(term.activeId);
    return;
  }
  const create = () => {
    if (term.tabs.length) {
      termActivate(term.activeId);
      return;
    }
    termCreateTab($('termShell')?.value || term.defaultShell);
  };
  if (term.shells.length) create();
  else void termLoadShells().then(create);
}

function termOpen() {
  const panel = $('terminalPanel');
  state.dock.open = true;
  panel.classList.remove('is-closing');
  panel.hidden = false;
  applyDockHeight(state.dock.height, false);
  termUpdateCwd(state.info?.workspace ?? '');
  termEnsure();
  try {
    localStorage.setItem(SHELL_STORAGE.dockOpen, '1');
  } catch {}
  setTimeout(() => {
    termFitActive();
    termActiveTab()?.terminal.focus();
  }, 220);
}

function termClose() {
  const panel = $('terminalPanel');
  if (!state.dock.open) return;
  state.dock.open = false;
  panel.classList.add('is-closing');
  try {
    localStorage.setItem(SHELL_STORAGE.dockOpen, '0');
  } catch {}
  setTimeout(() => {
    if (state.dock.open) return;
    panel.hidden = true;
    panel.classList.remove('is-closing');
    $('input')?.focus();
  }, 200);
}

function termToggle() {
  if (state.dock.open) termClose();
  else termOpen();
}

function termRestyle() {
  const theme = termTheme();
  for (const tab of term.tabs) {
    tab.terminal.options.theme = theme;
    tab.terminal.options.fontSize = term.fontSize;
  }
  termFitActive();
}

function bindTerminal() {
  $('termBtn').innerHTML = svg('terminal');
  $('termAdd').innerHTML = svg('plus');
  $('termMore').innerHTML = svg('dots');
  $('termBtn').addEventListener('click', termToggle);
  $('termAdd').addEventListener('click', () => {
    closeTermMenu();
    termCreateTab($('termShell')?.value || term.defaultShell);
  });
  $('termMore').addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = $('termMenu');
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    if (willOpen) {
      // fixed 定位：终端 dock 有 overflow:hidden，菜单贴着头部放会被裁掉
      const rect = $('termMore').getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      menu.style.position = 'fixed';
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      if (below >= 150 || below >= above) {
        menu.style.top = `${Math.round(rect.bottom + 4)}px`;
        menu.style.bottom = 'auto';
        menu.style.maxHeight = `${Math.max(90, below)}px`;
      } else {
        menu.style.top = 'auto';
        menu.style.bottom = `${Math.max(8, Math.round(window.innerHeight - rect.top + 4))}px`;
        menu.style.maxHeight = `${Math.max(90, above)}px`;
      }
      menu.style.overflowY = 'auto';
      $('termMore').setAttribute('aria-expanded', 'true');
    } else {
      $('termMore').setAttribute('aria-expanded', 'false');
    }
  });
  $('termAnalyze').addEventListener('click', () => {
    closeTermMenu();
    analyzeTerminal();
  });
  $('termClear').addEventListener('click', () => {
    closeTermMenu();
    termActiveTab()?.terminal.clear();
  });
  $('termCopy').addEventListener('click', () => {
    closeTermMenu();
    const text = termActiveTab()?.terminal.getSelection?.() ?? '';
    if (text) copyText(text);
    else toast('先在终端里选中文字');
  });
  document.addEventListener('click', (event) => {
    if (!$('termMenu').hidden && !event.target.closest('#termMenu, #termMore')) closeTermMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === '`') {
      event.preventDefault();
      termToggle();
    }
  });

  const observer = new ResizeObserver(() => termFitActive());
  observer.observe($('terminalPanel'));

  $('termResizer').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = state.dock.height;
    const move = (moveEvent) => {
      applyDockHeight(startHeight - (moveEvent.clientY - startY), false);
      termFitActive();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      applyDockHeight(state.dock.height);
      if (state.dock.height <= 150) termClose();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  document.addEventListener('banana:theme', () => {
    if (term.tabs.length) termRestyle();
  });
  termUpdateCwd(state.info?.workspace ?? '');
}

function closeTermMenu() {
  const menu = $('termMenu');
  if (menu) menu.hidden = true;
  $('termMore')?.setAttribute('aria-expanded', 'false');
}

// ---------------- 命令中心（Ctrl+K） ----------------
const CC_GROUPS = ['会话', '动作', '设置', '命令', '文件'];

function ccActions() {
  return [
    { title: '新建对话', sub: '开始一个干净的会话', icon: 'plus', run: () => $('newChat').click() },
    { title: '打开项目文件', sub: '浏览、全屏查看、引用文件', icon: 'panel', run: openFiles },
    { title: '查看本会话改动', sub: '按文件查看增删行，审阅 agent 的修改', icon: 'diff', run: openChanges },
    { title: '打开终端', sub: '底部 dock，不遮挡输入框', icon: 'terminal', run: termOpen },
    { title: '打开控制中心', sub: '模型、外观、终端、工作区、插件', icon: 'sliders', run: () => openSettings() },
    { title: '插件工坊', sub: '启用、停用、生成模板、试运行插件', icon: 'plug', run: () => openSettings('plugins') },
    { title: '切换主题', sub: '浅色 / 深色 / 跟随系统', icon: 'sun', run: cycleTheme },
    { title: '撤销上一轮改动', sub: '把文件恢复到上一轮对话之前', icon: 'undo', run: () => $('undoBtn').click() },
  ];
}

function openCommandCenter() {
  const cc = $('commandCenter');
  if (!cc.hidden && !cc.classList.contains('is-closing')) {
    $('ccInput').select();
    return;
  }
  if (!$('settingsSheet').hidden) closeSettings();
  closeModelPop();
  closeReasoningPop();
  document.querySelector('.popover')?.remove();
  state.ccIndex = 0;
  state.ccFiles = [];
  $('ccInput').value = '';
  cc.classList.remove('is-closing');
  cc.hidden = false;
  renderCommandCenter('');
  syncOverlayState();
  requestAnimationFrame(() => {
    $('ccInput').focus();
    $('ccInput').select();
  });
}

function closeCommandCenter() {
  const cc = $('commandCenter');
  if (cc.hidden) return;
  void hideAnimated(cc, 'is-closing', 140).then(syncOverlayState);
  $('input')?.focus();
}

let ccFileTimer = 0;
let ccFileSeq = 0;
function scheduleCommandFiles(query) {
  clearTimeout(ccFileTimer);
  if (!query.trim()) return;
  const seq = ++ccFileSeq;
  ccFileTimer = setTimeout(async () => {
    try {
      const data = await get(`find?q=${encodeURIComponent(query.trim())}&limit=24`);
      if (seq !== ccFileSeq || $('commandCenter').hidden) return;
      state.ccFiles = data.files ?? [];
      renderCommandCenter($('ccInput').value);
    } catch {
      /* 文件搜索失败不打扰主流程 */
    }
  }, 150);
}

function renderCommandCenter(query) {
  const q = query.trim().toLowerCase();
  const hit = (text) => !q || String(text ?? '').toLowerCase().includes(q);
  const items = [];

  const sessions = state.sessions
    .filter((item) => hit(item.title) || hit('会话'))
    .slice(0, q ? 5 : 4)
    .map((item) => ({
      group: '会话',
      title: item.title || '新对话',
      sub: `${item.turns} 轮 · ${relativeTime(item.updatedAt)}`,
      icon: 'message',
      run: () => switchSession(item.id),
    }));
  items.push(...sessions);

  for (const action of ccActions()) {
    if (hit(action.title) || hit(action.sub)) items.push({ ...action, group: '动作' });
  }

  for (const nav of SETTINGS_NAV) {
    const title = `设置 · ${nav.label}`;
    if (hit(title)) {
      items.push({ group: '设置', title, sub: '打开控制中心对应的分类', icon: nav.icon, run: () => openSettings(nav.id) });
    }
  }

  for (const command of commandList) {
    const title = `/${command.name}`;
    if (hit(title) || hit(command.summary)) {
      items.push({
        group: '命令',
        title,
        sub: command.summary,
        icon: 'command',
        run: () => {
          insertComposer(`/${command.name} `);
          $('input').focus();
        },
      });
    }
  }

  for (const path of state.ccFiles ?? []) {
    const name = path.split('/').pop();
    items.push({
      group: '文件',
      title: name,
      sub: path,
      icon: 'file',
      run: () => {
        openFiles();
        void openFile(path);
      },
    });
  }

  state.ccItems = items;
  if (!items.length) {
    $('ccResults').innerHTML = '<div class="cc-empty">没有匹配结果，换个关键词试试。</div>';
    state.ccIndex = 0;
    return;
  }
  state.ccIndex = Math.max(0, Math.min(state.ccIndex, items.length - 1));
  paintCommandCenter(items);
}

function paintCommandCenter(items) {
  const box = $('ccResults');
  box.innerHTML = '';
  let group = '';
  items.forEach((item, index) => {
    if (item.group !== group) {
      group = item.group;
      const head = document.createElement('div');
      head.className = 'cc-group';
      head.textContent = group;
      box.appendChild(head);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cc-item${index === state.ccIndex ? ' is-on' : ''}`;
    button.innerHTML =
      `<span class="cc-item-icon">${svg(item.icon)}</span>` +
      `<span class="cc-item-main"><span class="cc-item-title">${escapeHtml(item.title)}</span>` +
      `${item.sub ? `<span class="cc-item-sub">${escapeHtml(item.sub)}</span>` : ''}</span>`;
    button.addEventListener('pointerenter', () => {
      if (state.ccIndex === index) return;
      state.ccIndex = index;
      box.querySelectorAll('.cc-item').forEach((node, i) => node.classList.toggle('is-on', i === index));
    });
    button.addEventListener('click', () => runCommandCenterItem(item));
    box.appendChild(button);
  });
  scrollCommandCenterActive();
}

function scrollCommandCenterActive() {
  const box = $('ccResults');
  const active = box.querySelectorAll('.cc-item')[state.ccIndex];
  active?.scrollIntoView({ block: 'nearest' });
}

function moveCommandCenter(delta) {
  if (!state.ccItems?.length) return;
  state.ccIndex = (state.ccIndex + delta + state.ccItems.length) % state.ccItems.length;
  const buttons = $('ccResults').querySelectorAll('.cc-item');
  buttons.forEach((node, index) => node.classList.toggle('is-on', index === state.ccIndex));
  scrollCommandCenterActive();
}

function runCommandCenterItem(item) {
  if (!item) return;
  closeCommandCenter();
  setTimeout(() => item.run(), 60);
}

// ---------------- 悬停提示 ----------------
function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let timer = 0;
  let target = null;

  const place = () => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - 8));
    const below = rect.bottom + 9;
    const y = below + box.height > window.innerHeight - 8 ? Math.max(8, rect.top - box.height - 9) : below;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };

  const hide = () => {
    clearTimeout(timer);
    target = null;
    tip.classList.remove('is-on');
    setTimeout(() => {
      if (!tip.classList.contains('is-on')) tip.hidden = true;
    }, 120);
  };

  document.addEventListener('pointerover', (event) => {
    const node = event.target.closest?.('[title], [data-tip]');
    if (!node) return;
    const title = node.getAttribute('title');
    if (title) {
      node.dataset.tip = title;
      // 移除原生 title 前保留可访问名称，避免 hover 一次后读屏软件失去描述。
      if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', title);
      node.removeAttribute('title');
    }
    const text = node.dataset.tip;
    if (!text) return;
    clearTimeout(timer);
    target = node;
    timer = setTimeout(() => {
      if (target !== node) return;
      tip.textContent = text;
      tip.hidden = false;
      tip.classList.remove('is-on');
      requestAnimationFrame(() => {
        place();
        tip.classList.add('is-on');
      });
    }, 380);
  });

  document.addEventListener('pointerout', (event) => {
    if (!target) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    hide();
  });

  document.addEventListener('pointerdown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}

// ---------------- 选中文本工具条 ----------------
function initSelectionTools() {
  document.addEventListener('mouseup', (event) => {
    setTimeout(() => {
      const node = event.target instanceof Element ? event.target : null;
      if (node?.closest('#terminalPanel')) {
        const tab = termActiveTab();
        const text = tab?.terminal.getSelection?.() ?? '';
        if (text.trim()) {
          showSelectionTools(event.clientX, event.clientY, [
            { label: '分析输出', run: () => { termClose(); askAboutText(text, '', 'terminal'); } },
            { label: '复制', run: () => copyText(text) },
          ]);
        } else hideSelectionTools();
        return;
      }
      const host = node?.closest('.thread, .files-code, .viewer-body');
      const text = window.getSelection()?.toString() ?? '';
      if (host && text.trim().length > 1) {
        const path = host.classList.contains('files-code') || host.classList.contains('viewer-body') ? state.preview?.path : '';
        showSelectionTools(event.clientX, event.clientY, [
          { label: '问 AI', run: () => askAboutText(text, path) },
          { label: '复制', run: () => copyText(text) },
          { label: '插入输入框', run: () => { insertComposer(text.trim()); hideSelectionTools(); } },
        ]);
      } else hideSelectionTools();
    }, 20);
  });
  document.addEventListener('selectionchange', () => {
    if (!window.getSelection()?.toString().trim() && !$('selectionTools').hidden) hideSelectionTools();
  });
}

// ---------------- 终端输出分析 ----------------
function analyzeTerminal() {
  const tab = termActiveTab();
  if (!tab) return toast('还没有打开终端');
  let text = tab.terminal.getSelection?.() ?? '';
  if (!text.trim()) {
    const buffer = tab.terminal.buffer.active;
    const lines = [];
    const start = Math.max(0, buffer.length - 180);
    for (let i = start; i < buffer.length; i += 1) lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
    text = lines.join('\n').trim();
  }
  if (!text.trim()) return toast('终端还没有输出');
  termClose();
  askAboutText(text, '', 'terminal');
}

// ---------------- 桌面窗口控制 ----------------
function initDesktop() {
  const api = window.bananaDesktop;
  if (!api) return;
  document.body.classList.add('desktop');
  if (!api.frameless) {
    // macOS 保留原生红绿灯，只启用拖动区域
    document.body.classList.add('mac-titlebar');
    return;
  }
  const controls = $('winControls');
  controls.hidden = false;
  $('winMin').innerHTML = svg('minimize');
  $('winMax').innerHTML = svg('maximize');
  $('winClose').innerHTML = svg('x');
  $('winMin').addEventListener('click', () => api.minimize());
  $('winMax').addEventListener('click', () => api.toggleMaximize());
  $('winClose').addEventListener('click', () => api.close());
  api.onMaximizeChange?.((maximized) => {
    $('winMax').innerHTML = svg(maximized ? 'restore' : 'maximize');
    $('winMax').title = maximized ? '还原' : '最大化';
  });
}

function bind() {
  $('newChat').innerHTML = svg('plus');
  $('newTab').innerHTML = svg('plus');
  $('searchBtn').innerHTML = svg('search');
  $('sendBtn').innerHTML = svg('send');
  $('closeSettings').innerHTML = svg('x');
  // 左上角保留 Banana 叶子标记；点击/ Ctrl+B 仍然打开历史会话
  $('toggleSidebar').innerHTML =
    '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M7 4.6c2.6-.4 4.9.5 6.3 2.6M12.3 7.2c1.4-2.1 3.7-3 6.3-2.6-1.1 1.6-1.2 3.1-.4 4.6.8 1.5.8 3-.1 4.5-1.1 2-3.3 3.5-5.9 4.3-2.3.7-4.7.7-7.1 0" />' +
    '<path d="M7.2 18c-1.1-2-1.2-4-.4-6 .9-2.3 2.5-3.7 4.7-4.2" />' +
    '</svg>';
  $('toggleSidebar').title = '历史会话（Ctrl+B）';
  $('attachBtn').innerHTML = svg('attach');
  $('jumpLatest').innerHTML = svg('arrowDown');
  $('attachmentClose').innerHTML = svg('x');
  $('reasoningBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleReasoningPop();
  });
  $('modeSwitch').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    const mode = button.dataset.mode;
    if (mode === state.info?.session?.mode) return;
    const hadPendingPlan = state.info?.session?.plan?.status === 'pending';
    try {
      const result = await post('session', { action: 'mode', value: mode });
      if (result?.info) state.info = result.info;
      renderHeader();
      renderTodos();
      toast(
        mode === 'plan'
          ? 'Plan 模式：只读调研，先出计划'
          : hadPendingPlan
            ? '已切到 Build，待批准计划已取消'
            : 'Build 模式：可以改文件和执行命令',
      );
    } catch (error) {
      toast('切换模式失败：' + error.message);
    }
  });
  $('modelBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleModelPop();
  });
  $('attachBtn').addEventListener('click', () => $('attachInput').click());
  $('attachInput').addEventListener('change', async () => {
    for (const file of $('attachInput').files ?? []) await attach(file);
    $('attachInput').value = '';
  });
  $('reviewClose').innerHTML = svg('x');
  $('reviewRefresh').innerHTML = svg('refresh');
  $('filesBtn').innerHTML = svg('panel');
  $('reviewBtn').innerHTML = svg('diff');
  $('pluginsBtn').innerHTML = svg('plug');
  initShell();
  initFileResize();
  bindTerminal();
  initTooltips();
  initSelectionTools();
  initDesktop();
  hydrate();
  loadTheme();

  $('newChat').addEventListener('click', () => {
    void createSession();
  });
  $('openSettings').addEventListener('click', () => openSettings());
  $('closeSettings').addEventListener('click', closeSettings);
  $('settingsSheet').addEventListener('click', (event) => {
    if (event.target === $('settingsSheet')) closeSettings();
  });
  $('settingsSheet').addEventListener('mousedown', (event) => {
    if (event.target === $('settingsSheet')) closeSettings();
  });
  $('toggleSidebar').addEventListener('click', toggleSidebar);
  $('sessionSearch').addEventListener('input', () => {
    state.sessionQuery = $('sessionSearch').value;
    renderSidebar();
  });
  $('filesBtn').addEventListener('click', toggleFiles);
  $('reviewBtn').addEventListener('click', () => {
    if (state.review.open) closeReview();
    else {
      openReview(state.review.mode || 'changes');
      if (state.review.mode === 'changes') void loadChanges(true);
    }
  });
  $('searchBtn').addEventListener('click', openCommandCenter);
  $('openSettingsFoot').addEventListener('click', () => openSettings());
  $('newTab').addEventListener('click', () => $('newChat').click());
  $('themeBtn').addEventListener('click', cycleTheme);
  $('pluginsBtn').addEventListener('click', () => openSettings('plugins'));
  $('previewWrap').addEventListener('click', toggleWrap);
  $('viewerWrap').addEventListener('click', toggleWrap);
  $('previewCopy').addEventListener('click', () => copyText(state.preview?.code ?? '', '已复制代码'));
  $('viewerCopy').addEventListener('click', () => copyText(state.preview?.code ?? '', '已复制代码'));
  $('previewCopyPath').addEventListener('click', () => copyText(state.preview?.path ?? '', '已复制路径'));
  $('viewerCopyPath').addEventListener('click', () => copyText(state.preview?.path ?? '', '已复制路径'));
  $('previewFull').addEventListener('click', openViewer);
  $('previewClose').addEventListener('click', closePreview);
  $('viewerClose').addEventListener('click', closeViewer);
  $('codeViewer').addEventListener('mousedown', (event) => {
    if (event.target === $('codeViewer')) closeViewer();
  });
  $('insertPath').addEventListener('click', () => {
    const path = $('insertPath').dataset.path;
    if (!path) return;
    const box = $('input');
    box.value = box.value.trim() ? `${box.value.trim()} @${path} ` : `@${path} `;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    toast('已插入文件引用');
  });
  $('approvalNo').addEventListener('click', () => closeApproval(false));
  $('approvalYes').addEventListener('click', () => closeApproval(true));

  $('undoBtn').addEventListener('click', async () => {
    if (state.busy) {
      toast('正在生成，先停止当前任务再撤销');
      return;
    }
    try {
      const result = await post('undo');
      const skipped = result.skipped?.length ? `，${result.skipped.length} 个文件超过 4MB 未恢复` : '';
      toast(result.had ? `已回滚：恢复 ${result.restored} 个文件${skipped}` : '没有可回滚的改动');
      state.changes = null;
      if (state.review.open && state.review.mode === 'changes') void loadChanges(true);
    } catch (error) {
      toast('撤销失败：' + (error?.message ?? error));
    }
  });

  $('composer').addEventListener('submit', (event) => { event.preventDefault(); send(); });
  $('sendBtn').addEventListener('click', () => {
    if (state.busy) stopTurn();
    else send();
  });
  $('todoSummary').addEventListener('click', () => {
    state.todoOpen = !state.todoOpen;
    $('todoDock').classList.toggle('is-open', state.todoOpen);
    $('todoSummary').setAttribute('aria-expanded', String(state.todoOpen));
  });
  $('attachmentClose').addEventListener('click', () => {
    $('attachmentViewer').hidden = true;
    syncOverlayState();
  });
  $('attachmentViewer').addEventListener('mousedown', (event) => {
    if (event.target === $('attachmentViewer')) {
      $('attachmentViewer').hidden = true;
      syncOverlayState();
    }
  });
  $('attachmentCopyPath').addEventListener('click', () => copyText(state.attachmentPath ?? '', '已复制附件路径'));
  $('jumpLatest').addEventListener('click', () => {
    setCameraFollow(true);
    $('jumpLatest').hidden = true;
    scrollToEnd(true, true);
  });
  // 让「回到最新」始终位于 composer 上方，输入框长高或被附件/任务撑开时不会压住按钮。
  const composerWrap = document.querySelector('.composer-wrap');
  if (composerWrap && window.ResizeObserver) {
    const syncJumpPosition = () => {
      $('chatCard').style.setProperty('--composer-h', `${Math.round(composerWrap.getBoundingClientRect().height)}px`);
    };
    new ResizeObserver(syncJumpPosition).observe(composerWrap);
    syncJumpPosition();
  }
  THREAD.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY < 0) {
        setCameraFollow(false);
        camera.lastUserScroll = Date.now();
        return;
      }
      const atBottom = cameraMax() - THREAD.scrollTop < 90;
      if (atBottom) {
        setCameraFollow(true);
        $('jumpLatest').hidden = true;
      }
    },
    { passive: true },
  );
  let touchY = 0;
  THREAD.addEventListener(
    'touchstart',
    (event) => {
      touchY = event.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );
  THREAD.addEventListener(
    'touchmove',
    (event) => {
      const nextY = event.touches[0]?.clientY ?? touchY;
      if (nextY > touchY + 4) {
        setCameraFollow(false);
        camera.lastUserScroll = Date.now();
      }
      touchY = nextY;
    },
    { passive: true },
  );
  // 拖动滚动条时不会触发 wheel；点中滚动条区域就暂停跟随。
  THREAD.addEventListener('pointerdown', (event) => {
    if (event.target !== THREAD) return;
    if (event.offsetX >= THREAD.clientWidth) {
      setCameraFollow(false);
      camera.lastUserScroll = Date.now();
    }
  });
  THREAD.addEventListener('scroll', () => {
    const top = THREAD.scrollTop;
    // 没有相机动画时，向上滚动（滚动条、键盘、查找）也要暂停跟随。
    if (!camera.running && top < camera.lastTop - 4) {
      setCameraFollow(false);
      camera.lastUserScroll = Date.now();
    }
    camera.lastTop = top;
    const atBottom = cameraMax() - top < 70;
    if (atBottom && !camera.follow && Date.now() - camera.lastUserScroll > 300) {
      setCameraFollow(true);
    }
    const hasMessages = Boolean(THREAD.querySelector('.msg'));
    $('jumpLatest').hidden = camera.follow || !hasMessages;
  });
  document.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (!['PageUp', 'Home', 'ArrowUp'].includes(event.key)) return;
    if (!THREAD.querySelector('.msg')) return;
    setCameraFollow(false);
    camera.lastUserScroll = Date.now();
  });
  $('input').addEventListener('input', () => {
    grow();
    const value = $('input').value;
    // / 开头 → 命令面板；结尾是 @路径 → 文件补全（服务端用 CLI 同一份逻辑）
    if (/^\/[a-zA-Z?]*$/.test(value) && commandList.length) openPalette(value);
    else if (/(^|\s)@[^\s]*$/.test(value)) requestFileComplete(value);
    else closePalette();
  });
  $('input').addEventListener('keydown', (event) => {
    if (!$('commandPalette').hidden) {
      if (event.key === 'ArrowDown') { event.preventDefault(); movePalette(1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); movePalette(-1); return; }
      if (event.key === 'Tab') {
        event.preventDefault();
        const picked = state.commandMatches?.[state.commandIndex ?? 0];
        if (picked) applyCompletion(picked);
        return;
      }
      // 文件补全面板里回车直接发送更顺手；命令面板里回车优先补全
      if (event.key === 'Enter' && !event.shiftKey && $('commandPalette').dataset.kind === 'command' && state.commandMatches?.length) {
        event.preventDefault();
        const picked = state.commandMatches[state.commandIndex ?? 0];
        if (picked) {
          applyCompletion(picked);
          renderCommandPalette(picked.item.name ?? '');
          return;
        }
      }
      if (event.key === 'Escape') { event.preventDefault(); closePalette(); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
  });

  $('ccInput').addEventListener('input', () => {
    state.ccIndex = 0;
    // 清空搜索时不要把上一次的文件结果留在列表里。
    if (!$('ccInput').value.trim()) state.ccFiles = [];
    renderCommandCenter($('ccInput').value);
    scheduleCommandFiles($('ccInput').value);
  });
  $('ccInput').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveCommandCenter(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveCommandCenter(-1); }
    else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); runCommandCenterItem(state.ccItems?.[state.ccIndex]); }
    else if (event.key === 'Escape') { event.preventDefault(); closeCommandCenter(); }
  });
  $('commandCenter').addEventListener('mousedown', (event) => {
    if (event.target === $('commandCenter')) closeCommandCenter();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && trapDialogFocus(event)) return;
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      if ($('commandCenter').hidden) openCommandCenter();
      else closeCommandCenter();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === 'b') {
      event.preventDefault();
      toggleSidebar();
      return;
    }
    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      const list = state.tabs ?? [];
      if (list.length > 1) {
        const index = list.findIndex((tab) => tab.id === state.activeTab);
        const next = list[(index + (event.shiftKey ? -1 : 1) + list.length) % list.length];
        if (next) void switchSession(next.id);
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
      const key = String(event.key).toLowerCase();
      if (key === 'f') { event.preventDefault(); openFiles(); return; }
      if (key === 'g') { event.preventDefault(); openChanges(); return; }
    }
    if (event.key === 'Escape') {
      if (!$('commandPalette').hidden) { closePalette(); return; }
      // 弹层优先：Esc 只负责关最上层，不能顺手把正在生成的回答停掉。
      if (reasoningPop) {
        event.preventDefault();
        closeReasoningPop();
        return;
      }
      if ($('modelPop')) {
        event.preventDefault();
        closeModelPop();
        $('modelBtn')?.focus();
        return;
      }
      if (document.querySelector('.popover')) {
        event.preventDefault();
        document.querySelector('.popover')?.remove();
        return;
      }
      // 终端里的 Esc 属于 shell，不要把工作台一起关掉
      const inTerminal = event.target instanceof Element && event.target.closest('#terminalPanel');
      if (inTerminal && $('settingsSheet').hidden && $('codeViewer').hidden && $('commandCenter').hidden && $('approvalModal').hidden) return;
      if (state.busy && $('commandCenter').hidden && $('settingsSheet').hidden && $('codeViewer').hidden && $('attachmentViewer').hidden && $('approvalModal').hidden) {
        event.preventDefault();
        stopTurn();
        return;
      }
      if (closeTopOverlay()) return;
      if ($('sidebar').classList.contains('open')) $('sidebar').classList.remove('open');
    }
  });

  // 窄屏下点空白处收起侧边栏（点侧边栏内部或开合按钮不算）
  document.addEventListener('click', (event) => {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    if (!$('sidebar').classList.contains('open')) return;
    if (event.target.closest('#sidebar, #toggleSidebar')) return;
    setSidebar(false);
  });

  $('input').addEventListener('paste', (event) => {
    for (const item of event.clipboardData?.files ?? []) attach(item);
  });
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    for (const item of event.dataTransfer?.files ?? []) attach(item);
  });
}

async function maybePromptProjectTrust() {
  const trust = state.info?.projectTrust;
  if (!trust || trust.status !== 'pending' || state.trustPrompted) return;
  state.trustPrompted = true;
  const parts = [
    trust.hasConfig ? '.banana 配置' : '',
    trust.hasPlugins ? '项目插件' : '',
    trust.hasAgentDoc ? 'AGENT.md' : '',
  ].filter(Boolean);
  const ok = await openAppDialog({
    title: '发现项目级配置',
    body: `这个工作区包含${parts.join('、') || '项目级文件'}。只有信任后才会加载；不信任时会被忽略。`,
    confirmLabel: '信任并加载',
    danger: false,
  });
  if (!ok) return;
  try {
    const result = await post('trust', { workspace: state.info.workspace });
    if (result?.info) state.info = result.info;
    await refresh(true);
    toast('已信任并加载项目配置');
  } catch (error) {
    toast('加载失败：' + (error?.message ?? error));
  }
}

async function boot() {
  bind();
  // 命令表来自服务端（与 CLI 同一份），拉不到也不影响对话
  try {
    const all = (await get('commands')).commands ?? [];
    // 只暴露 GUI 真正能执行的命令；否则会出现“显示成功但没生效”。
    commandList = all.filter((item) => GUI_COMMANDS.has(item.name));
  } catch {
    commandList = [];
  }
  await refresh(true);
  void maybePromptProjectTrust();
  initTabs();
  $('workspaceLabel').textContent = state.info?.workspace ?? '';
  updateHomeMode();
  try {
    const hasMessages = Boolean(state.info?.session?.messages?.length);
    if (hasMessages && localStorage.getItem(SHELL_STORAGE.dockOpen) === '1') termOpen();
  } catch {}
  grow();
  $('input').focus();
}

function updateHomeMode() {
  const card = $('chatCard');
  if (!card) return;
  const empty = !(state.info?.session?.messages?.length);
  card.classList.toggle('home-mode', empty);
  const tips = $('homeTips');
  if (tips) tips.hidden = !empty;
}

boot().catch((error) => toast('加载失败：' + error.message));