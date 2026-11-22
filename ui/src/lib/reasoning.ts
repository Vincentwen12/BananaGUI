/** Pure helpers for reasoning summaries and labels. */

export function stripReasoningSignature(text: string): string {
  const value = String(text ?? '');
  if (!value || value[0] !== '<') return value;
  const opening = '<signature>';
  if (opening.startsWith(value)) return '';
  if (!value.startsWith(opening)) return value;
  const closing = '</signature>';
  const end = value.indexOf(closing, opening.length);
  if (end === -1) return '';
  let start = end + closing.length;
  while (start < value.length) {
    if (value[start] === '\n') start += 1;
    else if (value[start] === '\r' && value[start + 1] === '\n') start += 2;
    else break;
  }
  return value.slice(start);
}

export function firstLine(text: string): string {
  const value = String(text ?? '');
  const newline = value.indexOf('\n');
  return (newline === -1 ? value : value.slice(0, newline)).trim();
}

/** The first line of the latest completed paragraph; used while streaming. */
export function latestCompletedParagraphFirstLine(text: string): string {
  const value = String(text ?? '');
  let summary = '';
  let paragraphStart = 0;
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
  while (true) {
    const next = separator.exec(value);
    const paragraphEnd = next === null ? value.length : next.index + next[0].indexOf('\n');
    const newline = value.indexOf('\n', paragraphStart);
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = value.slice(paragraphStart, newline).trim();
      if (candidate) summary = candidate;
    }
    if (next === null) return summary;
    paragraphStart = next.index + next[0].length;
  }
}

export function summaryOf(text: string, running: boolean): string {
  const clean = stripReasoningSignature(String(text ?? ''));
  const raw = running ? latestCompletedParagraphFirstLine(clean) : firstLine(clean);
  return raw.replaceAll('**', '');
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒` : `${minutes} 分`;
}

export function processLabel(status: string, durationMs?: number): string {
  if (status === 'running') return '分析中…';
  if (status === 'stopped') return '已停止';
  if (status === 'error') return '分析失败';
  const duration = durationMs ? formatDuration(durationMs) : '';
  return duration ? `已完成分析 · 用时 ${duration}` : '已完成分析';
}

export function processStatusFromStop(stopReason: string): 'stopped' | 'error' | 'done' {
  if (stopReason === 'aborted') return 'stopped';
  if (stopReason === 'error') return 'error';
  return 'done';
}
