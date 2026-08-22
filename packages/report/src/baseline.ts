import type { AuditResult, Severity, Violation, ViolationTarget } from '@rgaa-source/core';

export interface Occurrence {
  key: string;
  ruleId: string;
  severity: Severity;
  message: string;
  url: string;
  file: string | null;
  line: number | null;
  column: number | null;
}

export interface BaselineComparison {
  /** Occurrences present now that were not in the baseline. */
  introduced: Occurrence[];
  /** Occurrences in the baseline that are gone. */
  resolved: Occurrence[];
  /** Occurrences present in both. */
  carried: number;
}

/**
 * Identity of a single violation occurrence, stable between runs.
 *
 * Built from the rule, the file and the markup rather than the line number.
 * A line number moves whenever anything above it is edited, which would report
 * every untouched violation as newly introduced the first time someone adds an
 * import — and a CI gate that cries wolf is a CI gate that gets removed.
 */
function occurrenceKey(
  violation: Violation,
  target: ViolationTarget,
  url: string,
): string {
  const where = target.source?.file ?? url;
  const what = target.html.replace(/\s+/g, ' ').trim() || target.selector;
  return `${violation.ruleId}::${where}::${what}`;
}

function occurrencesOf(results: readonly AuditResult[]): Map<string, Occurrence> {
  const found = new Map<string, Occurrence>();

  for (const result of results) {
    for (const violation of result.violations) {
      for (const target of violation.targets) {
        const key = occurrenceKey(violation, target, result.url);
        if (found.has(key)) continue;

        found.set(key, {
          key,
          ruleId: violation.ruleId,
          severity: violation.severity,
          message: violation.message,
          url: result.url,
          file: target.source?.file ?? null,
          line: target.source?.line ?? null,
          column: target.source?.column ?? null,
        });
      }
    }
  }

  return found;
}

/**
 * Compare a run against a recorded baseline.
 *
 * What makes the tool adoptable on a codebase that already has hundreds of
 * violations: nobody can fix them all before the next release, but everybody can
 * agree not to add more. Failing only on what is new turns an unusable gate into
 * one a team will actually keep switched on.
 */
export function compareToBaseline(
  results: readonly AuditResult[],
  baseline: readonly AuditResult[],
): BaselineComparison {
  const now = occurrencesOf(results);
  const before = occurrencesOf(baseline);

  const introduced = [...now.values()].filter((entry) => !before.has(entry.key));
  const resolved = [...before.values()].filter((entry) => !now.has(entry.key));

  return {
    introduced,
    resolved,
    carried: now.size - introduced.length,
  };
}

/** Severities that should stop a pipeline when newly introduced. */
export const BLOCKING_SEVERITIES: readonly Severity[] = ['critical', 'serious'];

export function hasBlockingRegression(comparison: BaselineComparison): boolean {
  return comparison.introduced.some((entry) => BLOCKING_SEVERITIES.includes(entry.severity));
}
