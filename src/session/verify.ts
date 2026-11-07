import { spawn } from 'node:child_process';

export interface VerifyResult {
  command: string;
  ok: boolean;
  code: number | null;
  output: string;
  ms: number;
  timedOut?: boolean;
}

function runOne(command: string, workspace: string, timeoutMs: number): Promise<VerifyResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd: workspace,
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let output = '';
    let timedOut = false;
    const append = (chunk: Buffer | string): void => {
      if (output.length >= 100_000) return;
      output += String(chunk).slice(0, 100_000 - output.length);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // 已经退出
      }
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        command,
        ok: false,
        code: null,
        output: `${output}\n${error.message}`.trim(),
        ms: Date.now() - started,
        timedOut,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        command,
        ok: code === 0 && !timedOut,
        code,
        output: output.trim(),
        ms: Date.now() - started,
        timedOut,
      });
    });
  });
}

/** 顺序运行验收命令；任何一条失败都继续跑完，方便一次看全。 */
export async function runVerification(
  commands: string[],
  workspace: string,
  timeoutMs = 300_000,
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (const command of commands.map((item) => item.trim()).filter(Boolean)) {
    results.push(await runOne(command, workspace, timeoutMs));
  }
  return results;
}
