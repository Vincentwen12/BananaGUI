import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

export interface FileChange {
  /** 绝对路径 */
  path: string;
  /** 相对工作区，仅用于展示 */
  relative: string;
  /** 改动前是否存在（false 表示这是新建文件） */
  existed: boolean;
  /** 备份文件名（相对 turn 目录），新建文件为空 */
  backup?: string;
  /** 文件太大、没有生成备份；undo 时不能恢复，只能提示。 */
  skipped?: boolean;
  /** 原始文件大小，用于展示。 */
  bytes?: number;
  reason?: 'too_large';
}

export interface TurnRecord {
  turnId: string;
  at: string;
  changes: FileChange[];
}

interface Manifest {
  turns: TurnRecord[];
}

const MAX_TURNS = 30;
const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

/** 每轮把被工具改写的文件快照到 ~/.banana/backups/<sessionId>/，供 /undo 回滚。 */
export class BackupStore {
  readonly dir: string;
  readonly sessionId: string;

  constructor(dir: string, sessionId: string) {
    this.dir = join(dir, sessionId);
    this.sessionId = sessionId;
  }

  private manifestPath(): string {
    return join(this.dir, 'manifest.json');
  }

  private turnDir(turnId: string): string {
    return join(this.dir, turnId);
  }

  async load(): Promise<Manifest> {
    if (!existsSync(this.manifestPath())) return { turns: [] };
    try {
      const parsed = JSON.parse(await readFile(this.manifestPath(), 'utf8')) as Manifest;
      return { turns: Array.isArray(parsed.turns) ? parsed.turns : [] };
    } catch {
      return { turns: [] };
    }
  }

  async lastTurn(): Promise<TurnRecord | null> {
    const manifest = await this.load();
    return manifest.turns[manifest.turns.length - 1] ?? null;
  }

  async beginTurn(turnId: string, workspace: string): Promise<ChangeRecorder> {
    await mkdir(this.turnDir(turnId), { recursive: true });
    return new ChangeRecorder(this, turnId, workspace);
  }

  async saveTurn(record: TurnRecord): Promise<void> {
    if (record.changes.length === 0) {
      await rm(this.turnDir(record.turnId), { recursive: true, force: true });
      return;
    }
    await mkdir(this.dir, { recursive: true });
    const manifest = await this.load();
    manifest.turns.push(record);
    const removed = manifest.turns.splice(0, Math.max(0, manifest.turns.length - MAX_TURNS));
    for (const turn of removed) {
      await rm(this.turnDir(turn.turnId), { recursive: true, force: true }).catch(() => {});
    }
    const target = this.manifestPath();
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(temp, target);
  }

  /** 回滚最近一轮改动，返回恢复/删除/跳过的文件数。 */
  async undo(): Promise<{
    restored: number;
    deleted: number;
    skipped: string[];
    turn: TurnRecord | null;
  }> {
    const manifest = await this.load();
    const turn = manifest.turns.pop();
    if (!turn) return { restored: 0, deleted: 0, skipped: [], turn: null };

    let restored = 0;
    let deleted = 0;
    const skipped: string[] = [];
    for (const change of turn.changes) {
      try {
        if (change.skipped) {
          skipped.push(change.relative);
          continue;
        }
        if (change.existed && change.backup) {
          const source = join(this.turnDir(turn.turnId), change.backup);
          if (!existsSync(source)) continue;
          await mkdir(dirname(change.path), { recursive: true });
          await copyFile(source, change.path);
          restored += 1;
        } else {
          await rm(change.path, { force: true });
          deleted += 1;
        }
      } catch {
        // 单个文件失败不影响其它文件的回滚
      }
    }

    const target = this.manifestPath();
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(temp, target);
    await rm(this.turnDir(turn.turnId), { recursive: true, force: true }).catch(() => {});

    return { restored, deleted, skipped, turn };
  }

  /** 清理会话的所有备份（删除会话时调用）。 */
  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 一轮对话内的改动记录器；同一个文件只记录第一次修改前的内容。 */
export class ChangeRecorder {
  private store: BackupStore;
  readonly turnId: string;
  private workspace: string;
  readonly changes: FileChange[] = [];
  private recorded = new Map<string, FileChange>();

  constructor(store: BackupStore, turnId: string, workspace: string) {
    this.store = store;
    this.turnId = turnId;
    this.workspace = workspace;
  }

  async record(target: string, before: string | null): Promise<void> {
    if (this.recorded.has(target)) return;
    const change: FileChange = {
      path: target,
      relative: relative(this.workspace, target) || basename(target),
      existed: before !== null,
    };
    if (before !== null) {
      const bytes = Buffer.byteLength(before);
      if (bytes > MAX_BACKUP_BYTES) {
        // 仍然记录这次改动，让 /undo 能明确告诉用户「这个文件没备份，无法恢复」。
        change.skipped = true;
        change.bytes = bytes;
        change.reason = 'too_large';
        this.recorded.set(target, change);
        this.changes.push(change);
        return;
      }
      const backupName = `${this.recorded.size}.bak`;
      const dir = join(this.store.dir, this.turnId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, backupName), before, 'utf8');
      change.backup = backupName;
    }
    this.recorded.set(target, change);
    this.changes.push(change);
  }

  async commit(): Promise<void> {
    if (this.changes.length === 0) return;
    await this.store.saveTurn({
      turnId: this.turnId,
      at: new Date().toISOString(),
      changes: this.changes,
    });
  }

  summary(): string {
    return this.changes
      .map((change) => `${change.existed ? '修改' : '新建'} ${change.relative}`)
      .join('、');
  }
}

export function newTurnId(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}