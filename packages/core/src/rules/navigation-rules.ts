import type { AccessibilityRule, RuleResult } from './rule.interface.js';
import { accessibleText, normalise } from './helpers.js';

/** Wordings a skip link is written with, in both languages this tool serves. */
const SKIP_WORDING =
  /(aller|acc[eé]der|passer)[^.]{0,20}(contenu|principal)|contenu principal|évitement|skip[^.]{0,20}(content|navigation|main)|jump to/i;

/** How far into the document a skip link can be and still do its job. */
const REACHABLE_WITHIN = 3;

/**
 * No skip link to the main content.
 *
 * axe's `bypass` rule accepts landmarks as a bypass mechanism and therefore
 * passes on almost every modern page. RGAA 12.7 asks specifically for a skip
 * link, so this criterion is reported by no automated tool despite being one of
 * the first things a French auditor checks.
 */
export const skipLinkMissing: AccessibilityRule = {
  id: 'rgaa-skip-link-missing',
  severity: 'moderate',
  wcag: ['2.4.1'],
  rgaa: ['12.7'],
  message: 'No skip link to the main content',
  help: 'Without one, someone navigating by keyboard has to tab through the whole header and menu on every single page before reaching the content.',
  recommendation: 'Add a link at the very top of the page pointing at the main content, visible at least when it receives focus.',

  run({ document }): RuleResult {
    const body = document.body;
    if (!body) return { candidates: 0, findings: [] };

    // Taken from all links, not just fragment ones: a skip link is only useful
    // if it comes before the navigation it skips, so its position among every
    // link on the page is exactly what is being tested.
    const links = [...document.querySelectorAll('a[href]')].slice(0, REACHABLE_WITHIN);

    const hasSkipLink = links.some((link) => {
      const target = document.getElementById(
        decodeURIComponent((link.getAttribute('href') ?? '').slice(1)),
      );
      const pointsAtContent =
        !!target &&
        (target.tagName === 'MAIN' ||
          target.getAttribute('role') === 'main' ||
          !!target.querySelector('main, [role="main"]') ||
          !!target.closest('main, [role="main"]'));

      return pointsAtContent || SKIP_WORDING.test(accessibleText(link));
    });

    return {
      candidates: 1,
      findings: hasSkipLink ? [] : [{ element: body }],
    };
  },
};

/**
 * Page titles that were never written.
 *
 * Restricted to a small list of values that are unmistakably placeholders. A
 * cleverer heuristic — flagging single PascalCase words, say — would catch the
 * Angular CLI default but would also flag every site named after one word.
 */
const PLACEHOLDER_TITLES = new Set([
  'document', 'untitled', 'untitled document', 'new page', 'page', 'app',
  'application', 'angular', 'angularapp', 'index', 'home', 'title', 'todo',
]);

export const placeholderPageTitle: AccessibilityRule = {
  id: 'rgaa-placeholder-page-title',
  severity: 'moderate',
  wcag: ['2.4.2'],
  rgaa: ['8.6'],
  message: 'Page title is a placeholder rather than a description of the page',
  help: 'The title is the first thing announced on load and the label of the browser tab and every bookmark; a placeholder leaves all of them meaningless.',
  recommendation: 'Set a title describing this page in particular, not the application in general.',

  run({ document }): RuleResult {
    const title = document.querySelector('title');
    // A missing title is a different failure, and axe already reports it.
    if (!title) return { candidates: 0, findings: [] };

    const text = normalise(title.textContent).toLowerCase();
    if (!text) return { candidates: 0, findings: [] };

    return {
      candidates: 1,
      findings: PLACEHOLDER_TITLES.has(text)
        ? [
            {
              element: title,
              message: `Page title is "${normalise(title.textContent)}"`,
              data: { title: normalise(title.textContent) },
            },
          ]
        : [],
    };
  },
};
