export type ReasoningLevel = 'fast' | 'standard' | 'deep';

export const REASONING_LEVELS: ReasoningLevel[] = ['fast', 'standard', 'deep'];

export const REASONING_LABEL: Record<ReasoningLevel, string> = {
  fast: '快',
  standard: '标准',
  deep: '深入',
};

export const REASONING_HINT: Record<ReasoningLevel, string> = {
  fast: '低推理，响应快、消耗少',
  standard: '日常默认，速度和准确率平衡',
  deep: '高推理，更慢但更适合复杂任务',
};

/** Anthropic extended thinking 的预算（token）。 */
export const REASONING_BUDGET: Record<ReasoningLevel, number> = {
  fast: 2048,
  standard: 8192,
  deep: 24576,
};

const EFFORT: Record<ReasoningLevel, 'low' | 'medium' | 'high'> = {
  fast: 'low',
  standard: 'medium',
  deep: 'high',
};

/**
 * 哪些模型支持显式思考强度。宁可保守：不支持的模型不传未知字段，
 * 避免部分 OpenAI 兼容网关直接 400。
 */
export function supportsReasoning(name: string, protocol: 'openai' | 'anthropic', model: string): boolean {
  const id = model.toLowerCase();
  if (protocol === 'anthropic') {
    return /claude-(3[.-]7|sonnet-4|opus-4|haiku-4|4)/.test(id);
  }
  if (/^(o[1-9]|gpt-5)/.test(id)) return true;
  if (name === 'deepseek' || id.includes('deepseek')) return true;
  if (name === 'qwen' || /qwen3|qwq|thinking/.test(id)) return true;
  if (id.includes('reasoner')) return true;
  return false;
}

export function effortFor(level: ReasoningLevel): 'low' | 'medium' | 'high' {
  return EFFORT[level];
}

/** 给 OpenAI 兼容协议挑字段；不支持时返回空对象。 */
export function openAIReasoningBody(
  name: string,
  protocol: 'openai' | 'anthropic',
  model: string,
  level: ReasoningLevel,
): Record<string, unknown> {
  if (!supportsReasoning(name, protocol, model)) return {};
  const id = model.toLowerCase();
  if (/^(o[1-9]|gpt-5)/.test(id)) return { reasoning_effort: effortFor(level) };
  if (name === 'deepseek' || id.includes('deepseek')) {
    return {
      thinking: { type: level === 'fast' ? 'disabled' : 'enabled' },
      ...(level === 'fast' ? {} : { reasoning_effort: effortFor(level) }),
    };
  }
  if (name === 'qwen' || /qwen3|qwq|thinking/.test(id)) {
    return level === 'fast'
      ? { enable_thinking: false }
      : { enable_thinking: true, thinking_budget: REASONING_BUDGET[level] };
  }
  return { reasoning_effort: effortFor(level) };
}
