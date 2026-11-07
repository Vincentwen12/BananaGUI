export interface Pricing {
  /** 美元 / 百万 input tokens */
  input: number;
  /** 美元 / 百万 output tokens */
  output: number;
}

/**
 * 内置价目表（美元 / 百万 token，取公开列表价，仅用于估算）。
 * 价格会变，也可以在 provider 配置里用 pricing 覆盖。
 */
const TABLE: Array<[RegExp, Pricing]> = [
  [/claude.*opus/i, { input: 15, output: 75 }],
  [/claude.*sonnet/i, { input: 3, output: 15 }],
  [/claude.*haiku/i, { input: 0.8, output: 4 }],
  [/gpt-4o-mini/i, { input: 0.15, output: 0.6 }],
  [/gpt-4o/i, { input: 2.5, output: 10 }],
  [/gpt-4\.1-mini/i, { input: 0.4, output: 1.6 }],
  [/gpt-4\.1/i, { input: 2, output: 8 }],
  [/gpt-5-mini/i, { input: 0.25, output: 2 }],
  [/gpt-5/i, { input: 1.25, output: 10 }],
  [/o4-mini/i, { input: 1.1, output: 4.4 }],
  [/deepseek-reasoner/i, { input: 0.55, output: 2.19 }],
  [/deepseek-chat/i, { input: 0.27, output: 1.1 }],
  [/qwen-plus/i, { input: 0.4, output: 1.2 }],
  [/qwen-max/i, { input: 1.6, output: 6.4 }],
  [/moonshot-v1-128k/i, { input: 1.68, output: 1.68 }],
  [/moonshot|kimi/i, { input: 0.6, output: 2.4 }],
  [/gemini-2\.0-flash/i, { input: 0.1, output: 0.4 }],
  [/gemini-2\.5-pro/i, { input: 1.25, output: 10 }],
  [/llama|mistral|qwen2\.5-coder|ollama/i, { input: 0, output: 0 }],
];

export function resolvePricing(model: string, override?: Pricing): Pricing | undefined {
  if (override) return override;
  for (const [pattern, pricing] of TABLE) {
    if (pattern.test(model)) return pricing;
  }
  return undefined;
}

/** 0.00042 -> "≈$0.0004"，小于 0.0001 时保留更多位。 */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '≈$0';
  if (usd < 0.0001) return `≈$${usd.toFixed(6)}`;
  if (usd < 0.01) return `≈$${usd.toFixed(4)}`;
  if (usd < 1) return `≈$${usd.toFixed(3)}`;
  return `≈$${usd.toFixed(2)}`;
}

export function estimateCost(usage: { inputTokens?: number; outputTokens?: number }, pricing?: Pricing): number {
  if (!pricing) return 0;
  return ((usage.inputTokens ?? 0) * pricing.input + (usage.outputTokens ?? 0) * pricing.output) / 1_000_000;
}