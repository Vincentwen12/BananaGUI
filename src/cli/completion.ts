import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { IGNORED_DIRS } from '../tools/fs.ts';

const MAX_FILES = 4000;
const MAX_SUGGESTIONS = 80;

interface Entry {
  /** 相对路径，统一用 / 分隔；目录以 / 结尾。 */
  path: string;
}

function walkSync(root: string): Entry[] {
  const entries: Entry[] = [];
  const queue: string[] = [root];
  while (queue.length && entries.length < MAX_FILES) {
    const dir = queue.shift()!;
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (item.name === '.' || item.name === '..') continue;
      if (item.name.startsWith('.') && item.name !== '.gitignore' && item.name !== '.env.example') continue;
      const full = join(dir, item.name);
      const rel = relative(root, full).split(sep).join('/');
      if (item.isDirectory()) {
        if (IGNORED_DIRS.has(item.name)) continue;
        entries.push({ path: `${rel}/` });
        queue.push(full);
      } else if (item.isFile()) {
        entries.push({ path: rel });
      }
      if (entries.length >= MAX_FILES) break;
    }
  }
  return entries;
}

/**
 * 补全 `@路径` 引用。返回 [候选列表, 被替换的片段]；没有 @ 引用时返回 null。
 * 纯同步实现，因为 readline 的 completer 是同步调用的。
 */
export function completeFileReference(
  line: string,
  workspace: string,
  options: { limit?: number } = {},
): [string[], string] | null {
  const match = /(^|\s)@([^\s]*)$/.exec(line);
  if (!match) return null;
  const prefix = match[2] ?? '';
  const limit = options.limit ?? MAX_SUGGESTIONS;
  const needle = prefix.toLowerCase();

  const scored: Array<{ path: string; score: number }> = [];
  for (const entry of walkSync(workspace)) {
    const lower = entry.path.toLowerCase();
    let score: number;
    if (lower.startsWith(needle)) score = 0;
    else if (lower.includes(needle)) score = 1;
    else if (matchesSegments(lower, needle)) score = 2;
    else continue;
    scored.push({ path: entry.path, score: score + Math.min(lower.length / 1000, 1) });
  }

  scored.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));
  const candidates = scored.slice(0, limit).map((item) => `@${item.path}`);
  return [candidates, `@${prefix}`];
}

/** 支持 `@loop` 命中 src/agent/loop.ts 这种按路径段模糊匹配。 */
function matchesSegments(path: string, needle: string): boolean {
  if (!needle) return true;
  return path.split('/').some((segment) => segment.toLowerCase().startsWith(needle));
}

/** 斜杠命令补全。 */
export function completeCommand(line: string, names: string[]): [string[], string] | null {
  if (!line.startsWith('/') || line.includes(' ')) return null;
  const stripped = line.slice(1).toLowerCase();
  const hits = names.filter((name) => name.startsWith(stripped)).map((name) => `/${name}`);
  return [hits, line];
}