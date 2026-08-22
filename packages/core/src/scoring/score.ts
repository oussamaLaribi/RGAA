import { SEVERITY_WEIGHT, type Severity } from '../types/severity.js';

/**
 * Bumped whenever the formula changes. Stored alongside every score, because two
 * scores computed by different formula versions are not comparable.
 */
export const SCORING_VERSION = 1;

/**
 * Share of a rule's cost charged as soon as it fails at all, the rest being
 * charged in proportion to how many of its candidate elements fail.
 *
 * A flat "failed rules over applicable rules" score never moves when a developer
 * fixes 90 of 100 broken images, which makes it useless as a progress signal.
 * Scaling the whole cost by density instead would make one broken image on a
 * huge page nearly free. Splitting it keeps both properties.
 */
const BASE_COST_SHARE = 0.5;

export interface RuleOutcome {
  ruleId: string;
  severity: Severity;
  /** Elements the rule examined. A rule with no candidates is not applicable. */
  candidates: number;
  /** Elements that failed. Zero means the rule passed. */
  failures: number;
}

export interface Score {
  /** 0–100, rounded to the nearest integer. */
  value: number;
  scoringVersion: number;
  /** Rules that had something to examine on this page. */
  applicableRules: number;
  failedRules: number;
  /**
   * Automated coverage is a fraction of RGAA. Carried with the score so the UI
   * can never present it as a conformance rate, which is a regulated figure
   * established by human audit.
   */
  automatedOnly: true;
}

/**
 * Weighted, deterministic, page-size independent.
 *
 * A rule is only counted when it had candidate elements on the page, so a score
 * is not diluted by rules that had nothing to say. Cost is charged per rule
 * rather than per occurrence: five hundred missing alt attributes is one broken
 * rule, not a hundred times the damage of five — the issue list still reports
 * every occurrence.
 */
export function computeScore(outcomes: readonly RuleOutcome[]): Score {
  const applicable = outcomes.filter((o) => o.candidates > 0);

  // Nothing to measure. Report a perfect score rather than 0/0, and let
  // `applicableRules: 0` tell the caller the page yielded no signal.
  if (applicable.length === 0) {
    return {
      value: 100,
      scoringVersion: SCORING_VERSION,
      applicableRules: 0,
      failedRules: 0,
      automatedOnly: true,
    };
  }

  let totalWeight = 0;
  let penalty = 0;
  let failedRules = 0;

  for (const outcome of applicable) {
    const weight = SEVERITY_WEIGHT[outcome.severity];
    totalWeight += weight;
    if (outcome.failures === 0) continue;

    failedRules++;
    const density = Math.min(outcome.failures / outcome.candidates, 1);
    penalty += weight * (BASE_COST_SHARE + (1 - BASE_COST_SHARE) * density);
  }

  return {
    value: Math.round(100 * (1 - penalty / totalWeight)),
    scoringVersion: SCORING_VERSION,
    applicableRules: applicable.length,
    failedRules,
    automatedOnly: true,
  };
}
