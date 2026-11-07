import type { UMessage } from '../providers/types.ts';

/**
 * 轻量相关性检索：不引入向量库，用词重叠给历史消息打分。
 * 永远保留最后几条，避免丢掉当前上下文。
 */
export function selectRelevant(messages: UMessage[], query: string, limit = 12): UMessage[] {
  if (messages.length <= limit) return messages;
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff_]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const scored = messages.map((message, index) => {
    const lower = message.content.toLowerCase();
    let score = 0;
    for (const term of terms) if (lower.includes(term)) score += 1;
    return { message, index, score };
  });
  const tailStart = Math.max(0, messages.length - Math.min(6, limit));
  const tail = scored.slice(tailStart);
  const rest = scored
    .slice(0, tailStart)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, Math.max(0, limit - tail.length));
  return [...rest, ...tail].sort((a, b) => a.index - b.index).map((item) => item.message);
}
