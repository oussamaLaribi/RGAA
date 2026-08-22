import { attributeOf } from '@rgaa-source/core';
import { insertChild, removeAttribute, renameTag, replaceContent, setAttribute } from './edits.js';
import { PLACEHOLDER, type Fixer, type TextEdit } from './types.js';

/**
 * Fixes that are mechanically certain.
 *
 * The bar is that the edit is correct without knowing anything about the page's
 * meaning. That bar excludes almost every text-authoring fix, which is why this
 * list is short — and being honest about its shortness is the point.
 */
const SAFE: Fixer[] = [
  {
    ruleId: 'tabindex',
    level: 'safe',
    description: 'remove the positive tabindex',
    propose({ element, source }): TextEdit[] | null {
      const tabindex = attributeOf(element, 'tabindex');
      if (!tabindex || Number(tabindex.value) <= 0) return null;

      // Removing it restores document order, which is the recommended fix; any
      // other value would be a guess about intended ordering.
      return [removeAttribute(tabindex, source)];
    },
  },
  {
    ruleId: 'meta-viewport',
    level: 'safe',
    description: 'allow zooming again',
    propose({ element, source }): TextEdit[] | null {
      const content = attributeOf(element, 'content');
      if (!content) return null;

      const kept = content.value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => {
          const key = part.split('=')[0]?.trim().toLowerCase();
          return key !== 'user-scalable' && key !== 'maximum-scale';
        });

      if (kept.length === content.value.split(',').length) return null;
      return [setAttribute(element, source, 'content', kept.join(', '))].filter(
        (edit): edit is TextEdit => edit !== null,
      );
    },
  },
  {
    ruleId: 'rgaa-missing-autocomplete',
    level: 'safe',
    description: 'add the autocomplete token',
    propose({ element, source, target }): TextEdit[] | null {
      // The rule matched a curated table of unambiguous field kinds and passed
      // the token along, so there is nothing left to infer here.
      const token = target.data?.['token'];
      if (!token) return null;

      const edit = setAttribute(element, source, 'autocomplete', token);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'presentation-role-conflict',
    level: 'safe',
    description: 'drop the presentational role from a focusable element',
    propose({ element, source }): TextEdit[] | null {
      const role = attributeOf(element, 'role');
      if (!role || (role.value !== 'presentation' && role.value !== 'none')) return null;
      return [removeAttribute(role, source)];
    },
  },
];

/**
 * Fixes whose shape is known but whose words are not.
 *
 * Each writes a placeholder a human must replace. Applied only on request, and
 * never silently: an unedited placeholder in production is a worse failure than
 * the violation it replaced, because a wrong alternative is believed while a
 * missing one is at least detectable.
 */
const SUGGESTED: Fixer[] = [
  {
    ruleId: 'html-has-lang',
    level: 'suggested',
    description: 'declare the page language',
    propose({ element, source }): TextEdit[] | null {
      // The value is a guess — the tool cannot know what language the content is
      // in — but it is a one-word guess a developer can confirm at a glance.
      const edit = setAttribute(element, source, 'lang', 'fr');
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'rgaa-lang-mismatch',
    level: 'suggested',
    description: 'correct the declared language to the one detected',
    propose({ element, source, target }): TextEdit[] | null {
      const detected = target.data?.['detected'];
      if (!detected) return null;

      // Better founded than the blind default used when no language is declared
      // at all, but still a reading of the content rather than a certainty —
      // a mostly-French page quoting English at length is a real thing.
      const edit = setAttribute(element, source, 'lang', detected);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'rgaa-placeholder-page-title',
    level: 'suggested',
    description: 'replace the placeholder title',
    propose({ element, source }): TextEdit[] | null {
      const edit = replaceContent(element, source, PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'document-title',
    level: 'suggested',
    description: 'give the page a title',
    propose({ elements, source }): TextEdit[] | null {
      // Reported on <html>, but the element has to be written inside <head>.
      const head = elements.find((candidate) => candidate.tagName === 'head');
      if (!head) return null;
      if (elements.some((candidate) => candidate.tagName === 'title')) return null;

      const edit = insertChild(head, source, `<title>${PLACEHOLDER}</title>`);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'image-alt',
    level: 'suggested',
    description: 'add an alternative to describe or empty for decoration',
    propose({ element, source }): TextEdit[] | null {
      const edit = setAttribute(element, source, 'alt', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'role-img-alt',
    level: 'suggested',
    description: 'name the image',
    propose({ element, source }): TextEdit[] | null {
      const edit = setAttribute(element, source, 'aria-label', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'button-name',
    level: 'suggested',
    description: 'name the button after what it does',
    propose({ element, source }): TextEdit[] | null {
      const edit = setAttribute(element, source, 'aria-label', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'link-name',
    level: 'suggested',
    description: 'name the link after where it goes',
    propose({ element, source }): TextEdit[] | null {
      const edit = setAttribute(element, source, 'aria-label', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'frame-title',
    level: 'suggested',
    description: 'title the frame',
    propose({ element, source }): TextEdit[] | null {
      const edit = setAttribute(element, source, 'title', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'label',
    level: 'suggested',
    description: 'label the field',
    propose({ element, source }): TextEdit[] | null {
      // A real <label for=...> would be better, but placing one requires knowing
      // where the visible text belongs in the layout. aria-label is the edit
      // that can be made without moving anything.
      const edit = setAttribute(element, source, 'aria-label', PLACEHOLDER);
      return edit ? [edit] : null;
    },
  },
  {
    ruleId: 'heading-order',
    level: 'suggested',
    description: 'step the heading down to the next level',
    propose({ element, elements, source }): TextEdit[] | null {
      const headingLevel = (tagName: string): number | null => {
        const match = /^h([1-6])$/.exec(tagName);
        return match ? Number(match[1]) : null;
      };

      const level = headingLevel(element.tagName);
      if (level === null) return null;

      // Step down from the heading that precedes it rather than simply lowering
      // by one: between an h1 and an h4, one step still leaves a gap, and a fix
      // that does not resolve the violation is worse than none — it looks done.
      const previous = elements
        .filter((candidate) => candidate.openStart < element.openStart)
        .map((candidate) => headingLevel(candidate.tagName))
        .filter((value): value is number => value !== null)
        .pop();

      const target = previous === undefined ? 1 : Math.min(previous + 1, 6);
      if (target === level) return null;

      // Only the headings in this file are visible here. A heading rendered by
      // another component could still make this wrong, which is why it stays a
      // suggestion rather than a safe fix.
      return renameTag(element, source, `h${target}`);
    },
  },
];

export const FIXERS: readonly Fixer[] = [...SAFE, ...SUGGESTED];

const BY_RULE = new Map(FIXERS.map((fixer) => [fixer.ruleId, fixer]));

export function fixerFor(ruleId: string): Fixer | undefined {
  return BY_RULE.get(ruleId);
}
