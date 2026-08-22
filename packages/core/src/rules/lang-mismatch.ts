import type { AccessibilityRule, RuleResult } from './rule.interface.js';
import { pageText } from './helpers.js';

/**
 * Very common words, which appear at a stable rate in ordinary prose and hardly
 * at all in other languages. Kept short on purpose: a longer list would drift
 * towards topic vocabulary and start recognising subject matter instead of
 * language.
 */
const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  fr: ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'en', 'que', 'qui', 'dans', 'pour', 'sur', 'pas', 'plus', 'par', 'avec', 'ce', 'cette', 'au', 'aux', 'ne', 'se', 'son', 'sa', 'ses', 'vous', 'nous'],
  en: ['the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'you', 'that', 'was', 'for', 'on', 'are', 'with', 'as', 'his', 'they', 'be', 'at', 'have', 'this', 'from', 'or', 'had', 'by', 'not', 'we', 'your'],
  es: ['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'y', 'es', 'en', 'que', 'por', 'para', 'con', 'no', 'se', 'su', 'lo', 'como', 'más', 'pero', 'sus'],
  de: ['der', 'die', 'das', 'und', 'ist', 'in', 'den', 'von', 'zu', 'mit', 'sich', 'des', 'auf', 'für', 'nicht', 'dem', 'eine', 'als', 'auch', 'es', 'an'],
};

/** Below this, the sample is too short for the frequencies to mean anything. */
const MINIMUM_WORDS = 40;

/** The winner must reach this share of the sample to count as recognised. */
const MINIMUM_SHARE = 0.06;

/**
 * How far ahead of the declared language the winner must be.
 *
 * Set high deliberately. Telling someone their English page is in French would
 * destroy trust in every other finding, so the rule stays silent unless the
 * evidence is one-sided.
 */
const REQUIRED_MARGIN = 3;

interface Scores {
  best: string | null;
  shares: Record<string, number>;
  words: number;
}

function scoreLanguages(text: string): Scores {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}'’]+/u)
    .filter((word) => word.length > 0);

  const shares: Record<string, number> = {};
  let best: string | null = null;

  for (const [language, stopwords] of Object.entries(STOPWORDS)) {
    const set = new Set(stopwords);
    const hits = words.filter((word) => set.has(word)).length;
    shares[language] = words.length === 0 ? 0 : hits / words.length;

    if (best === null || shares[language]! > shares[best]!) best = language;
  }

  return { best, shares, words: words.length };
}

/**
 * The declared language of the page does not match the language it is written in.
 *
 * This is the single most common RGAA failure in Angular projects and no tool
 * reports it: `ng new` writes `lang="en"` into the shell, French teams never
 * touch it, and axe only checks that the code is syntactically valid. A screen
 * reader then pronounces French with English phonetics, which is unintelligible.
 */
export const langMismatch: AccessibilityRule = {
  id: 'rgaa-lang-mismatch',
  severity: 'serious',
  wcag: ['3.1.1'],
  rgaa: ['8.4'],
  message: 'The declared page language does not match the language of the content',
  help: 'A screen reader picks its pronunciation rules from the declared language, so a mismatch makes the whole page unintelligible rather than merely accented.',
  recommendation: 'Set the lang attribute on <html> to the language the page is actually written in.',

  run({ document }): RuleResult {
    const root = document.documentElement;
    const declared = (root.getAttribute('lang') ?? '').toLowerCase().split('-')[0];

    // Nothing declared is a different failure, and axe already reports it.
    if (!declared || !(declared in STOPWORDS)) return { candidates: 0, findings: [] };

    const { best, shares, words } = scoreLanguages(pageText(document));
    if (words < MINIMUM_WORDS) return { candidates: 0, findings: [] };

    const declaredShare = shares[declared] ?? 0;
    const bestShare = best === null ? 0 : (shares[best] ?? 0);

    const mismatched =
      best !== null &&
      best !== declared &&
      bestShare >= MINIMUM_SHARE &&
      bestShare >= declaredShare * REQUIRED_MARGIN;

    return {
      candidates: 1,
      findings: mismatched
        ? [
            {
              element: root,
              message: `Page declares lang="${declared}" but the content reads as ${best}`,
              data: { detected: best!, declared },
            },
          ]
        : [],
    };
  },
};
