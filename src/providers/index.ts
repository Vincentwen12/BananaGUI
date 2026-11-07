import type { AppConfig } from '../config/config.ts';
import { resolveProvider } from '../config/config.ts';
import { createAnthropicProvider } from './anthropic.ts';
import { createOpenAIProvider } from './openai.ts';
import type { Provider } from './types.ts';

export * from './types.ts';

export function createProvider(name: string, config: AppConfig): Provider {
  const resolved = resolveProvider(name, config);
  if (resolved.needsKey) {
    const env = resolved.config.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
    throw new Error(
      `provider "${name}" 缺少 API key。请设置环境变量 ${env}，或在 ${'~/.banana/config.json'} 里写 apiKey。`,
    );
  }
  if (resolved.config.protocol === 'anthropic') {
    return createAnthropicProvider({ name, config: resolved.config, apiKey: resolved.apiKey });
  }
  return createOpenAIProvider({ name, config: resolved.config, apiKey: resolved.apiKey });
}