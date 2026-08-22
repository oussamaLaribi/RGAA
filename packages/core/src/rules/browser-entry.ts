import { CUSTOM_RULES } from './registry.js';
import type { RuleLocale } from './locale-fr.js';
import type { Severity } from '../types/severity.js';

/**
 * Entry point for the bundle injected into the page.
 *
 * The rules are ordinary modules with imports, so they cannot be handed to
 * `page.evaluate` the way a single self-contained function can. They are bundled
 * instead and dropped into the page exactly like axe, which keeps the promise
 * that a new rule is a new file and nothing else.
 */

export interface RawCustomNode {
  html: string;
  selector: string;
  /** Value of the source attribute, when the page was built from instrumented templates. */
  source: string | null;
  message: string | null;
  data: Record<string, string> | null;
}

export interface RawCustomResult {
  ruleId: string;
  severity: Severity;
  wcag: string[];
  rgaa: string[];
  message: string;
  help: string;
  recommendation: string;
  /** True when the rule only narrows the search for a human. */
  review: boolean;
  candidates: number;
  nodes: RawCustomNode[];
}

export interface RawCustomReport {
  results: RawCustomResult[];
  /** Rules that threw, so a broken rule degrades instead of failing the scan. */
  errors: { ruleId: string; message: string }[];
}

const MAX_HTML = 200;

/** A short, readable path to the element, for display and for copying. */
function selectorFor(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName !== 'HTML' && parts.length < 5) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    current = parent;
  }

  return parts.join(' > ');
}

/**
 * @param locale Wording to use instead of the rule definitions' own, applied here
 *   so every consumer downstream receives one language.
 */
export function runCustomRules(
  sourceAttribute: string,
  locale?: RuleLocale,
): RawCustomReport {
  const results: RawCustomResult[] = [];
  const errors: { ruleId: string; message: string }[] = [];

  for (const rule of CUSTOM_RULES) {
    try {
      const outcome = rule.run({ document, window: window as Window & typeof globalThis });
      const wording = locale?.[rule.id];

      // `{key}` placeholders filled from the finding's own data. A template
      // rather than a function, because the locale reaches the page as JSON.
      const detailFor = (data?: Record<string, string>): string | null => {
        if (!wording?.detail) return null;
        return wording.detail.replace(
          /\{(\w+)\}/g,
          (whole, key: string) => data?.[key] ?? whole,
        );
      };

      results.push({
        ruleId: rule.id,
        severity: rule.severity,
        wcag: [...rule.wcag],
        rgaa: [...rule.rgaa],
        message: wording?.message ?? rule.message,
        help: wording?.help ?? rule.help,
        recommendation: wording?.recommendation ?? rule.recommendation,
        review: rule.review === true,
        candidates: outcome.candidates,
        nodes: outcome.findings.map((finding) => {
          const html = finding.element.outerHTML ?? '';
          return {
            html: html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}…` : html,
            selector: selectorFor(finding.element),
            // Read here, where the real elements are: matching a selector back
            // to source afterwards is exactly the guesswork this tool avoids.
            source: finding.element.getAttribute(sourceAttribute),
            message: detailFor(finding.data) ?? finding.message ?? null,
            data: finding.data ?? null,
          };
        }),
      });
    } catch (error) {
      // One bad rule must not cost the user the whole scan.
      errors.push({
        ruleId: rule.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results, errors };
}

/** Global the injected bundle exposes, mirroring how axe presents itself. */
export const RULES_GLOBAL = '__rgaaRules';

(globalThis as unknown as Record<string, unknown>)[RULES_GLOBAL] = { run: runCustomRules };
