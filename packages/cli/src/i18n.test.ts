import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_LANG, detectLang, messages, parseLang } from './i18n.js';
import { loadAxeLocale, loadRuleLocale } from './locales.js';
import { usage } from './usage.js';

describe('language detection', () => {
  it('speaks French to a French environment', () => {
    expect(detectLang({ LANG: 'fr_FR.UTF-8' }, null)).toBe('fr');
    expect(detectLang({ LC_ALL: 'fr-CA' }, null)).toBe('fr');
    expect(detectLang({ LANG: 'FR' }, null)).toBe('fr');
  });

  it('falls back to English rather than to a language it does not have', () => {
    expect(detectLang({ LANG: 'de_DE.UTF-8' }, null)).toBe('en');
    expect(detectLang({ LANG: 'en_GB' }, null)).toBe('en');
  });

  it('follows POSIX precedence', () => {
    // LC_ALL overrides everything below it. Reading LANG first would give French
    // to someone who explicitly asked for German at a higher priority.
    expect(detectLang({ LC_ALL: 'de_DE', LC_MESSAGES: 'fr_FR', LANG: 'fr_FR' }, null)).toBe('en');
    expect(detectLang({ LC_MESSAGES: 'fr_FR', LANG: 'de_DE' }, null)).toBe('fr');
  });

  it('treats C and POSIX as a request for no localisation', () => {
    // These are not languages. They mean "give me the untranslated original",
    // which is English here — and they must not fall through to a lower
    // variable, since they are a stated preference.
    expect(detectLang({ LC_ALL: 'C', LANG: 'fr_FR' }, null)).toBe('en');
    expect(detectLang({ LANG: 'POSIX' }, null)).toBe('en');
  });

  it('asks the operating system when no variable is set', () => {
    // Windows leaves these variables unset, so this is the only signal there.
    // Without it, every Windows user would get English whatever their machine
    // is configured to — which is most of the point of detecting at all.
    expect(detectLang({}, 'fr-FR')).toBe('fr');
    expect(detectLang({}, 'de-DE')).toBe('en');
  });

  it('lets the environment override the operating system', () => {
    expect(detectLang({ LANG: 'de_DE.UTF-8' }, 'fr-FR')).toBe('en');
    expect(detectLang({ LANG: 'fr_FR.UTF-8' }, 'de-DE')).toBe('fr');
  });

  it('lands on English when nothing says anything at all', () => {
    // The common case in continuous integration. A French team that wants
    // French reports there sets it in rgaa.config.json, where it belongs.
    expect(detectLang({}, null)).toBe('en');
    expect(detectLang({ LANG: '' }, null)).toBe('en');
  });
});

describe('language selection', () => {
  it('uses the detected language when no flag is given', () => {
    expect(parseLang(undefined)).toBe(DEFAULT_LANG);
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

describe('usage text', () => {
  it('follows the chosen language', () => {
    // The help is the first thing many people read; leaving it in English under
    // a French default was the last inconsistency of the translation pass.
    expect(usage('fr')).toContain("analyse d'accessibilité");
    expect(usage('en')).toContain('accessibility scan');
  });

  it('documents every option the parser accepts, in both languages', () => {
    const options = [...usage('fr').matchAll(/^ {2}(--[a-z-]+)/gm)].map((m) => m[1]);
    expect(options.length).toBeGreaterThan(15);

    for (const option of options) {
      expect(usage('en'), `${option} manque à la version anglaise`).toContain(option);
    }
  });

  it('leaves no flag the parser accepts undocumented', () => {
    // The check above compares the two languages to each other, so an option
    // missing from both passes it — which is exactly how `--app` shipped
    // undocumented. This one compares the help to the parser itself.
    const parser = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const declared = [...parser.matchAll(/^ {6}'?([a-z][a-z-]*)'?: \{ type: '(?:string|boolean)'/gm)]
      .map((match) => `--${match[1]}`)
      // Negations exist only so parseArgs accepts them; the positive form is
      // what the help documents.
      .filter((flag) => !flag.startsWith('--no-'));

    expect(declared.length).toBeGreaterThan(15);
    for (const flag of declared) {
      expect(usage('fr'), `${flag} n'est documenté nulle part`).toContain(flag);
    }
  });

  it('keeps the configuration keys untranslated', () => {
    // They are the literal keys of the file, not prose: translating them would
    // document a configuration that does not work.
    for (const lang of ['fr', 'en'] as const) {
      expect(usage(lang)).toContain('"routes"');
      expect(usage(lang)).toContain('"minScore"');
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
