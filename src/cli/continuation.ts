/** 把以反斜杠结尾的多行输入拼成一条消息；每行只加入一次。 */
export async function collectContinuation(
  first: string,
  ask: () => Promise<string>,
): Promise<string> {
  const lines: string[] = [];
  let current = first;
  for (;;) {
    if (!current.endsWith('\\')) {
      lines.push(current);
      break;
    }
    lines.push(current.slice(0, -1).trimEnd());
    current = await ask();
  }
  return lines.join('\n');
}
