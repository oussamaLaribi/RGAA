import type { Violation, ManualCheck } from './violation.js';
import type { Score } from '../scoring/score.js';
import type { RgaaCoverage } from '../mapping/coverage.js';

export interface AuditResult {
  url: string;
  /** ISO 8601. */
  timestamp: string;
  /**
   * Version of the rule engine that produced this result.
   *
   * Recorded on every audit because scores are only comparable within one engine
   * version: adding rules mechanically lowers scores, and without this field a
   * user would read an engine upgrade as a regression in their own site.
   */
  engineVersion: string;
  /** Version of the RGAA reference frame the mapping was built against. */
  rgaaVersion: string;
  violations: Violation[];
  /** Rule ids that ran and found nothing wrong. */
  passedRuleIds: string[];
  manualChecks: ManualCheck[];
  score: Score;
  /** What this run could and could not say about the 106 RGAA criteria. */
  coverage: RgaaCoverage;
}
