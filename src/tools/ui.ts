import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { auditPaths, formatViolations } from '../util/ui-audit.ts';
import { resolvePath } from './fs.ts';
import { type Tool, type ToolContext, type ToolResult, ok, toolError } from './types.ts';

export const uiAuditTool: Tool = {
  name: 'ui_audit',
  description:
    '扫描 CSS/HTML/JSX/TSX/Vue/Svelte 的 UI 反 AI 味规则：渐变、霓虹、玻璃拟态、紫蓝配色、大圆角、重阴影、emoji、假文案、令牌外硬编码颜色。交付 UI 前必须调用。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件或目录，默认工作区根目录' },
      strict_tokens: {
        type: 'boolean',
        description: '是否把令牌外硬编码颜色视为失败；项目有 design-tokens.json 时默认开启',
      },
    },
    required: [],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    try {
      const target = resolvePath(String(input.path ?? '.'), ctx);
      const strictTokens =
        typeof input.strict_tokens === 'boolean'
          ? input.strict_tokens
          : existsSync(join(ctx.workspace, 'design-tokens.json'));
      const { files, violations } = auditPaths([target], { strictTokens });
      const fails = violations.filter((item) => item.severity === 'fail');
      const content =
        `${formatViolations(violations)}\n\n扫描 ${files.length} 个 UI 文件：` +
        `${fails.length} 个失败，${violations.length - fails.length} 个警告。`;
      return {
        ...ok(content, `ui_audit ${fails.length ? `${fails.length} 个失败` : '通过'}`),
        meta: { uiViolations: violations, uiFiles: files },
      };
    } catch (error) {
      return toolError(error);
    }
  },
};
