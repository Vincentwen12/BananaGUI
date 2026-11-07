import type { SearchConfig } from '../config/config.ts';
import { type Tool, type ToolContext, type ToolResult, fail, ok } from './types.ts';

const DEFAULT_TIMEOUT_MS = 30_000;
const SEARCH_TIMEOUT_MS = 20_000;
const DEEP_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type Freshness = 'day' | 'week' | 'month' | 'year';
type Language = 'en' | 'zh';

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

interface SearchOptions {
  freshness?: Freshness;
  site?: string;
  language: Language;
  deep: boolean;
}

interface EngineResult {
  engine: string;
  hits: SearchHit[];
}

/** 统一带超时的 fetch：外部取消、单次请求超时都能及时停下。 */
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit,
  ctx: ToolContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  if (ctx.signal.aborted) controller.abort();
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  ctx: ToolContext,
): Promise<string> {
  const response = await fetchWithTimeout(url, init, ctx, init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** 把网页正文转成可读文本：保留段落，去掉导航、页脚、脚本等噪声。 */
export function extractMainText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|canvas|template|iframe|nav|footer|header|aside|form)[^>]*>[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|main|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // 优先只取 article/main，避免整页导航把正文淹没；太短就退回全文。
  const article = /<article[^>]*>[\s\S]*?<\/article>/i.exec(html)?.[0] ?? /<main[^>]*>[\s\S]*?<\/main>/i.exec(html)?.[0];
  const candidate =
    article && stripTags(article).length >= 300
      ? article
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<(script|style|noscript|svg|canvas|template|iframe|nav|footer|header|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|li|h[1-6]|section|article|blockquote|pre)>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
      : withoutNoise;

  const lines = decodeEntities(candidate)
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 1);

  // 连续重复的行（菜单、面包屑）只留一次。
  const out: string[] = [];
  for (const line of lines) {
    if (out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function unwrapDuckDuckGo(href: string): string {
  if (href.startsWith('//')) href = `https:${href}`;
  const match = /[?&]uddg=([^&]+)/.exec(href);
  if (!match) return href;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return href;
  }
}

/** Tavily 支持时间范围；免费源不支持时就算了，不让它影响主流程。 */
function tavilyTimeRange(freshness?: Freshness): string | undefined {
  return freshness;
}

function braveFreshness(freshness?: Freshness): string | undefined {
  return freshness === 'day' ? 'pd' : freshness === 'week' ? 'pw' : freshness === 'month' ? 'pm' : freshness === 'year' ? 'py' : undefined;
}

function languageHeader(language: Language): string {
  return language === 'zh' ? 'zh-CN,zh;q=0.9,en;q=0.7' : 'en-US,en;q=0.9,zh-CN;q=0.5';
}

function scopedQuery(query: string, site?: string): string {
  const host = site?.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return query;
  return `${query} site:${host}`;
}

async function searchTavily(
  query: string,
  count: number,
  ctx: ToolContext,
  apiKey: string,
  options: SearchOptions,
): Promise<SearchHit[]> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query: scopedQuery(query, options.site),
    max_results: count,
    search_depth: options.deep ? 'advanced' : 'basic',
    include_answer: false,
    include_raw_content: false,
  };
  const timeRange = tavilyTimeRange(options.freshness);
  if (timeRange) body.time_range = timeRange;

  const response = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    ctx,
    SEARCH_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);
  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (payload.results ?? []).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: (item.content ?? '').slice(0, 500),
  }));
}

async function searchBrave(
  query: string,
  count: number,
  ctx: ToolContext,
  apiKey: string,
  options: SearchOptions,
): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    q: scopedQuery(query, options.site),
    count: String(Math.min(Math.max(count, 1), 20)),
    search_lang: options.language === 'zh' ? 'zh-hans' : 'en',
    ui_lang: options.language === 'zh' ? 'zh-CN' : 'en-US',
  });
  const freshness = braveFreshness(options.freshness);
  if (freshness) params.set('freshness', freshness);

  const response = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
    {
      headers: {
        'x-subscription-token': apiKey,
        accept: 'application/json',
        'accept-language': languageHeader(options.language),
      },
    },
    ctx,
    SEARCH_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Brave HTTP ${response.status}`);
  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (payload.web?.results ?? []).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: stripTags(item.description ?? '').slice(0, 500),
  }));
}

async function searchBing(query: string, count: number, ctx: ToolContext, options: SearchOptions): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    q: scopedQuery(query, options.site),
    count: String(Math.min(Math.max(count, 1), 20)),
    setlang: options.language === 'zh' ? 'zh-hans' : 'en',
    cc: options.language === 'zh' ? 'cn' : 'us',
  });
  const html = await fetchText(
    `https://www.bing.com/search?${params.toString()}`,
    {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': languageHeader(options.language),
      },
      timeoutMs: SEARCH_TIMEOUT_MS,
    },
    ctx,
  );
  return parseBing(html, count);
}

/** Bing 有时把结果包成 /ck/a?...&u=a1<base64> 的跳转链接，这里还原成真实地址。 */
export function unwrapBing(href: string): string {
  if (!/bing\.com\/ck\/a/i.test(href)) return href;
  try {
    const raw = new URL(href).searchParams.get('u');
    if (!raw || !raw.startsWith('a1')) return href;
    const base64 = raw.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return /^https?:/i.test(decoded) ? decoded : href;
  } catch {
    return href;
  }
}

export function parseBing(html: string, count: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const block of html.matchAll(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<\/li>/gi)) {
    const item = block[0];
    const link = item.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = unwrapBing(decodeEntities(link[1] ?? ''));
    if (!/^https?:/i.test(url)) continue;
    const snippet = item.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    hits.push({
      title: decodeEntities(stripTags(link[2] ?? '')).trim(),
      url,
      snippet: decodeEntities(stripTags(snippet?.[1] ?? '')).trim().slice(0, 500),
    });
    if (hits.length >= count) break;
  }
  return hits;
}

export function parseDuckDuckGo(html: string, count: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const linkRegex =
    /<a[^>]*class="[^"]*(?:result__a|result-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<(?:a|td)[^>]*class="[^"]*(?:result__snippet|result-snippet)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td)>/gi;
  const snippets = [...html.matchAll(snippetRegex)].map((match) => stripTags(match[1] ?? ''));

  for (const match of html.matchAll(linkRegex)) {
    const href = decodeEntities(match[1] ?? '');
    const title = stripTags(match[2] ?? '');
    const url = unwrapDuckDuckGo(href);
    if (!/^https?:/i.test(url)) continue;
    hits.push({ title, url, snippet: snippets[hits.length] ?? '' });
    if (hits.length >= count) break;
  }
  return hits;
}

async function searchDuckDuckGo(query: string, count: number, ctx: ToolContext, options: SearchOptions): Promise<SearchHit[]> {
  const errors: string[] = [];
  const scoped = scopedQuery(query, options.site);
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(scoped)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(scoped)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const html = await fetchText(
        endpoint,
        {
          headers: { 'user-agent': USER_AGENT, accept: 'text/html', 'accept-language': languageHeader(options.language) },
          timeoutMs: SEARCH_TIMEOUT_MS,
        },
        ctx,
      );
      const hits = parseDuckDuckGo(html, count);
      if (hits.length) return hits;
      errors.push(`${new URL(endpoint).hostname} 未返回结果`);
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${(error as Error).message}`);
    }
  }
  throw new Error(`DuckDuckGo 搜索失败 (${errors.join('; ')})`);
}

/** 归一化 URL：忽略大小写、www. 前缀、末尾斜杠和 #hash，用来去重。 */
export function normalizeUrl(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}${url.search}`;
  } catch {
    return href.trim();
  }
}

/** 搜索结果清洗：去掉站内跳转、重复链接和空条目。 */
export function sanitizeHits(hits: SearchHit[], count: number): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of hits) {
    const url = (hit.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    // 搜索引擎自己的搜索页 / 跳转页不是结果
    if (/^https?:\/\/([^/]*\.)?(bing|duckduckgo|google|baidu)\.(com|cn)\//i.test(url) && /\/(search|ck\/a|url|link)\b/i.test(url)) continue;
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: (hit.title ?? '').trim() || url,
      url,
      snippet: (hit.snippet ?? '').trim().slice(0, 500),
    });
    if (out.length >= count) break;
  }
  return out;
}

const TECH_HOSTS = [
  /(^|\.)github\.com$/i,
  /(^|\.)github\.io$/i,
  /(^|\.)stackoverflow\.com$/i,
  /(^|\.)stackexchange\.com$/i,
  /(^|\.)developer\.mozilla\.org$/i,
  /(^|\.)npmjs\.com$/i,
  /(^|\.)pypi\.org$/i,
  /(^|\.)readthedocs\.io$/i,
  /(^|\.)rust-lang\.org$/i,
  /(^|\.)python\.org$/i,
  /(^|\.)nodejs\.org$/i,
  /(^|\.)go\.dev$/i,
  /(^|\.)w3\.org$/i,
  /(^|\.)ietf\.org$/i,
  /docs?\./i,
];

export function isTechSource(href: string): boolean {
  try {
    const host = new URL(href).hostname;
    return TECH_HOSTS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

/**
 * 合并多个搜索引擎的结果：相同链接只保留一次，按“在两个引擎里都靠前”排序。
 * 技术/官方文档来源给一个很小的加分，只在分数接近时起作用。
 */
export function mergeSearchHits(lists: SearchHit[][], count: number): SearchHit[] {
  const merged = new Map<string, { hit: SearchHit; score: number; order: number }>();
  let order = 0;
  lists.forEach((list) => {
    list.forEach((hit, rank) => {
      if (!/^https?:\/\//i.test(hit.url ?? '')) return;
      const key = normalizeUrl(hit.url);
      const base = 1 / (rank + 1);
      const score = base + (isTechSource(hit.url) ? 0.015 : 0);
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, { hit: { ...hit }, score, order: order++ });
      } else {
        previous.score += base;
        if ((hit.snippet?.length ?? 0) > (previous.hit.snippet?.length ?? 0)) {
          previous.hit.snippet = hit.snippet;
        }
        if (!previous.hit.title && hit.title) previous.hit.title = hit.title;
      }
    });
  });
  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map((item) => item.hit);
}

async function searchFree(
  query: string,
  count: number,
  ctx: ToolContext,
  options: SearchOptions,
): Promise<EngineResult[]> {
  const settled = await Promise.allSettled([
    searchBing(query, count, ctx, options),
    searchDuckDuckGo(query, count, ctx, options),
  ]);
  const results: EngineResult[] = [];
  const problems: string[] = [];
  for (const [index, item] of settled.entries()) {
    const engine = index === 0 ? 'Bing' : 'DuckDuckGo';
    if (item.status === 'fulfilled' && item.value.length) {
      results.push({ engine, hits: item.value });
    } else if (item.status === 'rejected') {
      problems.push(`${engine}: ${(item.reason as Error)?.message ?? item.reason}`);
    } else {
      problems.push(`${engine}: 没有结果`);
    }
  }
  if (!results.length) {
    throw new Error(`免费搜索源都不可用 (${problems.join('; ')})`);
  }
  if (problems.length) ctx.log(`部分搜索源不可用: ${problems.join('; ')}`);
  return results;
}

async function fetchPageExcerpt(hit: SearchHit, maxChars: number, ctx: ToolContext): Promise<string> {
  const response = await fetchWithTimeout(
    hit.url,
    {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.8,zh-CN;q=0.5',
      },
      redirect: 'follow',
    },
    ctx,
    DEEP_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 8_000_000) throw new Error('页面太大，跳过正文抓取');
  if (contentType && !/html|text|json|xml/i.test(contentType)) {
    throw new Error(`不支持的内容类型 ${contentType.split(';')[0]}`);
  }

  const body = await response.text();
  const text = /html/i.test(contentType) || /^\s*<(?:!doctype|html)/i.test(body.slice(0, 200))
    ? extractMainText(body)
    : body.trim();
  if (!text) throw new Error('正文为空');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[正文已截断，原长 ${text.length} 字符]` : text;
}

async function attachDeepContent(
  hits: SearchHit[],
  search: SearchConfig,
  ctx: ToolContext,
): Promise<{ hits: SearchHit[]; excerpts: string[]; failed: number }> {
  const pages = Math.min(Math.max(Number(search.deepPages) || 3, 1), 5);
  const selected = hits.slice(0, pages);
  const settled = await Promise.allSettled(
    selected.map((hit) => fetchPageExcerpt(hit, 3500, ctx)),
  );
  const excerpts: string[] = [];
  let failed = 0;
  for (const item of settled) {
    if (item.status === 'fulfilled') excerpts.push(item.value);
    else {
      failed += 1;
      excerpts.push('');
    }
  }
  return { hits, excerpts, failed };
}

function pickSettings(ctx: ToolContext): SearchConfig {
  return (
    ctx.search ?? {
      provider: 'auto',
      deep: false,
      deepPages: 3,
      language: 'en',
    }
  );
}

function searchKey(configured: string | undefined, envNames: string[]): string | undefined {
  const own = configured?.trim();
  if (own) return own;
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description: [
    '联网搜索，返回标题、链接和摘要。',
    '默认优先英文/技术源，并同时合并 Bing 与 DuckDuckGo 的结果；配置 TAVILY_API_KEY / BRAVE_API_KEY 会自动升级到搜索 API。',
    'depth=deep 时会自动读取前几页正文，适合查文档、对比方案；日常事实核对用默认的 quick 即可。',
    '搜不到就换关键词再试，别靠猜。',
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      count: { type: 'number', description: '返回结果数量，默认 5，最大 20' },
      site: { type: 'string', description: '只搜某个站点，例如 github.com 或 docs.python.org' },
      freshness: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: '只看最近一段时间的结果，可选',
      },
      depth: {
        type: 'string',
        enum: ['quick', 'deep'],
        description: 'deep 会抓取前几页正文；不传则跟随设置里的深度搜索开关',
      },
      language: {
        type: 'string',
        enum: ['en', 'zh', 'auto'],
        description: '结果语言偏好，默认跟随设置（英文/技术优先）',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  approval: 'network',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    const query = String(input.query ?? '').trim();
    if (!query) return fail('query 不能为空。');
    const count = Math.min(Math.max(Number(input.count) || 5, 1), 20);
    const settings = pickSettings(ctx);
    const languageSetting = input.language === 'zh' || input.language === 'en' || input.language === 'auto'
      ? input.language
      : settings.language;
    const language: Language =
      languageSetting === 'auto'
        ? /[\u4e00-\u9fff]/.test(query) ? 'zh' : 'en'
        : languageSetting === 'zh' ? 'zh' : 'en';
    const options: SearchOptions = {
      freshness: ['day', 'week', 'month', 'year'].includes(String(input.freshness)) ? input.freshness as Freshness : undefined,
      site: typeof input.site === 'string' ? input.site : undefined,
      language,
      deep: input.depth === 'deep' || (input.depth !== 'quick' && Boolean(settings.deep)),
    };

    const tavilyKey = searchKey(settings.tavilyKey, ['TAVILY_API_KEY', 'BANANA_TAVILY_KEY']);
    const braveKey = searchKey(settings.braveKey, ['BRAVE_API_KEY', 'BANANA_BRAVE_KEY']);
    const provider = settings.provider ?? 'auto';

    if (provider === 'tavily' && !tavilyKey) {
      return fail('已选择 Tavily，但没有配置 Key。请在设置 → 联网搜索里填写，或设置 TAVILY_API_KEY。');
    }
    if (provider === 'brave' && !braveKey) {
      return fail('已选择 Brave，但没有配置 Key。请在设置 → 联网搜索里填写，或设置 BRAVE_API_KEY。');
    }

    try {
      const engines: EngineResult[] = [];
      const problems: string[] = [];

      const tryApi = async (name: 'Tavily' | 'Brave'): Promise<void> => {
        try {
          const hits =
            name === 'Tavily'
              ? await searchTavily(query, count, ctx, tavilyKey!, options)
              : await searchBrave(query, count, ctx, braveKey!, options);
          if (hits.length) engines.push({ engine: name, hits });
          else problems.push(`${name}: 没有结果`);
        } catch (error) {
          problems.push(`${name}: ${(error as Error).message}`);
        }
      };

      if (provider === 'tavily' || (provider === 'auto' && tavilyKey)) await tryApi('Tavily');
      if (!engines.length && (provider === 'brave' || (provider === 'auto' && braveKey))) await tryApi('Brave');
      if (!engines.length && (provider === 'free' || provider === 'auto')) {
        try {
          engines.push(...(await searchFree(query, count, ctx, options)));
        } catch (error) {
          problems.push((error as Error).message);
        }
      }

      if (!engines.length) {
        return fail(`搜索失败: ${problems.join('; ') || '没有可用的搜索源'}`);
      }
      if (problems.length) ctx.log(`搜索降级: ${problems.join('; ')}`);

      let hits = sanitizeHits(
        mergeSearchHits(engines.map((item) => item.hits), count),
        count,
      );
      // 关键词可能太窄：去掉引号之类的修饰再试一次，只限免费源。
      if (!hits.length && provider !== 'tavily' && provider !== 'brave') {
        const simplified = query.replace(/["'“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
        if (simplified && simplified !== query) {
          try {
            const retry = await searchFree(simplified, count, ctx, options);
            hits = sanitizeHits(mergeSearchHits(retry.map((item) => item.hits), count), count);
          } catch {
            /* 第一次的失败信息已经足够 */
          }
        }
      }
      if (!hits.length) return fail(`没有找到 "${query}" 的结果，换个关键词试试。`);

      let excerpts: string[] = [];
      let failedPages = 0;
      if (options.deep) {
        const deep = await attachDeepContent(hits, settings, ctx);
        excerpts = deep.excerpts;
        failedPages = deep.failed;
      }

      const engineNames = [...new Set(engines.map((item) => item.engine))].join(' + ');
      const body = hits
        .map((hit, index) => {
          const lines = [`[${index + 1}] ${hit.title}`, `    ${hit.url}`, `    ${hit.snippet}`];
          const excerpt = excerpts[index];
          if (excerpt) lines.push(`    --- 正文摘录 ---\n${excerpt.replace(/^/gm, '    ')}`);
          return lines.join('\n');
        })
        .join('\n');
      const mode = options.deep ? ` · 深度 ${hits.slice(0, Math.min(hits.length, Math.max(1, Number(settings.deepPages) || 3))).length} 页${failedPages ? `（${failedPages} 页失败）` : ''}` : '';
      const footer = options.deep && failedPages ? `\n\n注：有 ${failedPages} 个页面正文没取到，以摘要为准。` : '';
      return ok(
        `搜索 "${query}" 的结果（${engineNames}${language === 'zh' ? ' · 中文优先' : ' · 英文/技术优先'}${mode}）:\n${body}${footer}`,
        `web_search: ${hits.length} 条结果${options.deep ? ' · 深度搜索' : ''}`,
      );
    } catch (error) {
      return fail(`搜索失败: ${(error as Error).message}`);
    }
  },
};

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: '抓取一个 URL 的内容并转成纯文本（HTML 会去导航、脚本，保留正文段落）。适合读文档、issue、API 说明。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要抓取的 http/https 地址' },
      max_chars: { type: 'number', description: '最多返回多少字符，默认 20000' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  approval: 'network',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    let url: URL;
    try {
      url = new URL(String(input.url));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return fail(`只支持 http/https 协议，收到 ${url.protocol}`);
      }
    } catch {
      return fail(`无效的 URL: ${String(input.url)}`);
    }

    const maxChars = Math.min(Math.max(Number(input.max_chars) || 20_000, 200), 200_000);
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
            'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.5',
          },
          redirect: 'follow',
        },
        ctx,
      );
      if (!response.ok) return fail(`HTTP ${response.status} ${response.statusText} (${url.href})`);

      const contentType = response.headers.get('content-type') ?? '';
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > 12_000_000) return fail(`页面太大（${Math.round(length / 1_000_000)} MB），不读取。`);
      const body = await response.text();
      const text = /html/i.test(contentType) || /^\s*<(?:!doctype|html)/i.test(body.slice(0, 200))
        ? extractMainText(body)
        : body;
      const clipped =
        text.length > maxChars ? `${text.slice(0, maxChars)}\n...[内容被截断，共 ${text.length} 字符]` : text;
      const header = `# ${url.href}\n# content-type: ${contentType || 'unknown'} | ${body.length} 字节\n`;
      return ok(`${header}\n${clipped || '(空内容)'}`, `fetch ${url.host}`);
    } catch (error) {
      const message = (error as Error).message;
      if (/abort/i.test(message)) return fail('抓取超时或被取消。');
      return fail(`抓取失败: ${message}`);
    }
  },
};

export const webTools: Tool[] = [webSearchTool, webFetchTool];
