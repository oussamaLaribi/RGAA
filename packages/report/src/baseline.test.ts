import { describe, expect, it } from 'vitest';
import type { AuditResult, Severity, Violation, ViolationTarget } from '@rgaa-source/core';
import { compareToBaseline, hasBlockingRegression } from './baseline.js';

function target(over: Partial<ViolationTarget> = {}): ViolationTarget {
  return {
    selector: 'img',
    html: '<img src="a.png">',
    source: { file: 'src/app/app.html', line: 3, column: 3 },
    ...over,
  };
}

function run(violations: Violation[]): AuditResult[] {
  return [
    {
      url: '/',
      timestamp: '2026-08-20T10:00:00.000Z',
      engineVersion: '0.2.0',
      rgaaVersion: '4.1.2',
      violations,
      passedRuleIds: [],
      manualChecks: [],
      score: { value: 50, scoringVersion: 1, applicableRules: 5, failedRules: 1, automatedOnly: true },
      coverage: {
        version: '4.1.2',
        totalCriteria: 106,
        referenced: [],
        failing: [],
        needingReview: [],
        silent: 106,
      },
    },
  ];
}

function violation(
  ruleId: string,
  targets: ViolationTarget[],
  severity: Severity = 'critical',
): Violation {
  return {
    ruleId,
    severity,
    message: ruleId,
    help: '',
    recommendation: '',
    wcag: [],
    rgaa: [],
    origin: 'axe',
    targets,
  };
}

describe('compareToBaseline', () => {
  it('reports nothing new when nothing changed', () => {
    const before = run([violation('image-alt', [target()])]);
    const comparison = compareToBaseline(before, before);

    expect(comparison.introduced).toEqual([]);
    expect(comparison.carried).toBe(1);
  });

  /**
   * The property the whole CI story rests on.
   *
   * Keying an occurrence on its line number would report every untouched
   * violation as newly introduced the moment someone adds an import above it —
   * and a gate that cries wolf is a gate that gets deleted.
   */
  it('does not mistake a shifted line for a new violation', () => {
    const before = run([violation('image-alt', [target({ source: { file: 'a.html', line: 3, column: 3 } })])]);
    const after = run([violation('image-alt', [target({ source: { file: 'a.html', line: 47, column: 3 } })])]);

    expect(compareToBaseline(after, before).introduced).toEqual([]);
  });

  it('sees a genuinely new occurrence in the same file', () => {
    const before = run([violation('image-alt', [target()])]);
    const after = run([
      violation('image-alt', [
        target(),
        target({ html: '<img src="b.png">', source: { file: 'src/app/app.html', line: 9, column: 3 } }),
      ]),
    ]);

    const comparison = compareToBaseline(after, before);
    expect(comparison.introduced).toHaveLength(1);
    expect(comparison.introduced[0]?.line).toBe(9);
  });

  it('reports what was fixed as well as what was added', () => {
    const before = run([violation('image-alt', [target()])]);
    const after = run([violation('link-name', [target({ html: '<a></a>', selector: 'a' })])]);

    const comparison = compareToBaseline(after, before);
    expect(comparison.introduced).toHaveLength(1);
    expect(comparison.resolved).toHaveLength(1);
    expect(comparison.resolved[0]?.ruleId).toBe('image-alt');
  });

  it('tells the same markup in two files apart', () => {
    const before = run([violation('image-alt', [target({ source: { file: 'a.html', line: 1, column: 1 } })])]);
    const after = run([violation('image-alt', [target({ source: { file: 'b.html', line: 1, column: 1 } })])]);

    expect(compareToBaseline(after, before).introduced).toHaveLength(1);
  });
});

describe('hasBlockingRegression', () => {
  it('stops the pipeline on a newly introduced serious failure', () => {
    const before = run([]);
    const after = run([violation('image-alt', [target()], 'serious')]);

    expect(hasBlockingRegression(compareToBaseline(after, before))).toBe(true);
  });

  it('lets a minor one through', () => {
    // The gate exists to stop real harm reaching production, not to block a
    // merge over a missing autocomplete token.
    const before = run([]);
    const after = run([violation('rgaa-missing-autocomplete', [target()], 'minor')]);

    expect(hasBlockingRegression(compareToBaseline(after, before))).toBe(false);
  });

  it('does not fire on violations that were already there', () => {
    const before = run([violation('image-alt', [target()], 'critical')]);
    expect(hasBlockingRegression(compareToBaseline(before, before))).toBe(false);
  });
});
