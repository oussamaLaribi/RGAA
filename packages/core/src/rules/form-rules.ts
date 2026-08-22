import type { AccessibilityRule, RuleResult } from './rule.interface.js';
import { isVisible, normalise } from './helpers.js';

/**
 * Radio buttons and checkboxes sharing a name, without a grouping.
 *
 * axe has no rule for this, and it is a standing finding in French audits: each
 * field may carry its own label and still leave the reader with no idea what the
 * set of choices is about.
 */
export const groupWithoutFieldset: AccessibilityRule = {
  id: 'rgaa-group-without-fieldset',
  severity: 'moderate',
  wcag: ['1.3.1'],
  rgaa: ['11.5', '11.6'],
  message: 'Related fields are not grouped under a legend',
  help: 'Each field may be labelled and the set still be meaningless: without a grouping, a reader hears the options but never the question they answer.',
  recommendation: 'Wrap the group in a <fieldset> with a <legend>, or use role="group" with an accessible name.',

  run({ document }): RuleResult {
    const inputs = [...document.querySelectorAll('input[type="radio"][name], input[type="checkbox"][name]')]
      .filter(isVisible) as HTMLInputElement[];

    const groups = new Map<string, HTMLInputElement[]>();
    for (const input of inputs) {
      // Scope by form as well as name: two forms may reuse the same name for
      // unrelated questions.
      const key = `${input.form?.id ?? input.form?.name ?? ''}::${input.type}::${input.name}`;
      groups.set(key, [...(groups.get(key) ?? []), input]);
    }

    const findings = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;

      const first = members[0]!;
      const fieldset = first.closest('fieldset');
      const grouped =
        (fieldset && normalise(fieldset.querySelector('legend')?.textContent)) ||
        normalise(first.closest('[role="group"],[role="radiogroup"]')?.getAttribute('aria-label'));

      if (!grouped) {
        findings.push({
          element: first,
          message: `${members.length} "${first.name}" fields are not grouped under a legend`,
          data: { count: String(members.length), name: first.name },
        });
      }
    }

    return { candidates: groups.size, findings };
  },
};

/**
 * Fields that identify the user, mapped to the autocomplete token they should
 * carry. Restricted to cases where the intent is unambiguous.
 */
const EXPECTED_AUTOCOMPLETE: readonly { test: RegExp; token: string }[] = [
  { test: /^email$/i, token: 'email' },
  { test: /^tel$/i, token: 'tel' },
];

const NAME_HINTS: readonly { test: RegExp; token: string }[] = [
  { test: /(^|[-_])(email|courriel|mail)([-_]|$)/i, token: 'email' },
  { test: /(^|[-_])(tel|telephone|phone|mobile)([-_]|$)/i, token: 'tel' },
  { test: /(^|[-_])(firstname|prenom|given[-_]?name)([-_]|$)/i, token: 'given-name' },
  { test: /(^|[-_])(lastname|nom|surname|family[-_]?name)([-_]|$)/i, token: 'family-name' },
  { test: /(^|[-_])(zip|postal|code[-_]?postal|cp)([-_]|$)/i, token: 'postal-code' },
];

/**
 * Identity fields with no autocomplete token.
 *
 * axe validates the value of an autocomplete attribute but never notices a
 * missing one, so this criterion goes unreported by every automated tool.
 */
export const missingAutocomplete: AccessibilityRule = {
  id: 'rgaa-missing-autocomplete',
  severity: 'minor',
  wcag: ['1.3.5'],
  rgaa: ['11.13'],
  message: 'Field asking for the user’s own details has no autocomplete token',
  help: 'The token lets the browser fill the field, which matters most to people for whom typing is slow or painful.',
  recommendation: 'Add an autocomplete attribute naming what the field collects, for example autocomplete="email".',

  run({ document }): RuleResult {
    const inputs = [...document.querySelectorAll('input')].filter(
      (input) => isVisible(input) && !input.hasAttribute('autocomplete'),
    ) as HTMLInputElement[];

    const candidates: HTMLInputElement[] = [];
    const findings = [];

    for (const input of inputs) {
      const byType = EXPECTED_AUTOCOMPLETE.find((entry) => entry.test.test(input.type));
      // Tested separately rather than joined: the patterns anchor on the end of
      // the identifier, which a joining space would push out of reach.
      const byName = NAME_HINTS.find(
        (entry) => entry.test.test(input.name) || entry.test.test(input.id),
      );
      const expected = byType?.token ?? byName?.token;

      if (!expected) continue;

      candidates.push(input);
      findings.push({
        element: input,
        message: `Expected autocomplete="${expected}"`,
        data: { token: expected },
      });
    }

    return { candidates: candidates.length, findings };
  },
};
