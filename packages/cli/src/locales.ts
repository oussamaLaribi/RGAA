import { createRequire } from 'node:module';
import { RULES_FR, type RuleLocale } from '@rgaa-source/core';
import type { Lang } from './i18n.js';

const require = createRequire(import.meta.url);

/**
 * axe's own translation of its rule messages.
 *
 * Taken from axe-core rather than written here: axe ships official locales for
 * twenty languages, maintained by the people who wrote the rules. Duplicating
 * that would mean maintaining a worse translation that drifts on every upgrade.
 */
export function loadAxeLocale(lang: Lang): unknown {
  // English is axe's own wording; applying a locale would be a round trip for
  // nothing, and asking for a file that does not exist.
  if (lang === 'en') return undefined;

  try {
    return require(`axe-core/locales/${lang}.json`) as unknown;
  } catch {
    // A missing locale costs the translation, never the scan.
    return undefined;
  }
}

/** Wording for our own rules, which axe knows nothing about. */
export function loadRuleLocale(lang: Lang): RuleLocale | undefined {
  return lang === 'fr' ? RULES_FR : undefined;
}
