import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UMessage } from '../providers/types.ts';
import type { ReasoningLevel } from '../providers/reasoning.ts';
import type { TodoItem } from '../tools/types.ts';

export type AgentMode = 'plan' | 'build';

export interface SessionPlan {
  status: 'pending' | 'approved' | 'cancelled';
  items: TodoItem[];
  summary?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  /** 估算花费（美元），价格未知时为 0。 */
  costUsd?: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider?: string;
  model?: string;
  messages: UMessage[];
  /** 任务清单（todo_* 工具维护）。 */
  todos?: TodoItem[];
  /** 会话累计 token 用量。 */
  usage?: SessionUsage;
  /** Plan 只读调研，Build 允许写文件和执行命令。 */
  mode?: AgentMode;
  /** 思考强度，默认 standard。 */
  reasoning?: ReasoningLevel;
  /** auto 允许模型生成标题；user 表示用户手动改过，不再覆盖。 */
  titleSource?: 'auto' | 'user';
  /** Plan 模式下生成、等待用户批准的计划。 */
  plan?: SessionPlan;
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  turns: number;
  preview: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function newSessionId(now = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suffix}`;
}

export function deriveTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '新对话';
  return flat.length > 42 ? `${flat.slice(0, 42)}…` : flat;
}

export class SessionStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private pathOf(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`非法的会话 id: ${id}`);
    return join(this.dir, `${id}.json`);
  }

  async ensure(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  create(title = '新对话'): Session {
    const now = new Date().toISOString();
    return {
      id: newSessionId(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      todos: [],
      mode: 'build',
      reasoning: 'standard',
      titleSource: 'auto',
    };
  }

  async save(session: Session): Promise<void> {
    await this.ensure();
    session.updatedAt = new Date().toISOString();
    const target = this.pathOf(session.id);
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    await rename(temp, target);
  }

  async load(id: string): Promise<Session | null> {
    const path = this.pathOf(id);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as Session;
      return {
        ...parsed,
        messages: parsed.messages ?? [],
        todos: parsed.todos ?? [],
        mode: parsed.mode === 'plan' ? 'plan' : 'build',
        reasoning:
          parsed.reasoning === 'fast' || parsed.reasoning === 'deep' ? parsed.reasoning : 'standard',
        titleSource: parsed.titleSource === 'user' ? 'user' : 'auto',
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<SessionSummary[]> {
    if (!existsSync(this.dir)) return [];
    const files = (await readdir(this.dir)).filter((name) => name.endsWith('.json'));
    const summaries: SessionSummary[] = [];
    for (const file of files) {
      try {
        const parsed = JSON.parse(await readFile(join(this.dir, file), 'utf8')) as Session;
        const lastUser = [...(parsed.messages ?? [])].reverse().find((message) => message.role === 'user');
        summaries.push({
          id: parsed.id,
          title: parsed.title || deriveTitle(lastUser?.content ?? ''),
          updatedAt: parsed.updatedAt ?? parsed.createdAt ?? '',
          createdAt: parsed.createdAt ?? '',
          turns: (parsed.messages ?? []).filter((message) => message.role === 'user').length,
          preview: (lastUser?.content ?? '').replace(/\s+/g, ' ').slice(0, 80),
        });
      } catch {
        // 跳过损坏的会话文件
      }
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return summaries;
  }

  /** 支持 id 前缀、序号（/use 3）或标题模糊匹配。 */
  async find(query: string): Promise<Session | null> {
    const sessions = await this.list();
    const needle = query.trim().toLowerCase();
    if (!needle) return null;

    const byIndex = /^\d+$/.test(needle) ? sessions[Number(needle) - 1] : undefined;
    const candidates = [byIndex, ...sessions].filter((item): item is SessionSummary => Boolean(item));
    const match =
      candidates.find((item) => item.id.toLowerCase() === needle) ??
      candidates.find((item) => item.id.toLowerCase().startsWith(needle)) ??
      candidates.find((item) => item.title.toLowerCase().includes(needle));

    return match ? this.load(match.id) : null;
  }

  async remove(id: string): Promise<boolean> {
    const path = this.pathOf(id);
    if (!existsSync(path)) return false;
    await unlink(path);
    return true;
  }

  /** 返回最近一次更新且有内容的会话 id。 */
  async lastActive(): Promise<string | null> {
    const sessions = await this.list();
    // 必须用「最近更新的会话」，包括刚建好的空会话。
    // 以前写的是「优先找有消息的会话」，结果新建对话后第一次发消息会被悄悄塞进上一个旧对话。
    return sessions[0]?.id ?? null;
  }
}