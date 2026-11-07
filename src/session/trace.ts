import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bananaHome } from '../config/config.ts';

export interface TraceEvent {
  at: string;
  type: string;
  [key: string]: unknown;
}

/** 每轮一份 JSONL trace，出问题可以按 session/turn 回放。 */
export class TraceWriter {
  readonly sessionId: string;
  readonly turnId: string;
  private events: TraceEvent[] = [];

  constructor(sessionId: string, turnId: string) {
    this.sessionId = sessionId;
    this.turnId = turnId;
  }

  add(type: string, data: Record<string, unknown> = {}): void {
    this.events.push({ at: new Date().toISOString(), type, ...data });
  }

  async finish(summary: Record<string, unknown> = {}): Promise<string | null> {
    try {
      const file = join(bananaHome(), 'traces', `${this.sessionId}-${this.turnId}.jsonl`);
      await mkdir(dirname(file), { recursive: true });
      const lines = [
        ...this.events.map((event) => JSON.stringify(event)),
        JSON.stringify({ at: new Date().toISOString(), type: 'finish', ...summary }),
      ];
      await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
      return file;
    } catch {
      return null;
    }
  }
}
