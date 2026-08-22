import type { FilePlan } from './plan.js';

/**
 * Render what a fix plan would change.
 *
 * Shown in full before anything is written. Editing someone's source
 * automatically is only defensible if every change can be read first, so the
 * diff has to be trustworthy — one that marks unchanged lines as changed
 * teaches people to skim past it, which defeats the point.
 */
export interface DiffOptions {
  /** Lines of unchanged context on each side of a change. */
  context?: number;
}

type Operation = 'equal' | 'delete' | 'insert';

interface Change {
  operation: Operation;
  text: string;
  /** 1-based line number in the original file, for `equal` and `delete`. */
  before: number | null;
  /** 1-based line number in the fixed file, for `equal` and `insert`. */
  after: number | null;
}

/**
 * Longest common subsequence over lines.
 *
 * A naive line-by-line comparison is wrong as soon as a fix inserts or removes a
 * line — everything below shifts and reads as changed. Templates are small
 * enough that the quadratic table costs nothing, and being exact matters more
 * here than being fast.
 */
function diffLines(before: readonly string[], after: readonly string[]): Change[] {
  const rows = before.length;
  const columns = after.length;

  // table[i][j] = LCS length of before[i..] and after[j..]
  const table = new Int32Array((rows + 1) * (columns + 1));
  const at = (i: number, j: number): number => i * (columns + 1) + j;

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[at(i, j)] =
        before[i] === after[j]
          ? table[at(i + 1, j + 1)]! + 1
          : Math.max(table[at(i + 1, j)]!, table[at(i, j + 1)]!);
    }
  }

  const changes: Change[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < columns) {
    if (before[i] === after[j]) {
      changes.push({ operation: 'equal', text: before[i]!, before: i + 1, after: j + 1 });
      i++;
      j++;
    } else if (table[at(i + 1, j)]! >= table[at(i, j + 1)]!) {
      changes.push({ operation: 'delete', text: before[i]!, before: i + 1, after: null });
      i++;
    } else {
      changes.push({ operation: 'insert', text: after[j]!, before: null, after: j + 1 });
      j++;
    }
  }
  while (i < rows) {
    changes.push({ operation: 'delete', text: before[i]!, before: i + 1, after: null });
    i++;
  }
  while (j < columns) {
    changes.push({ operation: 'insert', text: after[j]!, before: null, after: j + 1 });
    j++;
  }

  return changes;
}

/** Keep the changed lines and `context` unchanged lines around each run. */
function withContext(changes: readonly Change[], context: number): Change[][] {
  const interesting = changes
    .map((change, index) => (change.operation === 'equal' ? -1 : index))
    .filter((index) => index !== -1);
  if (interesting.length === 0) return [];

  const hunks: Change[][] = [];
  let start = Math.max(0, interesting[0]! - context);
  let end = Math.min(changes.length - 1, interesting[0]! + context);

  for (const index of interesting.slice(1)) {
    if (index - context <= end + 1) {
      end = Math.min(changes.length - 1, index + context);
      continue;
    }
    hunks.push(changes.slice(start, end + 1));
    start = Math.max(0, index - context);
    end = Math.min(changes.length - 1, index + context);
  }
  hunks.push(changes.slice(start, end + 1));

  return hunks;
}

const MARKER: Record<Operation, string> = { equal: ' ', delete: '-', insert: '+' };

export function formatDiff(plan: FilePlan, options: DiffOptions = {}): string[] {
  const context = options.context ?? 1;
  const changes = diffLines(plan.original.split('\n'), plan.fixed.split('\n'));
  const lines: string[] = [];

  for (const hunk of withContext(changes, context)) {
    for (const change of hunk) {
      // Deleted lines are numbered in the original, everything else in the
      // result: the numbers a developer will see once the file is written.
      const number = change.operation === 'delete' ? change.before : change.after;
      lines.push(
        `    ${String(number ?? '').padStart(4)} ${MARKER[change.operation]} ${change.text}`,
      );
    }
  }

  return lines;
}
