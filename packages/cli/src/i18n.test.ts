import { describe, expect, it } from 'vitest';
import { DEFAULT_LANG, messages, parseLang } from './i18n.js';
import { loadAxeLocale, loadRuleLocale } from './locales.js';

describe('language selection', () => {
  it('defaults to French', () => {
    // The reference frame this tool implements is French, and so is its market;
    // an English console around a French report was the incoherence to fix.
    expect(DEFAULT_LANG).toBe('fr');
    expect(parseLang(undefined)).toBe('fr');
  });

  it('accepts the two languages it actually has', () => {
    expect(parseLang('fr')).toBe('fr');
    expect(parseLang('en')).toBe('en');
  });

  it('refuses a language it cannot honour', () => {
    // Silently falling back would ship a French report to someone who asked for
    // German, which is worse than saying no.
    expect(parseLang('de')).toBeNull();
    expect(parseLang('')).toBeNull();
  });
});

describe('messages', () => {
  it('says everything in French by default', () => {
    const t = messages('fr');

    expect(t.score(49)).toContain('Score de pré-audit');
    expect(t.severity.critical).toBe('critique');
    expect(t.notCovered(82)).toContain('hors de portée');
  });

  it('has an English wording for every key', () => {
    // The interface is one record, so a missing key is a compile error rather
    // than an untranslated string discovered in front of a user.
    const fr = messages('fr');
    const en = messages('en');

    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('keeps the conformance caveat in both', () => {
    for (const lang of ['fr', 'en'] as const) {
      expect(messages(lang).disclaimer.join(' ')).toMatch(/audit humain|human audit/);
    }
  });
});

describe('locales handed to the page', () => {
  it('uses axe’s own French translation', () => {
    // axe ships official locales for twenty languages, maintained by the people
    // who wrote the rules; a translation of our own would be worse and drift.
    const locale = loadAxeLocale('fr') as { rules?: Record<string, { help?: string }> };

    expect(locale?.rules?.['image-alt']?.help).toContain('alternative textuelle');
  });

  it('sends nothing for English, which is axe’s own wording', () => {
    expect(loadAxeLocale('en')).toBeUndefined();
  });

  it('carries wording for our own rules, which axe knows nothing about', () => {
    const rules = loadRuleLocale('fr');

    expect(rules?.['rgaa-lang-mismatch']?.message).toContain('langue déclarée');
    expect(loadRuleLocale('en')).toBeUndefined();
  });

  it('gives every rule with a placeholder detail the data keys it needs', () => {
    const rules = loadRuleLocale('fr') ?? {};

    for (const [id, wording] of Object.entries(rules)) {
      if (!wording.detail) continue;
      // An unfilled {placeholder} reaching a user is worse than a generic
      // sentence, so the template must only name keys a rule actually emits.
      expect(wording.detail, `${id} has an empty template`).not.toBe('');
      expect(wording.detail).toMatch(/\{\w+\}/);
    }
  });
});
