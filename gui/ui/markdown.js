import { create } from './dom.js';
import { icon } from './icons.js';

function appendInline(parent, text) {
  let rest = text;
  const token = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/;
  while (rest) {
    const match = token.exec(rest);
    if (!match || match.index === undefined) {
      parent.append(document.createTextNode(rest));
      return;
    }
    if (match.index > 0) parent.append(document.createTextNode(rest.slice(0, match.index)));
    const raw = match[0];
    if (raw.startsWith('`')) {
      parent.append(create('code', '', raw.slice(1, -1)));
    } else if (raw.startsWith('**')) {
      const strong = create('strong');
      appendInline(strong, raw.slice(2, -2));
      parent.append(strong);
    } else if (raw.startsWith('*')) {
      const em = create('em');
      appendInline(em, raw.slice(1, -1));
      parent.append(em);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw);
      if (link) {
        const label = link[1] ?? '';
        const href = link[2] ?? '';
        if (/^https?:\/\//i.test(href)) {
          const anchor = create('a', '', label);
          anchor.href = href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          parent.append(anchor);
        } else {
          parent.append(document.createTextNode(label));
        }
      } else {
        parent.append(document.createTextNode(raw));
      }
    }
    rest = rest.slice(match.index + raw.length);
  }
}

function codeBlock(language, code) {
  const wrap = create('div', 'code-wrap');
  const pre = create('pre');
  const codeEl = create('code', '', code);
  if (language) codeEl.dataset.language = language;
  pre.append(codeEl);
  const copy = create('button', 'code-copy', '复制');
  copy.type = 'button';
  copy.setAttribute('aria-label', '复制代码');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = '已复制';
      setTimeout(() => {
        copy.textContent = '复制';
      }, 1200);
    } catch {
      copy.textContent = '复制失败';
    }
  });
  wrap.append(pre, copy);
  if (language && window.hljs) {
    requestAnimationFrame(() => {
      try {
        window.hljs.highlightElement(codeEl);
      } catch {
        // 未知语言时保持纯文本
      }
    });
  }
  return wrap;
}

function tableFrom(rows) {
  const table = create('table');
  const head = rows[0] ?? [];
  const thead = create('thead');
  const headRow = create('tr');
  for (const cell of head) {
    const th = create('th', '', cell.trim());
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);
  const tbody = create('tbody');
  for (const row of rows.slice(1)) {
    const tr = create('tr');
    for (let index = 0; index < head.length; index += 1) {
      const td = create('td');
      appendInline(td, (row[index] ?? '').trim());
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

export function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  const isTableSeparator = (line) =>
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (/^\s*```/.test(line)) {
      const language = line.replace(/^\s*```/, '').trim();
      index += 1;
      const buffer = [];
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? '')) {
        buffer.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      fragment.append(codeBlock(language, buffer.join('\n')));
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s*#{1,4}\s+/.test(line)) {
      const match = /^\s*(#{1,4})\s+(.*)$/.exec(line);
      if (match) {
        const level = Math.min(4, match[1]?.length ?? 2);
        const heading = create(`h${level}`);
        appendInline(heading, match[2] ?? '');
        fragment.append(heading);
      }
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      fragment.append(document.createElement('hr'));
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = create('blockquote');
      const buffer = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) {
        buffer.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
        index += 1;
      }
      appendInline(quote, buffer.join('\n'));
      fragment.append(quote);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const list = create('ul');
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? '')) {
        const item = create('li');
        appendInline(item, (lines[index] ?? '').replace(/^\s*[-*+]\s+/, ''));
        list.append(item);
        index += 1;
      }
      fragment.append(list);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = create('ol');
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? '')) {
        const item = create('li');
        appendInline(item, (lines[index] ?? '').replace(/^\s*\d+[.)]\s+/, ''));
        list.append(item);
        index += 1;
      }
      fragment.append(list);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
      const rows = [splitRow(line)];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      fragment.append(tableFrom(rows));
      continue;
    }

    const paragraph = create('p');
    const buffer = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !/^\s*(```|#{1,4}\s+|[-*+]\s+|\d+[.)]\s+|>\s?|---+|\*\*\*+)/.test(lines[index] ?? '')
    ) {
      buffer.push(lines[index] ?? '');
      index += 1;
    }
    appendInline(paragraph, buffer.join('\n'));
    fragment.append(paragraph);
  }
  return fragment;
}

export function renderMarkdownInto(element, text) {
  if (!element) return;
  element.replaceChildren(renderMarkdown(text));
}

export function renderStatusIcon(ok) {
  const span = create('span', 'tool-status');
  span.innerHTML = icon(ok ? 'check-circle' : 'x-circle');
  return span;
}
