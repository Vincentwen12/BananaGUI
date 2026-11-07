import type { TodoItem } from '../tools/types.ts';

/** 按计划项首次出现的顺序返回阶段名。 */
export function planPhases(items: TodoItem[]): string[] {
  const phases: string[] = [];
  for (const item of items) {
    const phase = item.phase?.trim();
    if (phase && !phases.includes(phase)) phases.push(phase);
  }
  return phases;
}

export function phaseItems(items: TodoItem[], phase: string): TodoItem[] {
  return items.filter((item) => item.phase === phase);
}

export function phaseDependencies(items: TodoItem[], phase: string): string[] {
  const deps = new Set<string>();
  for (const item of phaseItems(items, phase)) {
    for (const dep of item.dependsOn ?? []) {
      if (dep && dep !== phase) deps.add(dep);
    }
  }
  return [...deps];
}

/** 判断能否从 current 进入 target：当前阶段完成 + 目标依赖阶段完成。 */
export function canAdvance(
  items: TodoItem[],
  current: string | undefined,
  target: string,
): { ok: boolean; reason?: string } {
  const phases = planPhases(items);
  if (!phases.includes(target)) return { ok: false, reason: `未知阶段「${target}」` };
  if (current && current !== target) {
    const unfinished = phaseItems(items, current).filter((item) => item.status !== 'done');
    if (unfinished.length) {
      return { ok: false, reason: `当前阶段「${current}」还有 ${unfinished.length} 项未完成` };
    }
  }
  for (const dep of phaseDependencies(items, target)) {
    if (!phases.includes(dep)) {
      return { ok: false, reason: `目标阶段依赖了不存在的阶段「${dep}」` };
    }
    if (phaseItems(items, dep).some((item) => item.status !== 'done')) {
      return { ok: false, reason: `依赖阶段「${dep}」尚未完成` };
    }
  }
  return { ok: true };
}

export function nextPhase(items: TodoItem[], current: string | undefined): string | null {
  const phases = planPhases(items);
  if (!phases.length) return null;
  const index = current ? phases.indexOf(current) : -1;
  return phases[index + 1] ?? null;
}
