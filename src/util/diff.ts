export type DiffLineType = 'context' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** 是否因为文件太大而降级成“粗粒度 diff”。 */
  approximate: boolean;
}

const MAX_LCS_LINES = 1200;

/** 逐行 diff。小文件走 LCS；大文件只切公共前后缀，避免 O(n*m) 卡死。 */
export function diffLines(before: string, after: string): DiffResult {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  if (beforeLines.length === 0 && afterLines.length === 0) {
    return { lines: [], added: 0, removed: 0, approximate: false };
  }

  if (beforeLines.length * afterLines.length > MAX_LCS_LINES * MAX_LCS_LINES) {
    return approximateDiff(beforeLines, afterLines);
  }

  // LCS 动态规划（行级），用 Int32Array 压缩内存
  const rows = beforeLines.length + 1;
  const cols = afterLines.length + 1;
  const table = new Int32Array(rows * cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i * cols + j] =
        beforeLines[i - 1] === afterLines[j - 1]
          ? table[(i - 1) * cols + (j - 1)]! + 1
          : Math.max(table[(i - 1) * cols + j]!, table[i * cols + (j - 1)]!);
    }
  }

  const reversed: DiffLine[] = [];
  let i = beforeLines.length;
  let j = afterLines.length;
  while (i > 0 && j > 0) {
    if (beforeLines[i - 1] === afterLines[j - 1]) {
      reversed.push({ type: 'context', text: beforeLines[i - 1]! });
      i -= 1;
      j -= 1;
    } else if (table[(i - 1) * cols + j]! >= table[i * cols + (j - 1)]!) {
      reversed.push({ type: 'remove', text: beforeLines[i - 1]! });
      i -= 1;
    } else {
      reversed.push({ type: 'add', text: afterLines[j - 1]! });
      j -= 1;
    }
  }
  while (i > 0) {
    reversed.push({ type: 'remove', text: beforeLines[i - 1]! });
    i -= 1;
  }
  while (j > 0) {
    reversed.push({ type: 'add', text: afterLines[j - 1]! });
    j -= 1;
  }

  const lines = reversed.reverse();
  return {
    lines,
    added: lines.filter((line) => line.type === 'add').length,
    removed: lines.filter((line) => line.type === 'remove').length,
    approximate: false,
  };
}

function approximateDiff(beforeLines: string[], afterLines: string[]): DiffResult {
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const contextStart = Math.max(0, prefix - 2);
  const lines: DiffLine[] = [];
  for (let index = contextStart; index < prefix; index += 1) {
    lines.push({ type: 'context', text: beforeLines[index]! });
  }

  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  for (const text of removed.slice(0, 200)) lines.push({ type: 'remove', text });
  if (removed.length > 200) lines.push({ type: 'remove', text: `…（还有 ${removed.length - 200} 行删除未展示）` });
  for (const text of added.slice(0, 200)) lines.push({ type: 'add', text });
  if (added.length > 200) lines.push({ type: 'add', text: `…（还有 ${added.length - 200} 行新增未展示）` });

  for (let offset = suffix; offset > Math.max(0, suffix - 2); offset -= 1) {
    lines.push({ type: 'context', text: beforeLines[beforeLines.length - offset]! });
  }

  return { lines, added: added.length, removed: removed.length, approximate: true };
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}

/** 渲染成带 +/- 前缀的文本；长 diff 会折叠中间的 context。 */
export function formatDiff(diff: DiffResult, options: { maxLines?: number } = {}): string {
  const maxLines = options.maxLines ?? 60;
  const lines = diff.lines;
  if (lines.length <= maxLines) {
    return lines.map(renderLine).join('\n');
  }
  // 保留开头、结尾各一半，中间折叠
  const head = Math.ceil(maxLines / 2);
  const tail = maxLines - head;
  const omitted = lines.length - maxLines;
  return [
    ...lines.slice(0, head).map(renderLine),
    `…（省略 ${omitted} 行）…`,
    ...lines.slice(lines.length - tail).map(renderLine),
  ].join('\n');
}

function renderLine(line: DiffLine): string {
  const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  return `${marker} ${line.text}`;
}

export function diffStat(diff: DiffResult): string {
  return `+${diff.added} −${diff.removed}${diff.approximate ? '（粗略）' : ''}`;
}