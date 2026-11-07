import { inspect } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const version: string = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function colorEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false;
  const force = process.env['FORCE_COLOR'];
  if (force !== undefined && force !== '' && force !== '0') return true;
  if (process.env['TERM'] === 'dumb') return false;
  return Boolean(process.stdout.isTTY);
}

const colorsEnabled = colorEnabled();

const paint = (open: number, close: number) => (text: string): string =>
  colorsEnabled && text ? `\u001b[${open}m${text}\u001b[${close}m` : text;

export const c = {
  bold: paint(1, 22),
  dim: paint(2, 22),
  red: paint(31, 39),
  green: paint(32, 39),
  yellow: paint(33, 39),
  blue: paint(34, 39),
  cyan: paint(36, 39),
  magenta: paint(35, 39),
  gray: paint(90, 39),
};

// 输出目标可替换：CLI 走 stdout，GUI 走 SSE。命令逻辑只有一份。
type OutputSink = (text: string) => void;
let sink: OutputSink | null = null;

/** 把输出转到别处（GUI 用）；返回还原函数。 */
export function captureOutput(target: OutputSink): () => void {
  const previous = sink;
  sink = target;
  return () => {
    sink = previous;
  };
}

export function write(text: string): void {
  if (sink) {
    sink(text);
    return;
  }
  process.stdout.write(text);
}

export function line(text = ''): void {
  write(`${text}\n`);
}

export function info(text: string): void {
  line(c.cyan(text));
}

export function ok(text: string): void {
  line(c.green(text));
}

export function warn(text: string): void {
  line(c.yellow(text));
}

export function error(text: string): void {
  line(c.red(text));
}

export function hint(text: string): void {
  line(c.dim(text));
}

const LOGO = [
  '   ____                  _',
  '  | __ )  __ _ _ __   __ _| |__   __ _ _ __',
  "  |  _ \\ / _` | '_ \\ / _` | '_ \\ / _` | '_ \\",
  '  | |_) | (_| | | | | (_| | |_) | (_| | | | |',
  '  |____/ \\__,_|_| |_|\\__,_|_.__/ \\__,_|_| |_|',
];

export function banner(): string {
  const art = LOGO.map((text) => c.yellow(text));
  const subtitle = `${' '.repeat(10)}${c.bold(`BananaCLI v${version}`)} ${c.dim('· 终端里的多 provider agent')}`;
  return [...art, '', subtitle].join('\n');
}

/** 终端显示宽度：CJK / 全角 / emoji 占两列，ANSI 转义不占宽度。 */
export function displayWidth(text: string): number {
  const plain = text.replace(/\u001b\[[0-9;]*m/g, '');
  let width = 0;
  for (const char of plain) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x200b || code === 0xfeff) continue;
    if (code < 32) continue;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** 按显示宽度右补空格（不会破坏已有的 ANSI 颜色）。 */
export function padDisplay(text: string, targetWidth: number): string {
  const gap = targetWidth - displayWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

/** 终端宽度不够时截断，避免换行把表格撑乱。 */
export function truncateDisplay(text: string, maxWidth: number, ellipsis = '…'): string {
  if (displayWidth(text) <= maxWidth) return text;
  let width = 0;
  let out = '';
  for (const char of text) {
    const w = displayWidth(char);
    if (width + w > maxWidth - 1) break;
    width += w;
    out += char;
  }
  return out + ellipsis;
}

export function toolLine(label: string, detail: string): string {
  return `${c.dim('│')} ${c.magenta('⏺')} ${c.bold(label)} ${c.dim(detail)}`;
}

/** 回合之间的细分隔线，让每轮对话在视觉上分成独立区块。 */
export function divider(): string {
  const width = Math.max(24, Math.min(72, (process.stdout.columns ?? 80) - 14));
  return c.dim('─'.repeat(width));
}

export function bullet(text: string): string {
  return `${c.gray('•')} ${text}`;
}

export function preview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 工具失败时按行展示，避免一大段错误被压成一行看不出来。 */
export function errorBlock(text: string, maxLines = 3, maxWidth = 300): string {
  const lines = text
    .split('\n')
    .map((item) => item.trimEnd())
    .filter((item) => item.trim().length > 0)
    .slice(0, maxLines);
  if (lines.length === 0) return c.red('(无输出)');
  return lines
    .map((item, index) => (index === 0 ? c.red(`✗ ${truncateDisplay(item, maxWidth)}`) : c.dim(`  ${truncateDisplay(item, maxWidth)}`)))
    .join('\n  ');
}

/** 1234 -> 1.2k，方便在状态行里读。 */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatValue(value: unknown): string {
  return inspect(value, { depth: 2, breakLength: 100, maxStringLength: 200 });
}

export function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

export function clearScreen(): void {
  if (sink) {
    sink('\u001b[clear]\n');
    return;
  }
  if (process.stdout.isTTY) process.stdout.write('\u001b[2J\u001b[H');
}