// UI 反 AI 味扫描：硬禁用项失败，令牌外硬编码颜色只警告。
// 规则来源：docs/design/principles.md（P0 先落脚本，文档随后补齐）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['src/ui/style.css', 'src/ui/app.js', 'src/ui/index.html'];
const BANNED_HEX = /#(?:6366f1|8b5cf6|a855f7|7c3aed|4f46e5|667eea|764ba2)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

let failures = 0;
let warnings = 0;

function report(kind, file, line, message) {
  if (kind === 'fail') failures += 1;
  else warnings += 1;
  process.stdout.write(`${kind === 'fail' ? '✗' : '!'} ${file}:${line} ${message}\n`);
}

function tokenRanges(lines) {
  const ranges = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^\s*:root/.test(lines[start]) && !/prefers-color-scheme:\s*dark/.test(lines[start])) continue;
    let depth = 0;
    let opened = false;
    for (let end = start; end < lines.length; end += 1) {
      for (const char of lines[end]) {
        if (char === '{') {
          depth += 1;
          opened = true;
        } else if (char === '}') {
          depth -= 1;
        }
      }
      if (opened && depth === 0) {
        ranges.push([start, end]);
        break;
      }
    }
  }
  return ranges;
}

function checkFile(file) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split(/\r?\n/);
  const ranges = tokenRanges(lines);
  let allowHex = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNo = index + 1;
    const inTokenBlock = ranges.some(([start, end]) => index >= start && index <= end);

    if (line.includes('scanner-allow: terminal-palette')) {
      allowHex = true;
      continue;
    }
    if (line.includes('scanner-allow-end')) {
      allowHex = false;
      continue;
    }

    if (/backdrop-filter\s*:/.test(line)) {
      report('fail', file, lineNo, '禁用玻璃拟态：backdrop-filter');
    }

    if (/(?:linear|radial|conic)-gradient\(/i.test(line) && !/mask-image/i.test(line)) {
      report('fail', file, lineNo, '禁用装饰性渐变');
    }

    const radius = line.match(/border-radius\s*:\s*([^;]+);/);
    if (radius) {
      const values = [...radius[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
      const bad = values.find((value) => value > 8 && value < 99);
      if (bad) report('fail', file, lineNo, `圆角超过 8px：${bad}px`);
    }

    if (BANNED_HEX.test(line)) {
      report('fail', file, lineNo, `禁用紫蓝 AI 配色：${line.match(BANNED_HEX)[0]}`);
    }

    if (EMOJI.test(line)) {
      report('fail', file, lineNo, '禁用 emoji');
    }

    if (/lorem ipsum/i.test(line)) {
      report('fail', file, lineNo, '禁用 Lorem ipsum 假文案');
    }

    if (/!important/.test(line)) {
      report('warn', file, lineNo, '尽量避免 !important');
    }

    if (!allowHex && !inTokenBlock && !/mask-image/i.test(line) && /#[0-9a-f]{3,8}\b/i.test(line)) {
      report('warn', file, lineNo, '令牌块外的硬编码颜色');
    }
  }

  if (file.endsWith('.html')) {
    if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(text)) {
      report('fail', file, 1, '禁止外部 CDN 依赖');
    }
  }
}

for (const file of targets) checkFile(file);

process.stdout.write(
  `\nUI 检查：${failures} 个失败，${warnings} 个警告\n`,
);
if (failures > 0) process.exit(1);
