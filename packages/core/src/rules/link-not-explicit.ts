import type { AccessibilityRule, RuleResult } from './rule.interface.js';
import { accessibleText, isVisible, normalise } from './helpers.js';

/**
 * Wordings that carry no information once the surrounding sentence is gone.
 *
 * Screen reader users routinely pull up a list of every link on the page, where
 * a dozen entries reading "en savoir plus" are indistinguishable.
 */
const UNINFORMATIVE = new Set([
  'cliquez ici', 'cliquer ici', 'clique ici', 'ici', 'en savoir plus', 'savoir plus',
  'lire la suite', 'lire plus', 'la suite', 'plus', 'voir', 'voir plus', 'voir plus',
  'détails', 'details', 'plus de détails', 'continuer', 'suite', 'télécharger',
  'click here', 'here', 'read more', 'learn more', 'more', 'see more', 'more info',
  'more information', 'details', 'continue', 'download', 'link', 'this link',
  'go', 'view', 'read', 'open',
]);

/**
 * Links whose wording says nothing on its own.
 *
 * A review rule, not a violation. RGAA 6.1 allows a link to be implicit when its
 * context makes it explicit — the surrounding sentence, the list item, the table
 * cell — and deciding whether that holds is a judgement no check can make.
 * Reporting these as failures would be wrong; reporting them as the links worth
 * looking at is useful.
 */
export const linkNotExplicit: AccessibilityRule = {
  id: 'rgaa-link-not-explicit',
  severity: 'moderate',
  wcag: ['2.4.4'],
  rgaa: ['6.1'],
  review: true,
  message: 'Link wording may not be explicit on its own',
  help: 'Screen reader users often navigate by listing every link on the page, where wording like "en savoir plus" repeated a dozen times is indistinguishable.',
  recommendation: 'Reword the link to name its destination, or confirm the surrounding context makes it explicit.',

  run({ document }): RuleResult {
    const links = [...document.querySelectorAll('a[href], [role="link"]')].filter(isVisible);
    const findings = [];

    for (const link of links) {
      const text = normalise(accessibleText(link)).toLowerCase().replace(/[.…:!?»«"']/g, '').trim();
      if (!text) continue; // no name at all is a different rule, and axe reports it

      if (UNINFORMATIVE.has(text)) {
        findings.push({ element: link, message: `Link reads only "${text}"`, data: { text } });
      }
    }

    return { candidates: links.length, findings };
  },
};

/**
 * Several links with the same wording pointing at different places.
 *
 * Also a review rule: the same wording is legitimate when the context
 * distinguishes them, which is a judgement about the page, not the markup.
 */
export const duplicateLinkText: AccessibilityRule = {
  id: 'rgaa-duplicate-link-text',
  severity: 'moderate',
  wcag: ['2.4.4'],
  rgaa: ['6.1'],
  review: true,
  message: 'Several links share the same wording but lead to different places',
  help: 'In a list of links, identical wording for different destinations gives the reader no way to tell them apart.',
  recommendation: 'Make each wording name its own destination, or confirm the context distinguishes them.',

  run({ document }): RuleResult {
    const links = [...document.querySelectorAll('a[href]')].filter(isVisible);
    const byText = new Map<string, { element: Element; href: string }[]>();

    for (const link of links) {
      const text = normalise(accessibleText(link)).toLowerCase();
      if (!text) continue;

      const href = (link as HTMLAnchorElement).href;
      byText.set(text, [...(byText.get(text) ?? []), { element: link, href }]);
    }

    const findings = [];
    for (const [text, group] of byText) {
      const destinations = new Set(group.map((entry) => entry.href));
      if (destinations.size < 2) continue;

      for (const entry of group) {
        findings.push({
          element: entry.element,
          message: `"${text}" is used for ${destinations.size} different destinations`,
          data: { text, count: String(destinations.size) },
        });
      }
    }

    return { candidates: links.length, findings };
  },
};
