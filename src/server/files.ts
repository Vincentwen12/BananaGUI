import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { IGNORED_DIRS, resolvePath } from '../tools/fs.ts';
import type { ToolContext } from '../tools/types.ts';

const MAX_FILES = 5000;
const MAX_PREVIEW_BYTES = 240_000;

function context(workspace: string): ToolContext {
  return {
    workspace,
    signal: new AbortController().signal,
    approve: async () => true,
    log: () => {},
    allowOutsideWorkspace: false,
    permissions: {},
    todos: [],
  };
}

export function toPosix(value: string): string {
  return value.split(sep).join('/');
}

export function safePath(workspace: string, candidate: string): string {
  try {
    return resolvePath(candidate || '.', context(workspace));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

interface WalkEntry {
  path: string;
  isDirectory: boolean;
}

function walk(workspace: string): WalkEntry[] {
  const entries: WalkEntry[] = [];
  const queue: string[] = [workspace];
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
      if (item.name.startsWith('.') && item.name !== '.gitignore' && item.name !== '.env.example') {
        continue;
      }
      if (item.isDirectory() && IGNORED_DIRS.has(item.name)) continue;
      const full = join(dir, item.name);
      const rel = toPosix(relative(workspace, full));
      if (item.isDirectory()) {
        entries.push({ path: `${rel}/`, isDirectory: true });
        queue.push(full);
      } else if (item.isFile()) {
        entries.push({ path: rel, isDirectory: false });
      }
      if (entries.length >= MAX_FILES) break;
    }
  }
  return entries;
}

export function listFiles(
  workspace: string,
  query = '',
  limit = 80,
): Array<{ path: string; isDirectory: boolean }> {
  const needle = query.trim().toLowerCase();
  const hits = walk(workspace).filter((entry) => {
    if (!needle) return true;
    const lower = entry.path.toLowerCase();
    if (lower.startsWith(needle)) return true;
    if (lower.includes(needle)) return true;
    return lower
      .split('/')
      .some((segment) => segment.startsWith(needle));
  });
  return hits.slice(0, Math.max(1, Math.min(80, limit)));
}

export function fileTree(
  workspace: string,
  requested = '',
): Array<{ name: string; path: string; type: 'dir' | 'file'; size?: number }> {
  const target = safePath(workspace, requested);
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error('目录不存在。');
  }
  const items: Array<{ name: string; path: string; type: 'dir' | 'file'; size?: number }> = [];
  for (const item of readdirSync(target, { withFileTypes: true })) {
    if (item.name.startsWith('.') && item.name !== '.gitignore' && item.name !== '.env.example') {
      continue;
    }
    if (item.isDirectory() && IGNORED_DIRS.has(item.name)) continue;
    const full = join(target, item.name);
    const rel = requested ? `${toPosix(requested).replace(/\/+$/, '')}/${item.name}` : item.name;
    if (item.isDirectory()) {
      items.push({ name: item.name, path: rel, type: 'dir' });
    } else if (item.isFile()) {
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        size = 0;
      }
      items.push({ name: item.name, path: rel, type: 'file', size });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

export function filePreview(
  workspace: string,
  requested: string,
): { path: string; content: string; truncated: boolean; binary: boolean; bytes: number } {
  const target = safePath(workspace, requested);
  if (!existsSync(target) || !statSync(target).isFile()) throw new Error('文件不存在。');
  const info = statSync(target);
  const raw = readFileSync(target);
  const bytes = raw.byteLength;
  if (extname(target) === '.png' || extname(target) === '.jpg' || extname(target) === '.jpeg' || extname(target) === '.gif' || extname(target) === '.webp') {
    return { path: toPosix(relative(workspace, target)), content: '', truncated: false, binary: true, bytes };
  }
  if (looksBinary(raw)) {
    return { path: toPosix(relative(workspace, target)), content: '', truncated: false, binary: true, bytes };
  }
  const truncated = raw.byteLength > MAX_PREVIEW_BYTES;
  const slice = truncated ? raw.subarray(0, MAX_PREVIEW_BYTES) : raw;
  return {
    path: toPosix(relative(workspace, target)),
    content: slice.toString('utf8'),
    truncated,
    binary: false,
    bytes: info.size,
  };
}

export function existingWorkspace(path: string): string | null {
  const target = resolve(path);
  try {
    return existsSync(target) && statSync(target).isDirectory() ? target : null;
  } catch {
    return null;
  }
}
