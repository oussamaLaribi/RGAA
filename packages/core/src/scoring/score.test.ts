import { describe, expect, it } from 'vitest';
import { computeScore, SCORING_VERSION, type RuleOutcome } from './score.js';

const outcome = (over: Partial<RuleOutcome> = {}): RuleOutcome => ({
  ruleId: 'rule',
  severity: 'serious',
  candidates: 10,
  failures: 0,
  ...over,
});

describe('computeScore', () => {
  it('gives a clean page a perfect score', () => {
    const score = computeScore([outcome(), outcome({ ruleId: 'other' })]);

    expect(score.value).toBe(100);
    expect(score.failedRules).toBe(0);
    expect(score.applicableRules).toBe(2);
  });

  it('ignores rules that had nothing to examine', () => {
    // A page with no tables must not be rewarded for "passing" table rules,
    // nor punished by them: they are simply not applicable.
    const score = computeScore([
      outcome({ ruleId: 'has-candidates', failures: 10 }),
      outcome({ ruleId: 'no-candidates', candidates: 0 }),
    ]);

    expect(score.applicableRules).toBe(1);
    expect(score.value).toBe(0);
  });

  it('reports 100 and zero applicable rules when the page yields no signal', () => {
    const score = computeScore([outcome({ candidates: 0 })]);

    expect(score.value).toBe(100);
    expect(score.applicableRules).toBe(0);
  });

  it('weights a critical failure more heavily than a minor one', () => {
    const critical = computeScore([
      outcome({ severity: 'critical', failures: 10 }),
      outcome({ ruleId: 'b', severity: 'minor' }),
    ]);
    const minor = computeScore([
      outcome({ severity: 'critical' }),
      outcome({ ruleId: 'b', severity: 'minor', failures: 10 }),
    ]);

    expect(critical.value).toBeLessThan(minor.value);
  });

  it('is independent of page size', () => {
    // The same proportion of failures on a small and a huge page must score the
    // same, otherwise scores are not comparable between pages at all.
    const small = computeScore([outcome({ candidates: 4, failures: 2 })]);
    const large = computeScore([outcome({ candidates: 400, failures: 200 })]);

    expect(small.value).toBe(large.value);
  });

  it('improves when some occurrences are fixed but the rule still fails', () => {
    // The progress signal: a developer who fixes 90 of 100 broken images must
    // see the number move, or the score is useless to work against.
    const before = computeScore([outcome({ candidates: 100, failures: 100 })]);
    const after = computeScore([outcome({ candidates: 100, failures: 10 })]);

    expect(after.value).toBeGreaterThan(before.value);
    expect(after.value).toBeLessThan(100);
  });

  it('never leaves the 0..100 range', () => {
    const worst = computeScore([
      outcome({ severity: 'critical', failures: 10 }),
      outcome({ ruleId: 'b', severity: 'serious', failures: 10 }),
      outcome({ ruleId: 'c', severity: 'minor', failures: 10 }),
    ]);

    expect(worst.value).toBe(0);
    expect(computeScore([outcome()]).value).toBe(100);
  });

  it('stamps the formula version and flags the result as automated only', () => {
    const score = computeScore([outcome()]);

    // Both travel with every score: the first because two scores from different
    // formulas are not comparable, the second because this is not a conformance
    // rate, which is a regulated figure established by human audit.
    expect(score.scoringVersion).toBe(SCORING_VERSION);
    expect(score.automatedOnly).toBe(true);
  });
});
