import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export type UiSeverity = 'fail' | 'warn';

export interface UiViolation {
  file: string;
  line: number;
  rule: string;
  severity: UiSeverity;
  message: string;
}

export interface AuditOptions {
  /** 项目有 design-tokens.json 时，令牌外硬编码颜色按失败处理。 */
  strictTokens?: boolean;
  /** 额外允许的规则 ID，例如 terminal-palette。 */
  allowRules?: string[];
  /** 不扫描的文件（绝对路径），用于跳过扫描器自身。 */
  ignoreFiles?: string[];
}

const UI_EXTENSIONS = new Set(['.css', '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage',
  '__pycache__', '.venv', 'venv', 'target', '.cache',
]);
const BANNED_HEX = /#(?:6366f1|8b5cf6|a855f7|7c3aed|4f46e5|667eea|764ba2|00d4ff|06b6d4)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const HEX_OR_FUNCTION = /#(?:[0-9a-f]{3,8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;

function isTokenFile(file: string): boolean {
  return /(?:^|[\\/])design-tokens\.json$/i.test(file) || /(?:^|[\\/])tokens\.css$/i.test(file);
}

function lineHasAllow(line: string, rule: string, options: AuditOptions): boolean {
  if (line.includes(`ui-allow: ${rule}`) || line.includes('scanner-allow')) return true;
  return options.allowRules?.includes(rule) ?? false;
}

/** 粗略标记 :root / 深色主题块，块内的颜色视为令牌定义。 */
function tokenLines(lines: string[]): boolean[] {
  const flags = new Array<boolean>(lines.length).fill(false);
  let depth = 0;
  let tokenDepth = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const isTokenStart =
      /^\s*:root/.test(line) || /prefers-color-scheme:\s*dark/i.test(line);
    if (tokenDepth < 0 && isTokenStart) tokenDepth = depth;
    if (tokenDepth >= 0) flags[index] = true;
    for (const char of line) {
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    }
    if (tokenDepth >= 0 && depth <= tokenDepth) tokenDepth = -1;
  }
  return flags;
}

function shadowIsNeon(value: string): boolean {
  // 0 0 20px #7c3aed / 0 0 8px rgba(124,58,237,.8) 这类无偏移彩色发光
  if (!HEX_OR_FUNCTION.test(value)) return false;
  const zeroOffset = /(?:^|,)\s*0(?:px)?\s+0(?:px)?\s+(\d+)px/i.exec(value);
  if (zeroOffset && Number(zeroOffset[1]) >= 6) return true;
  return /text-shadow\s*:/i.test(value) && !/none/i.test(value);
}

function countShadowLayers(value: string): number {
  let depth = 0;
  let count = 1;
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) count += 1;
  }
  return count;
}

export function auditText(file: string, text: string, options: AuditOptions = {}): UiViolation[] {
  const violations: UiViolation[] = [];
  if (isTokenFile(file)) return violations;
  if (options.allowRules?.includes('all')) return violations;
  const lines = text.split(/\r?\n/);
  const inTokens = tokenLines(lines);
  const strictTokens = options.strictTokens ?? false;
  let centered = false;
  let hugeFont = false;
  let hasGradient = false;

  const push = (line: number, rule: string, severity: UiSeverity, message: string): void => {
    violations.push({ file, line: line + 1, rule, severity, message });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (lineHasAllow(line, 'all', options)) continue;

    if (/backdrop-filter\s*:/i.test(line) && !lineHasAllow(line, 'no-glass', options)) {
      push(index, 'no-glass', 'fail', '禁用玻璃拟态：backdrop-filter');
    }

    if (/(?:linear|radial|conic)-gradient\(/i.test(line) && !/mask-image/i.test(line)) hasGradient = true;
    if (
      /(?:linear|radial|conic)-gradient\(/i.test(line) &&
      !/mask-image/i.test(line) &&
      !lineHasAllow(line, 'no-gradient', options)
    ) {
      push(index, 'no-gradient', 'fail', '禁用装饰性渐变');
    }
    if (/text-align\s*:\s*center/i.test(line)) centered = true;
    if (/font-size\s*:\s*(?:clamp\([^)]*\b(?:4[89]|[5-9]\d|\d{3,})px|(?:4[89]|[5-9]\d|\d{3,})px)/i.test(line)) {
      hugeFont = true;
    }

    if (/text-shadow\s*:/i.test(line) && !/none/i.test(line) && !lineHasAllow(line, 'no-neon-glow', options)) {
      push(index, 'no-neon-glow', 'fail', '禁用文字发光');
    }
    if (
      /(?:box-shadow|filter\s*:\s*drop-shadow)/i.test(line) &&
      shadowIsNeon(line) &&
      !lineHasAllow(line, 'no-neon-glow', options)
    ) {
      push(index, 'no-neon-glow', 'fail', '禁用霓虹发光');
    }

    if (BANNED_HEX.test(line) && !lineHasAllow(line, 'no-ai-palette', options)) {
      push(index, 'no-ai-palette', 'fail', `禁用紫蓝 AI 配色：${line.match(BANNED_HEX)?.[0] ?? ''}`);
    }

    const radius = /border-radius\s*:\s*([^;]+);?/i.exec(line);
    if (radius && !lineHasAllow(line, 'no-big-radius', options)) {
      const values = [...radius[1]!.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
      const bad = values.find((value) => value > 8 && value < 99);
      if (bad) push(index, 'no-big-radius', 'fail', `圆角超过 8px：${bad}px`);
    }

    const shadow = /box-shadow\s*:\s*([^;]+);?/i.exec(line);
    if (
      shadow &&
      countShadowLayers(shadow[1]!) > 1 &&
      /\b(?:1[6-9]|[2-9]\d)px\b/.test(shadow[1]!) &&
      !lineHasAllow(line, 'no-heavy-shadow', options)
    ) {
      push(index, 'no-heavy-shadow', 'fail', '禁用多层重阴影');
    }

    if (EMOJI.test(line) && !lineHasAllow(line, 'no-emoji', options)) {
      push(index, 'no-emoji', 'fail', '禁用 emoji 图标');
    }
    if (/lorem ipsum/i.test(line) && !lineHasAllow(line, 'no-lorem', options)) {
      push(index, 'no-lorem', 'fail', '禁用 Lorem ipsum 假文案');
    }
    if (/!important/.test(line) && !lineHasAllow(line, 'no-important', options)) {
      push(index, 'no-important', 'warn', '尽量避免 !important');
    }



    if (!strictTokens || inTokens[index] || isTokenFile(file)) continue;
    if (HEX_OR_FUNCTION.test(line) && !lineHasAllow(line, 'token-color-only', options)) {
      push(index, 'token-color-only', 'fail', '令牌外硬编码颜色');
    }
  }

  if (centered && hugeFont && hasGradient && !lineHasAllow('', 'no-gradient-hero', options)) {
    push(0, 'no-gradient-hero', 'warn', '警惕居中超大标题 + 渐变按钮的落地页结构');
  }
  return violations;
}

function walk(target: string, files: string[]): void {
  let info;
  try {
    info = statSync(target);
  } catch {
    return;
  }
  if (info.isDirectory()) {
    let entries;
    try {
      entries = readdirSync(target, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      walk(join(target, entry.name), files);
    }
    return;
  }
  if (info.isFile() && UI_EXTENSIONS.has(extname(target).toLowerCase())) files.push(target);
}

export function auditPaths(
  paths: string[],
  options: AuditOptions = {},
): { files: string[]; violations: UiViolation[] } {
  const files: string[] = [];
  const ignored = new Set((options.ignoreFiles ?? []).map((file) => resolve(file)));
  for (const target of paths) walk(resolve(target), files);
  const filtered = files.filter((file) => !ignored.has(file));
  const violations: UiViolation[] = [];
  for (const file of filtered) {
    try {
      violations.push(...auditText(file, readFileSync(file, 'utf8'), options));
    } catch {
      // 读不到就跳过
    }
  }
  return { files: filtered, violations };
}

export function formatViolations(violations: UiViolation[]): string {
  if (!violations.length) return 'UI 审计通过。';
  return violations
    .map(
      (item) =>
        `${item.severity === 'fail' ? '✗' : '!'} ${item.file}:${item.line} [${item.rule}] ${item.message}`,
    )
    .join('\n');
}
