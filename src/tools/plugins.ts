import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { JsonSchema } from '../providers/types.ts';
import { type ApprovalKind, type Tool, type ToolResult, fail, ok } from './types.ts';

const VALID_APPROVALS: ApprovalKind[] = ['never', 'write', 'shell', 'network'];
const PLUGIN_EXTENSIONS = new Set(['.mjs', '.js', '.ts']);
const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/i;

export interface PluginLoadResult {
  tools: Tool[];
  errors: string[];
  plugins: PluginInfo[];
}

export interface PluginInfo {
  file: string;
  dir: string;
  name: string;
  description: string;
  approval: ApprovalKind;
  ok: boolean;
  error?: string;
}

interface PluginDefinition {
  name: string;
  description: string;
  parameters?: JsonSchema;
  approval?: ApprovalKind;
  run?: (input: Record<string, unknown>, ctx: unknown) => Promise<unknown> | unknown;
  preview?: (input: Record<string, unknown>, ctx: unknown) => Promise<string | undefined> | string | undefined;
}

function normalizeResult(value: unknown): ToolResult {
  if (typeof value === 'string') return ok(value);
  if (value && typeof value === 'object') {
    const candidate = value as { ok?: unknown; content?: unknown; display?: unknown };
    if (typeof candidate.content === 'string') {
      return {
        ok: candidate.ok === undefined ? true : Boolean(candidate.ok),
        content: candidate.content,
        display: typeof candidate.display === 'string' ? candidate.display : undefined,
      };
    }
  }
  try {
    return ok(JSON.stringify(value));
  } catch {
    return ok(String(value));
  }
}

function toTool(definition: PluginDefinition, source: string): Tool {
  // 插件默认按 shell 权限走（默认 ask），不声明 approval 时不再静默放行。
  const approval: ApprovalKind = VALID_APPROVALS.includes(definition.approval as ApprovalKind)
    ? (definition.approval as ApprovalKind)
    : 'shell';
  const parameters: JsonSchema =
    definition.parameters && definition.parameters.type === 'object'
      ? definition.parameters
      : { type: 'object', properties: {}, additionalProperties: false };

  return {
    name: definition.name,
    description: definition.description || `插件工具（${source}）`,
    parameters,
    approval,
    async run(input, ctx) {
      try {
        if (!definition.run) throw new Error('插件没有导出 run 函数');
        return normalizeResult(await definition.run(input, ctx));
      } catch (error) {
        return fail(`插件 ${definition.name} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    ...(definition.preview
      ? {
          async preview(input, ctx) {
            try {
              return await definition.preview!(input, ctx);
            } catch {
              return undefined;
            }
          },
        }
      : {}),
  };
}

/**
 * 从目录加载插件工具。每个文件默认导出：
 *   { name, description, parameters, approval?, run(input, ctx), preview? }
 * 名称冲突或字段不合法会记进 errors，不影响其它插件。
 */
export async function loadPluginTools(
  dirs: string[],
  existingNames: Set<string> = new Set(),
): Promise<PluginLoadResult> {
  const tools: Tool[] = [];
  const errors: string[] = [];
  const plugins: PluginInfo[] = [];
  const seen = new Set(existingNames);

  for (const dir of dirs) {
    const absolute = resolve(dir);
    if (!existsSync(absolute)) continue;
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      errors.push(`${absolute}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile()) continue;
      if (!PLUGIN_EXTENSIONS.has(extname(entry.name))) continue;
      if (entry.name.endsWith('.test.mjs')) continue;
      const file = join(absolute, entry.name);
      const base: PluginInfo = {
        file,
        dir: absolute,
        name: entry.name,
        description: '',
        approval: 'shell',
        ok: false,
      };
      try {
        const module = (await import(pathToFileURL(file).href)) as { default?: unknown };
        const definition = (module.default ?? module) as PluginDefinition;
        if (!definition || typeof definition !== 'object') {
          base.error = '需要一个默认导出的对象';
          errors.push(`${entry.name}: ${base.error}`);
          plugins.push(base);
          continue;
        }
        if (typeof definition.name !== 'string' || !TOOL_NAME.test(definition.name)) {
          base.error = 'name 必须是字母开头的 1-64 位字母/数字/下划线';
          errors.push(`${entry.name}: ${base.error}`);
          plugins.push(base);
          continue;
        }
        base.name = definition.name;
        base.description = typeof definition.description === 'string' ? definition.description : '';
        base.approval = VALID_APPROVALS.includes(definition.approval as ApprovalKind)
          ? (definition.approval as ApprovalKind)
          : 'never';
        if (!definition.description || !definition.description.trim()) {
          base.error = '缺少 description';
          errors.push(`${entry.name}: ${base.error}`);
          plugins.push(base);
          continue;
        }
        if (typeof definition.run !== 'function') {
          base.error = '缺少 run(input, ctx) 函数';
          errors.push(`${entry.name}: ${base.error}`);
          plugins.push(base);
          continue;
        }
        if (seen.has(definition.name)) {
          base.error = `工具名 ${definition.name} 与已有工具冲突`;
          errors.push(`${entry.name}: ${base.error}`);
          plugins.push(base);
          continue;
        }
        seen.add(definition.name);
        tools.push(toTool(definition, entry.name));
        base.ok = true;
        plugins.push(base);
      } catch (error) {
        base.error = error instanceof Error ? error.message : String(error);
        errors.push(`${entry.name}: ${base.error}`);
        plugins.push(base);
      }
    }
  }

  return { tools, errors, plugins };
}

/** 生成插件模板，方便用户照着写。 */
export function pluginTemplate(name = 'my_tool'): string {
  return `// ${name}.mjs —— 放到 ~/.banana/tools/ 或 <项目>/.banana/tools/ 即可被加载
export default {
  name: '${name}',
  description: '一句话说明这个工具做什么，模型会据此决定是否调用',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '输入内容' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  // 权限类别：never / write / shell / network
  approval: 'never',
  async run(input, ctx) {
    return { ok: true, content: '处理结果: ' + String(input.text) };
  },
};
`;
}