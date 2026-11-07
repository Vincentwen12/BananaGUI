import type { Provider, UMessage } from '../providers/types.ts';
import { selectRelevant } from './retrieval.ts';

const REVIEW_SYSTEM = [
  '你是独立的审查 agent，只负责挑毛病，不负责执行。',
  '检查最近对话里的交付物是否满足：能运行、测试/构建结果有依据、未验证项已列出、能力边界说明、没有编造版本/数字/API、没有把猜测说成事实。',
  '输出按「阻断问题 / 建议 / 未验证项」三组，最多 10 条，直接给结论。',
].join('\n');

/** 用第二次模型调用做独立审查；不调用工具，也不修改文件。 */
export async function reviewSession(options: {
  provider: Provider;
  messages: UMessage[];
  system?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const lastUser = [...options.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const recent = selectRelevant(options.messages, lastUser, 12);
  const transcript = recent
    .map((message) => {
      const label = message.role === 'assistant' ? '助手' : message.role === 'tool' ? '工具' : '用户';
      return `### ${label}\n${message.content.slice(0, 4000)}`;
    })
    .join('\n\n');
  const result = await options.provider.generate({
    messages: [
      {
        role: 'user',
        content: `${options.system ? `项目背景：\n${options.system.slice(0, 4000)}\n\n` : ''}<最近对话>\n${transcript}\n</最近对话>`,
      },
    ],
    system: REVIEW_SYSTEM,
    tools: [],
    signal: options.signal,
  });
  return result.message.content.trim() || '审查 agent 没有返回内容。';
}
