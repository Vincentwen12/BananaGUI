import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { type Tool, type ToolContext, type ToolResult, fail, ok, toolError } from './types.ts';
import { diffLines, diffStat, formatDiff } from '../util/diff.ts';

export const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  '.idea',
  '.gradle',
  'coverage',
]);

const MAX_READ_BYTES = 2_000_000;
const MAX_TEXT_BYTES = 4_000_000;
const DEFAULT_IGNORES = `默认忽略: ${[...IGNORED_DIRS].join(', ')}`;

/** 解析目标路径上最近的已存在祖先，用于识别符号链接/短路径等真实位置。 */
function realpathOfNearest(target: string): string {
  let current = target;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  try {
    return realpathSync.native(current);
  } catch {
    return current;
  }
}

function assertInside(
  realRoot: string,
  realTarget: string,
  original: string,
  root: string,
  viaSymlink: boolean,
): void {
  const rel = relative(realRoot, realTarget);
  const outside = rel.startsWith('..') || (rel !== '' && isAbsolute(rel));
  if (!outside) return;
  const hint = '传相对路径，或用 --allow-outside / 配置 allowOutsideWorkspace 放开限制。';
  throw new Error(
    viaSymlink
      ? `${original} 实际指向 ${realTarget}，在工作区 ${root} 之外（符号链接不能绕过限制）。${hint}`
      : `路径 ${original} 在工作区 ${root} 之外。${hint}`,
  );
}

export function resolvePath(candidate: string, ctx: ToolContext): string {
  const root = resolve(ctx.workspace);
  const target = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  if (ctx.allowOutsideWorkspace) return target;

  // 先做字面检查（拦住 ../ 这种），再用真实路径检查（拦住符号链接/软链目录）
  assertInside(root, target, target, root, false);
  assertInside(realpathOfNearest(root), realpathOfNearest(target), target, root, true);
  return target;
}

function toDisplay(ctx: ToolContext, target: string): string {
  const rel = relative(resolve(ctx.workspace), target);
  return rel && !rel.startsWith('..') ? rel : target;
}

function toEol(text: string, eol: string): string {
  return text.replace(/\r\n/g, '\n').split('\n').join(eol);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Windows 仓库常见 CRLF，而模型习惯写 LF。直接匹配失败时按文件的行尾风格
 * 重试一次，替换进去的内容也用同样的行尾，避免把整个文件的行尾搅乱。
 */
function alignEdit(
  original: string,
  oldString: string,
  newString: string,
): { source: string; replacement: string; count: number } {
  let source = oldString;
  let replacement = newString;
  let count = countOccurrences(original, source);

  if (count === 0 && oldString.includes('\n')) {
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const aligned = toEol(oldString, eol);
    if (aligned !== oldString && original.includes(aligned)) {
      source = aligned;
      replacement = toEol(newString, eol);
      count = countOccurrences(original, source);
    }
  }

  return { source, replacement, count };
}

async function describe(target: string) {
  const info = await stat(target);
  return {
    isDirectory: info.isDirectory(),
    isFile: info.isFile(),
    size: info.size,
    modified: info.mtime.toISOString(),
  };
}

async function walk(root: string, options: { maxFiles: number; includeHidden: boolean }): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [root];
  while (queue.length) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!options.includeHidden && entry.name.startsWith('.') && entry.name !== '.') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        queue.push(full);
      } else if (entry.isFile()) {
        files.push(full);
        if (files.length >= options.maxFiles) return files;
      }
    }
  }
  return files;
}

function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') out += '[^/]';
    else if (char === '{') out += '(?:';
    else if (char === '}') out += ')';
    else if (char === ',') out += '|';
    else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function looksBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 1024);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n...[省略 ${text.length - max} 个字符]...\n${text.slice(-tail)}`;
}

function lineNumbered(text: string, startLine: number): string {
  return text
    .split('\n')
    .map((line, index) => `${startLine + index}| ${line}`)
    .join('\n');
}

export const readFileTool: Tool = {
  name: 'read_file',
  description:
    '读取文件内容，返回带行号的文本。默认读整个文件；可用 offset/limit 分段读大文件。相对路径基于工作区根目录。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径，相对工作区根目录或绝对路径' },
      offset: { type: 'number', description: '起始行号（从 1 开始），默认 1' },
      limit: { type: 'number', description: '最多读取的行数，默认全部' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const target = resolvePath(String(input.path), ctx);
      if (!existsSync(target)) return fail(`文件不存在: ${target}`);
      const info = await describe(target);
      if (info.isDirectory) return fail(`${target} 是目录，用 list_dir 查看内容。`);

      const buffer = await readFile(target);
      if (buffer.byteLength > MAX_READ_BYTES) {
        return fail(
          `文件过大 (${info.size} 字节)。请用 offset/limit 分段读取，或改用 grep 定位关键行。`,
        );
      }
      if (looksBinary(buffer)) {
        return fail(`这是二进制文件 (${info.size} 字节)，无法按文本读取。`);
      }

      const all = buffer.toString('utf8');
      const lines = all.split(/\r?\n/);
      const offset = Math.max(1, Number(input.offset) || 1);
      const limit = Number(input.limit) || lines.length;
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const header = `${toDisplay(ctx, target)} | 共 ${lines.length} 行, ${info.size} 字节 | 从第 ${offset} 行起显示 ${slice.length} 行`;
      const body = truncateMiddle(lineNumbered(slice.join('\n'), offset), 60_000);
      return ok(
        `${header}\n\n${body}`,
        `读取 ${toDisplay(ctx, target)}（${slice.length} 行${lines.length > slice.length ? ` / 共 ${lines.length} 行` : ''}）`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description:
    '创建新文件或整体覆盖已有文件（内容会完全替换）。修改已有文件优先用 edit_file 做精确替换，以免覆盖掉别人的改动。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件完整内容' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  approval: 'write',
  async preview(input, ctx) {
    try {
      const target = resolvePath(String(input.path), ctx);
      const content = String(input.content ?? '');
      const existed = existsSync(target);
      const display = toDisplay(ctx, target);
      if (!existed) {
        const total = content.split('\n').length;
        return `新建 ${display}（${total} 行）\n${formatDiff(
          {
            lines: content.split('\n').map((text) => ({ type: 'add' as const, text })),
            added: total,
            removed: 0,
            approximate: false,
          },
          { maxLines: 24 },
        )}`;
      }
      const info = await describe(target);
      if (info.isDirectory) return undefined;
      const before = await readFile(target, 'utf8');
      const diff = diffLines(before, content);
      if (diff.lines.every((line) => line.type === 'context')) return `${display}：内容没有变化`;
      return `${display}  ${diffStat(diff)}\n${formatDiff(diff, { maxLines: 40 })}`;
    } catch {
      return undefined;
    }
  },
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const target = resolvePath(String(input.path), ctx);
      const content = String(input.content ?? '');
      const existed = existsSync(target);
      if (existed) {
        const info = await describe(target);
        if (info.isDirectory) return fail(`${target} 是目录，无法写入。`);
      }
      if (ctx.recordChange) {
        await ctx.recordChange(target, existed ? await readFile(target, 'utf8') : null);
      }
      if (!existed) {
        await mkdir(dirname(target), { recursive: true });
      }
      await writeFile(target, content, 'utf8');
      const lines = content.split('\n').length;
      return ok(
        `已${existed ? '覆盖' : '创建'} ${toDisplay(ctx, target)}（${lines} 行, ${Buffer.byteLength(content)} 字节）`,
        `${existed ? '覆盖' : '写入'} ${toDisplay(ctx, target)}`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

export const editFileTool: Tool = {
  name: 'edit_file',
  description:
    '在文件里做精确字符串替换。old_string 必须与文件内容完全一致（默认要求唯一出现），可传 replace_all 替换全部匹配。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      old_string: { type: 'string', description: '要被替换的原文字符串' },
      new_string: { type: 'string', description: '替换后的新字符串' },
      replace_all: { type: 'boolean', description: '是否替换所有匹配，默认 false' },
    },
    required: ['path', 'old_string', 'new_string'],
    additionalProperties: false,
  },
  approval: 'write',
  async preview(input, ctx) {
    try {
      const target = resolvePath(String(input.path), ctx);
      if (!existsSync(target)) return `文件不存在: ${toDisplay(ctx, target)}`;
      const oldString = String(input.old_string ?? '');
      const newString = String(input.new_string ?? '');
      if (!oldString || oldString === newString) return undefined;
      const before = await readFile(target, 'utf8');
      const { source, replacement, count: occurrences } = alignEdit(before, oldString, newString);
      if (occurrences === 0) return `${toDisplay(ctx, target)}：找不到 old_string（实际执行会失败）`;
      if (occurrences > 1 && !input.replace_all) {
        return `${toDisplay(ctx, target)}：old_string 出现 ${occurrences} 次，不唯一（实际执行会失败）`;
      }
      const after = input.replace_all
        ? before.split(source).join(replacement)
        : before.replace(source, replacement);
      const diff = diffLines(before, after);
      return `${toDisplay(ctx, target)}  ${diffStat(diff)}（替换 ${input.replace_all ? occurrences : 1} 处）\n${formatDiff(diff, { maxLines: 40 })}`;
    } catch {
      return undefined;
    }
  },
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const target = resolvePath(String(input.path), ctx);
      if (!existsSync(target)) return fail(`文件不存在: ${target}`);
      const oldString = String(input.old_string ?? '');
      const newString = String(input.new_string ?? '');
      if (oldString === newString) return fail('old_string 与 new_string 相同，无需修改。');
      if (!oldString) return fail('old_string 不能为空。');

      const original = await readFile(target, 'utf8');
      if (Buffer.byteLength(original) > MAX_TEXT_BYTES) return fail('文件过大，拒绝编辑。');

      const { source, replacement, count } = alignEdit(original, oldString, newString);
      if (count === 0) {
        return fail(
          `在 ${toDisplay(ctx, target)} 中找不到 old_string。请先 read_file 确认原文（注意缩进与空白；CRLF 会自动兼容）。`,
        );
      }
      if (count > 1 && !input.replace_all) {
        return fail(
          `old_string 在 ${toDisplay(ctx, target)} 中出现 ${count} 次。请提供更唯一的 old_string，或传 replace_all: true。`,
        );
      }

      const updated = input.replace_all
        ? original.split(source).join(replacement)
        : original.replace(source, replacement);

      // 先写临时文件再 rename，尽量避免写一半损坏原文件
      if (ctx.recordChange) await ctx.recordChange(target, original);
      const temp = `${target}.banana-${Date.now()}.tmp`;
      await writeFile(temp, updated, 'utf8');
      await rename(temp, target);
      const replaced = input.replace_all ? count : 1;
      return ok(
        `已在 ${toDisplay(ctx, target)} 中替换 ${replaced} 处（共 ${original.split(/\r?\n/).length} 行）`,
        `编辑 ${toDisplay(ctx, target)}（${replaced} 处）`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

export const listDirTool: Tool = {
  name: 'list_dir',
  description: `列出目录内容。${DEFAULT_IGNORES}`,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径，默认为工作区根目录' },
      depth: { type: 'number', description: '递归深度，默认 1，最多 4' },
    },
    required: [],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const target = resolvePath(String(input.path ?? '.'), ctx);
      if (!existsSync(target)) return fail(`目录不存在: ${target}`);
      const maxDepth = Math.min(Math.max(Number(input.depth) || 1, 1), 4);
      const lines: string[] = [];

      const walkDir = async (dir: string, depth: number): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
          if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
          const full = join(dir, entry.name);
          const rel = relative(target, full) || entry.name;
          if (entry.isDirectory()) {
            lines.push(`${rel}/`);
            if (depth < maxDepth) await walkDir(full, depth + 1);
          } else if (entry.isFile()) {
            const info = await stat(full).catch(() => undefined);
            lines.push(`${rel}  ${info ? formatSize(info.size) : ''}`);
          }
          if (lines.length > 2000) return;
        }
      };

      await walkDir(target, 1);
      const display = toDisplay(ctx, target);
      const fileCount = lines.filter((item) => !item.endsWith('/')).length;
      const dirCount = lines.length - fileCount;
      return ok(
        `${display}\n${lines.join('\n') || '(空目录)'}`,
        `${display}：${dirCount} 个目录，${fileCount} 个文件`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

export const globTool: Tool = {
  name: 'glob',
  description:
    '按 glob 模式查找文件，例如 "**/*.ts"、"src/**/*.{ts,tsx}"。支持 * ** ? 和 {a,b}。',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'glob 模式' },
      path: { type: 'string', description: '搜索根目录，默认为工作区根目录' },
      limit: { type: 'number', description: '最多返回多少个结果，默认 200' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const root = resolvePath(String(input.path ?? '.'), ctx);
      const pattern = String(input.pattern);
      const regex = globToRegExp(pattern);
      const limit = Math.min(Number(input.limit) || 200, 1000);
      const files = await walk(root, { maxFiles: 20_000, includeHidden: false });
      const matches = files
        .map((file) => relative(root, file).split(sep).join('/'))
        .filter((rel) => regex.test(rel))
        .sort();
      const shown = matches.slice(0, limit);
      const suffix = matches.length > limit ? `\n... 还有 ${matches.length - limit} 个未显示` : '';
      return ok(
        `匹配 ${matches.length} 个文件\n${shown.join('\n') || '(无匹配)'}${suffix}`,
        `glob ${pattern} -> ${matches.length}`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

export const grepTool: Tool = {
  name: 'grep',
  description:
    `在文件内容里做正则搜索，返回 file:line: 内容。用它定位代码而不是逐个 read_file。${DEFAULT_IGNORES}`,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式' },
      path: { type: 'string', description: '搜索目录，默认为工作区根目录' },
      glob: { type: 'string', description: '只搜索匹配该 glob 的文件，例如 "**/*.ts"' },
      ignore_case: { type: 'boolean', description: '忽略大小写，默认 false' },
      limit: { type: 'number', description: '最多返回多少条匹配，默认 100' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const root = resolvePath(String(input.path ?? '.'), ctx);
      const pattern = String(input.pattern);
      const limit = Math.min(Number(input.limit) || 100, 1000);
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, input.ignore_case ? 'gi' : 'g');
      } catch (error) {
        return fail(`正则表达式无效: ${(error as Error).message}`);
      }

      const globFilter = input.glob ? globToRegExp(String(input.glob)) : undefined;
      const files = await walk(root, { maxFiles: 20_000, includeHidden: false });
      const lines: string[] = [];
      const MAX_GREP_MATCHES = 20_000;
      let total = 0;
      let capped = false;

      outer: for (const file of files) {
        const rel = relative(root, file).split(sep).join('/');
        if (globFilter && !globFilter.test(rel)) continue;
        const buffer = await readFile(file).catch(() => undefined);
        if (!buffer || buffer.byteLength > MAX_READ_BYTES || looksBinary(buffer)) continue;
        const content = buffer.toString('utf8');
        const fileLines = content.split('\n');
        for (let i = 0; i < fileLines.length; i += 1) {
          const line = fileLines[i]!;
          if (!line.trim()) continue;
          regex.lastIndex = 0;
          if (!regex.test(line)) continue;
          if (total >= MAX_GREP_MATCHES) {
            capped = true;
            break outer;
          }
          total += 1;
          // 只限制展示行数，不再提前停止计数。
          if (lines.length < limit) lines.push(`${rel}:${i + 1}: ${line.trim().slice(0, 300)}`);
        }
      }

      const remaining = total - lines.length;
      const suffix = remaining > 0
        ? `\n... 还有 ${remaining}${capped ? '+' : ''} 条未显示`
        : '';
      const totalLabel = capped ? `至少 ${total}` : `${total}`;
      return ok(
        `找到 ${totalLabel} 处匹配\n${lines.join('\n') || '(无匹配)'}${suffix}`,
        `grep ${pattern} -> ${totalLabel} 处`,
      );
    } catch (error) {
      return toolError(error);
    }
  },
};

export const fileTools: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  globTool,
  grepTool,
];