import type { Severity } from '../types/severity.js';

/**
 * Everything a rule is allowed to touch. Passing the document in rather than
 * reaching for a global keeps rules runnable inside a content script, inside
 * Playwright, and inside a unit test with equal ease.
 */
export interface RuleContext {
  document: Document;
  window: Window & typeof globalThis;
}

export interface RuleFinding {
  element: Element;
  /** Overrides the rule's default message when a rule needs to be specific. */
  message?: string;
  /**
   * What the rule worked out, in a form a fixer can act on.
   *
   * Carrying the detected value here rather than only in the message keeps the
   * fix from having to parse prose back into data, which would break the moment
   * the wording changed.
   */
  data?: Record<string, string>;
}

export interface RuleResult {
  /**
   * How many elements the rule actually examined.
   *
   * Reported separately from the findings because the score needs a denominator:
   * a page with no radio groups must be neither rewarded nor punished by a rule
   * about radio groups. Zero candidates means the rule was not applicable.
   */
  candidates: number;
  findings: RuleFinding[];
}

/**
 * A rule the engine can run. Adding one must never require touching the scanner,
 * so everything needed to build a result lives on the rule itself.
 */
export interface AccessibilityRule {
  id: string;
  severity: Severity;
  /** WCAG success criteria this rule tests. */
  wcag: string[];
  /**
   * RGAA criteria, declared rather than inferred.
   *
   * Our own rules are written against a specific criterion, so there is nothing
   * to derive: going back through WCAG would only lose the precision the rule
   * was written with.
   */
  rgaa: string[];
  /** What is wrong, in one sentence. */
  message: string;
  /** Why it matters, for a developer who is not an accessibility expert. */
  help: string;
  /** What to do about it. */
  recommendation: string;
  /**
   * True when the rule can only narrow the search for a human.
   *
   * Some criteria turn on judgements no check can make — whether a link's
   * wording is explicit enough in its context, for instance. Reporting those as
   * failures would be wrong; reporting them as places to look is useful. They
   * become manual checks rather than violations.
   */
  review?: boolean;
  run(context: RuleContext): RuleResult;
}
