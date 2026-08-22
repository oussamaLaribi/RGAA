import { parseSourceLocation, SOURCE_ATTRIBUTE } from '../types/source-location.js';
import type { Severity } from '../types/severity.js';
import type { ManualCheck, Violation, ViolationTarget } from '../types/violation.js';
import type { RuleOutcome } from '../scoring/score.js';
import { computeScore } from '../scoring/score.js';
import { wcagCriteriaFromTags } from '../mapping/wcag.js';
import { rgaaCriteriaFor } from '../mapping/rgaa.js';
import { computeCoverage } from '../mapping/coverage.js';
import { ENGINE_VERSION, RGAA_VERSION } from '../version.js';
import type { AuditResult } from '../types/audit-result.js';
import type { RawAxeReport, RawNode, RawRuleResult } from './collect.js';
import type { RawCustomNode, RawCustomReport, RawCustomResult } from '../rules/browser-entry.js';

/**
 * axe's impact values happen to match our severities one for one today. Mapped
 * explicitly anyway, so an unexpected value degrades to a defined severity
 * rather than silently producing an invalid one.
 */
const SEVERITY_BY_IMPACT: Record<string, Severity> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

function severityOf(rule: RawRuleResult): Severity {
  return (rule.impact && SEVERITY_BY_IMPACT[rule.impact]) || 'moderate';
}

/** Longest single-line snippet kept for display. */
const MAX_HTML = 200;

/**
 * Attributes that exist only in the rendered page, never in anyone's source.
 *
 * Angular stamps `_ngcontent-*` and `_nghost-*` onto every element for style
 * encapsulation, and `ng-reflect-*` in development builds. Left in, a snippet
 * reads as markup the developer wrote — sending them looking for an attribute
 * they cannot find, in the one part of the report meant to help them recognise
 * their own code.
 */
const GENERATED_ATTRIBUTES = [/^_ngcontent-/, /^_nghost-/, /^ng-reflect-/];

function isGenerated(name: string, sourceAttribute: string): boolean {
  return name === sourceAttribute || GENERATED_ATTRIBUTES.some((pattern) => pattern.test(name));
}

/**
 * Strip framework and instrumentation noise from the snippet shown to a developer.
 *
 * Scans the string rather than parsing it: what arrives is a truncated fragment
 * from axe, which is frequently not well-formed, and a parser would either throw
 * or silently rewrite the very markup we are trying to show verbatim.
 */
export function stripSourceAttribute(html: string, attribute = SOURCE_ATTRIBUTE): string {
  // ` name="value"` or a bare ` name`, tolerating single quotes.
  const pattern = /\s+([-\w:]+)(?:=(?:"[^"]*"|'[^']*'|[^\s>]*))?/g;

  return html.replace(pattern, (match, name: string) =>
    isGenerated(name, attribute) ? '' : match,
  );
}

function toTarget(node: RawNode): ViolationTarget {
  const html = stripSourceAttribute(node.html);

  return {
    // axe nests selectors per frame; the last entry is the one inside the
    // deepest frame, which is the element itself.
    selector: node.target[node.target.length - 1] ?? '',
    html: html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}…` : html,
    source: parseSourceLocation(node.source),
  };
}

function toViolation(rule: RawRuleResult): Violation {
  const wcag = wcagCriteriaFromTags(rule.tags);

  return {
    ruleId: rule.id,
    severity: severityOf(rule),
    message: rule.help,
    help: rule.description,
    // axe's per-node summary is the closest thing it gives to a fix; real
    // recommendations arrive with our own rules.
    recommendation: rule.nodes[0]?.failureSummary ?? rule.help,
    wcag,
    rgaa: rgaaCriteriaFor({ ruleId: rule.id, wcag, tags: rule.tags }).criteria,
    targets: rule.nodes.map(toTarget),
    origin: 'axe',
  };
}

function toManualCheck(rule: RawRuleResult): ManualCheck {
  const wcag = wcagCriteriaFromTags(rule.tags);

  return {
    ruleId: rule.id,
    question: rule.help,
    wcag,
    rgaa: rgaaCriteriaFor({ ruleId: rule.id, wcag, tags: rule.tags }).criteria,
    targets: rule.nodes.map(toTarget),
  };
}

/**
 * Per-rule tallies for the score.
 *
 * The denominator is every element a rule actually looked at — failures plus
 * passes plus the ones it could not decide — so a page with no tables is neither
 * rewarded nor punished by table rules. Rules axe reports as inapplicable
 * contribute nothing and are simply absent.
 */
function toOutcomes(report: RawAxeReport): RuleOutcome[] {
  const outcomes = new Map<string, RuleOutcome>();

  const add = (rule: RawRuleResult, failed: boolean): void => {
    const existing = outcomes.get(rule.id) ?? {
      ruleId: rule.id,
      severity: severityOf(rule),
      candidates: 0,
      failures: 0,
    };

    existing.candidates += rule.nodes.length;
    if (failed) {
      existing.failures += rule.nodes.length;
      // A rule appearing in violations carries a real impact; a passing entry
      // reports none, so let the failing side define the severity.
      existing.severity = severityOf(rule);
    }
    outcomes.set(rule.id, existing);
  };

  for (const rule of report.violations) add(rule, true);
  for (const rule of report.passes) add(rule, false);
  for (const rule of report.incomplete) add(rule, false);

  return [...outcomes.values()];
}

function customTarget(node: RawCustomNode): ViolationTarget {
  const html = stripSourceAttribute(node.html);

  return {
    selector: node.selector,
    html: html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}…` : html,
    source: parseSourceLocation(node.source),
    ...(node.data ? { data: node.data } : {}),
  };
}

/**
 * Our own rules declare their RGAA criteria, so nothing is inferred here.
 *
 * Each was written against a specific criterion; routing them back through WCAG
 * would only lose the precision they were written with.
 */
function toCustomViolation(result: RawCustomResult): Violation {
  return {
    ruleId: result.ruleId,
    severity: result.severity,
    message: result.nodes[0]?.message ?? result.message,
    help: result.help,
    recommendation: result.recommendation,
    wcag: result.wcag,
    rgaa: result.rgaa,
    targets: result.nodes.map(customTarget),
    origin: 'custom',
  };
}

function toCustomManualCheck(result: RawCustomResult): ManualCheck {
  return {
    ruleId: result.ruleId,
    question: result.message,
    wcag: result.wcag,
    rgaa: result.rgaa,
    targets: result.nodes.map(customTarget),
  };
}

/**
 * Score contributions from our rules.
 *
 * Review rules are left out entirely rather than counted as passing: they never
 * establish a failure, so including them would quietly inflate every score by
 * padding the denominator with checks that can only ever come back clean.
 */
function customOutcomes(results: readonly RawCustomResult[]): RuleOutcome[] {
  return results
    .filter((result) => !result.review && result.candidates > 0)
    .map((result) => ({
      ruleId: result.ruleId,
      severity: result.severity,
      candidates: result.candidates,
      failures: result.nodes.length,
    }));
}

export interface NormalizeOptions {
  /** Overrides the page URL, e.g. to record the route rather than the served address. */
  url?: string;
  timestamp?: string;
  /** Findings from our own rules, run alongside axe in the same page. */
  custom?: RawCustomReport;
}

/** Turn a raw page report into the result every consumer of this engine speaks. */
export function normalizeReport(
  report: RawAxeReport,
  options: NormalizeOptions = {},
): AuditResult {
  const custom = options.custom?.results ?? [];
  const failing = custom.filter((result) => !result.review && result.nodes.length > 0);
  const forReview = custom.filter((result) => result.review && result.nodes.length > 0);

  const violations = [...report.violations.map(toViolation), ...failing.map(toCustomViolation)];
  const manualChecks = [
    ...report.incomplete.map(toManualCheck),
    ...forReview.map(toCustomManualCheck),
  ];

  // Passing rules count towards coverage too: a criterion that was checked and
  // found sound is something this run can legitimately say, and leaving it out
  // would understate what was actually examined.
  const customPassing = custom
    .filter((result) => !result.review && result.candidates > 0 && result.nodes.length === 0)
    .flatMap((result) => result.rgaa);

  const passing = report.passes.flatMap(
    (rule) =>
      rgaaCriteriaFor({ ruleId: rule.id, wcag: wcagCriteriaFromTags(rule.tags), tags: rule.tags })
        .criteria,
  );

  return {
    url: options.url ?? report.url,
    timestamp: options.timestamp ?? new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    rgaaVersion: RGAA_VERSION,
    violations,
    passedRuleIds: report.passes.map((rule) => rule.id).sort(),
    manualChecks,
    score: computeScore([...toOutcomes(report), ...customOutcomes(custom)]),
    coverage: computeCoverage({
      failing: violations.flatMap((violation) => violation.rgaa),
      passing: [...passing, ...customPassing],
      needingReview: manualChecks.flatMap((check) => check.rgaa),
    }),
  };
}
