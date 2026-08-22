import { writeFile } from 'node:fs/promises';
import type { FixPlan } from './plan.js';

export * from './types.js';
export * from './edits.js';
export { FIXERS, fixerFor } from './fixers.js';
export { planFixes, type FixPlan, type FilePlan, type PlanOptions } from './plan.js';
export { formatDiff, type DiffOptions } from './diff.js';

/**
 * Write a plan to disk.
 *
 * Separate from `planFixes` on purpose: producing the edits and committing them
 * are different decisions, and everything between the two — showing the diff,
 * checking the tree is recoverable, letting the caller refuse — happens in that
 * gap.
 */
export async function writePlan(plan: FixPlan): Promise<number> {
  await Promise.all(plan.files.map((file) => writeFile(file.absolutePath, file.fixed, 'utf8')));
  return plan.files.reduce((total, file) => total + file.applied.length, 0);
}
