export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(code: string, language: string): string {
  const hljs = (window as unknown as { hljs?: { highlight?: (code: string, options: unknown) => { value: string } } }).hljs;
  if (!hljs?.highlight) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: language || 'plaintext', ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function inline(text: string): string {
  let out = escapeHtml(text);
  const codes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
      /^(https?:|\/|\.)/.test(src) ? `<img src="${src}" alt="${alt}" loading="lazy"/>` : alt,
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
      /^(https?:|mailto:|\/|#|\.)/.test(href)
        ? `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : label,
    )
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => `<code>${codes[Number(index)] ?? ''}</code>`);
}

function blocks(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let index = 0;

  const flushParagraph = (buffer: string[]) => {
    if (!buffer.length) return;
    out.push(`<p>${buffer.map((line) => inline(line)).join('<br/>')}</p>`);
    buffer.length = 0;
  };

  const paragraph: string[] = [];

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }

    const fence = /^```([\w+-]*)\s*$/.exec(trimmed);
    if (fence) {
      flushParagraph(paragraph);
      const language = fence[1] ?? '';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index]!.trim())) {
        code.push(lines[index]!);
        index += 1;
      }
      index += 1;
      out.push(
        `<pre><code class="language-${escapeHtml(language || 'plaintext')}">${highlight(code.join('\n'), language)}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph(paragraph);
      out.push('<hr/>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph);
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]!.trim())) {
        quote.push(lines[index]!.trim().replace(/^>\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote>${blocks(quote.join('\n'))}</blockquote>`);
      continue;
    }

    const listMatch = /^([-*+]|\d+[.)])\s+/.exec(trimmed);
    if (listMatch) {
      flushParagraph(paragraph);
      const ordered = /\d/.test(listMatch[1]!);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index]!;
        const match = /^([-*+]|\d+[.)])\s+(.*)$/.exec(current.trim());
        if (!match) break;
        items.push(`<li>${inline(match[2]!)}</li>`);
        index += 1;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\|.*\|$/.test(trimmed) && /^\|?[\s:|-]+\|$/.test((lines[index + 1] ?? '').trim())) {
      flushParagraph(paragraph);
      const header = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index]!.trim())) {
        rows.push(lines[index]!.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
        index += 1;
      }
      out.push(
        `<table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(paragraph);
  return out.join('');
}

export function renderMarkdown(text: string): string {
  return blocks(String(text ?? ''));
}

export function plainSummary(text: string, limit = 120): string {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
