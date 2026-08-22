import type { Severity } from './severity.js';
import type { SourceLocation } from './source-location.js';

/** One element in the page that breaks a rule. */
export interface ViolationTarget {
  /** CSS selector, for display and for tools that have no source mapping. */
  selector: string;
  /** Truncated outerHTML of the offending element. */
  html: string;
  /**
   * The bridge to the developer's code. `null` when the page was not built from
   * instrumented templates — reported as unknown, never inferred.
   */
  source: SourceLocation | null;
  /**
   * What the rule worked out about this element, when it had something to say.
   * Lets a fix use the detected value instead of re-deriving it.
   */
  data?: Record<string, string>;
}

export interface Violation {
  /** Stable across engine versions; results are stored by this id. */
  ruleId: string;
  severity: Severity;
  /** What is wrong, in one sentence. */
  message: string;
  /** Why it matters, for a developer who is not an accessibility expert. */
  help: string;
  /** What to do about it. */
  recommendation: string;
  /** WCAG success criteria, e.g. `['1.1.1']`. */
  wcag: string[];
  /** RGAA 4.1.2 criteria, e.g. `['1.1']`. Derived from `wcag` via the mapping. */
  rgaa: string[];
  targets: ViolationTarget[];
  origin: 'axe' | 'custom';
}

/**
 * A check that cannot be automated and needs a human. Roughly three quarters of
 * RGAA falls here, so these are a first-class result rather than a footnote —
 * presenting only the automated findings would misrepresent conformance.
 */
export interface ManualCheck {
  ruleId: string;
  question: string;
  rgaa: string[];
  wcag: string[];
  /** Candidate elements a human should look at, when the rule can narrow it down. */
  targets: ViolationTarget[];
}
