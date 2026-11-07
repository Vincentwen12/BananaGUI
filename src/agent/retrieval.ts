import type { UMessage } from '../providers/types.ts';

const DIM = 256;

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff_]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function hashTerm(term: string): number {
  let hash = 2166136261;
  for (let index = 0; index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % DIM;
}

function vector(text: string): Float64Array {
  const vec = new Float64Array(DIM);
  for (const term of terms(text)) {
    const index = hashTerm(term);
    vec[index] = (vec[index] ?? 0) + 1;
  }
  return vec;
}

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let index = 0; index < DIM; index += 1) {
    dot += a[index]! * b[index]!;
    na += a[index]! * a[index]!;
    nb += b[index]! * b[index]!;
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * 轻量本地向量检索：把文本哈希成固定维度词袋向量，用余弦相似度选历史片段。
 * 不引入向量库或外部依赖；最后几条始终保留，避免丢当前上下文。
 */
export function selectRelevant(messages: UMessage[], query: string, limit = 12): UMessage[] {
  if (messages.length <= limit) return messages;
  const queryVector = vector(query);
  const tailCount = Math.min(6, limit);
  const tailStart = Math.max(0, messages.length - tailCount);
  const scored = messages.map((message, index) => ({
    message,
    index,
    score: index >= tailStart ? 1 : cosine(queryVector, vector(message.content)),
  }));
  const tail = scored.slice(tailStart);
  const rest = scored
    .slice(0, tailStart)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, Math.max(0, limit - tail.length));
  return [...rest, ...tail].sort((a, b) => a.index - b.index).map((item) => item.message);
}
