import { providerApiKey, type AppConfig, type ProviderConfig } from '../config/config.ts';

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderModels {
  name: string;
  label: string;
  models: ModelOption[];
  source: 'live' | 'fallback';
}

const LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot / Kimi',
  qwen: 'Qwen',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};

const FALLBACK: Record<string, string[]> = {
  openai: ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-astra', 'gpt-6-sol'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  moonshot: ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k3', 'kimi-k2.7-code'],
  qwen: ['qwen4-max', 'qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-flash', 'qwen3.7-max', 'qwen-plus'],
  gemini: ['gemini-4-neon', 'gemini-4-carbon', 'gemini-4-hydrogen', 'gemini-4-argon', 'gemini-3.8-flash'],
  openrouter: ['openai/gpt-6.2-sol', 'anthropic/claude-sonnet-4.5', 'deepseek/deepseek-v4.1-flash', 'google/gemini-4-hydrogen'],
  ollama: ['llama3.1'],
};

const DENY =
  /(embed|embedding|tts|whisper|transcri|audio|speech|image|dall-e|moderation|rerank|realtime|sora|veo|imagen|guard|clip|omni-.*(image|video))/i;

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; models: ModelOption[] }>();

function localBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl);
}

const NAME_OVERRIDES: Record<string, string> = {
  'deepseek-flash': 'DeepSeek V4.1 Flash 1017',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'gpt-6.2-astra': 'GPT-6.2 Astra',
  'gpt-6.2-sol': 'GPT-6.2 Sol',
  'gpt-6.1-terra': 'GPT-6.1 Terra',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-sol': 'GPT-6 Sol',
  'gemini-4-neon': 'Gemini 4 Neon',
  'gemini-4-carbon': 'Gemini 4 Carbon',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'kimi-k3.1-pro': 'Kimi K3.1 Pro',
  'kimi-k3.1-pro-highspeed': 'Kimi K3.1 Pro Highspeed',
  'kimi-k3': 'Kimi K3',
  'qwen4-max': 'Qwen4 Max',
  'qwen3.8-max': 'Qwen3.8 Max',
  'qwen3.8-max-0902': 'Qwen3.8 Max 0902',
  'qwen3.8-flash': 'Qwen3.8 Flash',
  'qwen-plus': 'Qwen Plus',
};

function cleanLabel(id: string): string {
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id]!;
  return id
    .replace(/:free$/, '')
    .split('/')
    .pop()!
    .replace(/[-_]/g, ' ')
    .replace(/\b(\w)/g, (char) => char.toUpperCase());
}

function toOption(id: string): ModelOption {
  return { id, label: cleanLabel(id) };
}

function fallback(name: string): ModelOption[] {
  return (FALLBACK[name] ?? []).map(toOption);
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function pickModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const list = Array.isArray(record['data'])
    ? record['data']
    : Array.isArray(record['models'])
      ? record['models']
      : Array.isArray(payload)
        ? payload
        : [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      ids.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const id = entry['id'] ?? entry['name'] ?? entry['model'];
    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  return ids;
}

async function fetchOpenAI(name: string, provider: ProviderConfig, key: string): Promise<ModelOption[]> {
  const base = provider.baseUrl.replace(/\/+$/, '');
  const payload = await fetchJson(`${base}/models`, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
  });
  return pickModels(payload)
    .filter((id) => !DENY.test(id))
    .slice(0, 200)
    .map(toOption);
}

async function fetchAnthropic(provider: ProviderConfig, key: string): Promise<ModelOption[]> {
  const base = provider.baseUrl.replace(/\/+$/, '');
  const root = /\/v1$/.test(base) ? base : `${base}/v1`;
  const payload = await fetchJson(`${root}/models?limit=100`, {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      accept: 'application/json',
    },
  });
  return pickModels(payload).filter((id) => !DENY.test(id)).map(toOption);
}

async function fetchGemini(provider: ProviderConfig, key: string): Promise<ModelOption[]> {
  const base = provider.baseUrl.replace(/\/+$/, '').replace(/\/openai$/, '');
  const payload = await fetchJson(`${base}/models?key=${encodeURIComponent(key)}&pageSize=200`, {
    headers: { accept: 'application/json' },
  });
  return pickModels(payload)
    .map((id) => id.replace(/^models\//, ''))
    .filter((id) => !DENY.test(id) && /^gemini/i.test(id))
    .map(toOption);
}

async function discoverOne(name: string, provider: ProviderConfig, key: string | undefined): Promise<ModelOption[]> {
  const local = localBaseUrl(provider.baseUrl);
  if (!key && !local) return [];
  if (name === 'gemini') return fetchGemini(provider, key!);
  if (name === 'anthropic' || provider.protocol === 'anthropic') return fetchAnthropic(provider, key!);
  return fetchOpenAI(name, provider, key ?? 'local');
}

export async function discoverModels(config: AppConfig, force = false): Promise<ProviderModels[]> {
  if (force) cache.clear();
  const out: ProviderModels[] = [];
  for (const [name, provider] of Object.entries(config.providers)) {
    const key = providerApiKey(name, provider);
    const local = localBaseUrl(provider.baseUrl);
    if (!key && !local) continue;
    const cacheKey = `${name}:${provider.baseUrl}:${provider.model}`;
    const hit = cache.get(cacheKey);
    let models: ModelOption[] | null = null;
    if (hit && Date.now() - hit.at < TTL_MS) models = hit.models;
    if (!models) {
      try {
        const live = await discoverOne(name, provider, key);
        if (live.length) {
          models = live;
          cache.set(cacheKey, { at: Date.now(), models: live });
        }
      } catch {
        // 动态获取失败时用兜底列表
      }
    }
    const source = models ? 'live' : 'fallback';
    // 本地 Ollama 没启动时不展示兜底模型，避免出现不存在的选项。
    if (local && !models) continue;
    const list = models ?? fallback(name);
    if (!list.length) continue;
    // 当前模型即使不在列表里也要能选回去
    const withCurrent = list.some((item) => item.id === provider.model)
      ? list
      : [toOption(provider.model), ...list];
    out.push({
      name,
      label: LABELS[name] ?? name,
      models: withCurrent,
      source,
    });
  }
  return out;
}
