/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import type { AccessibilityRule, RuleResult } from './rule.interface.js';
import { CUSTOM_RULES } from './registry.js';
import { langMismatch } from './lang-mismatch.js';
import { duplicateLinkText, linkNotExplicit } from './link-not-explicit.js';
import { groupWithoutFieldset, missingAutocomplete } from './form-rules.js';
import { placeholderPageTitle, skipLinkMissing } from './navigation-rules.js';

/** Render markup into the document and run one rule against it. */
function run(rule: AccessibilityRule, html: string, lang?: string): RuleResult {
  document.documentElement.innerHTML = html;
  if (lang === undefined) document.documentElement.removeAttribute('lang');
  else document.documentElement.setAttribute('lang', lang);

  return rule.run({ document, window: window as unknown as Window & typeof globalThis });
}

const FRENCH = `
  <p>Bienvenue dans la boutique en ligne. Vous trouverez sur cette page les
  articles que nous proposons à la vente, avec pour chacun une description
  détaillée et le prix affiché toutes taxes comprises. Les commandes passées
  avant seize heures sont expédiées le jour même depuis notre entrepôt.</p>`;

const ENGLISH = `
  <p>Welcome to the online shop. On this page you will find the items that we
  offer for sale, each of them with a detailed description and the price shown
  with all taxes included. Orders that are placed before four in the afternoon
  are shipped on the same day from our warehouse.</p>`;

describe('rgaa-lang-mismatch', () => {
  it('catches the Angular default left on French content', () => {
    // `ng new` writes lang="en"; French teams ship it untouched, and axe only
    // ever checks that the code is syntactically valid.
    const result = run(langMismatch, `<body>${FRENCH}</body>`, 'en');

    expect(result.findings).toHaveLength(1);
    // Both values travel with the finding so the wording can be translated
    // without re-deriving anything.
    expect(result.findings[0]?.data).toEqual({ detected: 'fr', declared: 'en' });
  });

  it('stays silent when the declaration is right', () => {
    expect(run(langMismatch, `<body>${FRENCH}</body>`, 'fr').findings).toEqual([]);
    expect(run(langMismatch, `<body>${ENGLISH}</body>`, 'en').findings).toEqual([]);
  });

  it('accepts a regional code', () => {
    expect(run(langMismatch, `<body>${FRENCH}</body>`, 'fr-FR').findings).toEqual([]);
  });

  it('refuses to guess from too little text', () => {
    // Frequencies mean nothing on a handful of words, and a wrong call here
    // would discredit every other finding in the report.
    const result = run(langMismatch, '<body><p>Bonjour</p></body>', 'en');

    expect(result.candidates).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it('says nothing when no language is declared at all', () => {
    // That is a different failure, and axe already reports it.
    expect(run(langMismatch, `<body>${FRENCH}</body>`).candidates).toBe(0);
  });

  it('ignores text that is not shown to anyone', () => {
    const hidden = `<body><script>const le = la; de des du un une et est en que qui</script>${ENGLISH}</body>`;
    expect(run(langMismatch, hidden, 'en').findings).toEqual([]);
  });
});

describe('rgaa-placeholder-page-title', () => {
  it('catches a title nobody ever wrote', () => {
    const result = run(placeholderPageTitle, '<head><title>Document</title></head><body></body>');
    expect(result.findings).toHaveLength(1);
  });

  it('accepts a real title', () => {
    const result = run(
      placeholderPageTitle,
      '<head><title>Panier — Boutique</title></head><body></body>',
    );
    expect(result.findings).toEqual([]);
  });

  it('leaves a missing title to axe', () => {
    expect(run(placeholderPageTitle, '<head></head><body></body>').candidates).toBe(0);
  });
});

describe('rgaa-skip-link-missing', () => {
  it('accepts a link pointing at the main content', () => {
    const html =
      '<body><a href="#main">Aller au contenu</a><main id="main">contenu</main></body>';
    expect(run(skipLinkMissing, html).findings).toEqual([]);
  });

  it('reports a page that has none', () => {
    // axe's bypass rule passes here because a landmark exists, which is why this
    // criterion goes unreported by every automated tool.
    const html = '<body><nav><a href="/a">A</a></nav><main>contenu</main></body>';
    expect(run(skipLinkMissing, html).findings).toHaveLength(1);
  });

  it('does not count a fragment link buried far down the page', () => {
    const html = [
      '<body>',
      '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a><a href="/d">D</a>',
      '<a href="#main">Aller au contenu</a>',
      '<main id="main">contenu</main>',
      '</body>',
    ].join('');
    // A skip link is only useful if it comes before what it skips.
    expect(run(skipLinkMissing, html).findings).toHaveLength(1);
  });
});

describe('rgaa-group-without-fieldset', () => {
  const radios = (extra = '') =>
    `<body><form>${extra}<input type="radio" name="livraison"><input type="radio" name="livraison"></form></body>`;

  it('reports a radio group with no legend', () => {
    expect(run(groupWithoutFieldset, radios()).findings).toHaveLength(1);
  });

  it('accepts a fieldset with a legend', () => {
    const html =
      '<body><form><fieldset><legend>Livraison</legend><input type="radio" name="l"><input type="radio" name="l"></fieldset></form></body>';
    expect(run(groupWithoutFieldset, html).findings).toEqual([]);
  });

  it('accepts an explicitly named group', () => {
    const html =
      '<body><form><div role="radiogroup" aria-label="Livraison"><input type="radio" name="l"><input type="radio" name="l"></div></form></body>';
    expect(run(groupWithoutFieldset, html).findings).toEqual([]);
  });

  it('leaves a lone radio alone', () => {
    const html = '<body><form><input type="radio" name="l"></form></body>';
    expect(run(groupWithoutFieldset, html).findings).toEqual([]);
  });
});

describe('rgaa-missing-autocomplete', () => {
  it('names the token it expects, so the fix needs no guessing', () => {
    const result = run(missingAutocomplete, '<body><input type="email"></body>');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.data).toEqual({ token: 'email' });
  });

  it('reads the intent from the field name too', () => {
    const result = run(missingAutocomplete, '<body><input type="text" name="code_postal"></body>');
    expect(result.findings[0]?.data).toEqual({ token: 'postal-code' });
  });

  it('says nothing about a field that already has one', () => {
    const html = '<body><input type="email" autocomplete="email"></body>';
    expect(run(missingAutocomplete, html).candidates).toBe(0);
  });

  it('ignores fields that ask for nothing personal', () => {
    const html = '<body><input type="text" name="search"><input type="number" name="qty"></body>';
    expect(run(missingAutocomplete, html).candidates).toBe(0);
  });
});

describe('rgaa-link-not-explicit', () => {
  it('flags wording that says nothing on its own', () => {
    const html = '<body><a href="/a">En savoir plus</a><a href="/b">Voir le panier</a></body>';
    const result = run(linkNotExplicit, html);

    expect(result.findings).toHaveLength(1);
    expect(result.candidates).toBe(2);
  });

  it('is a review rule, because context can make a link explicit', () => {
    // RGAA 6.1 allows an implicit wording when the surrounding context carries
    // the meaning, which is a judgement no check can make.
    expect(linkNotExplicit.review).toBe(true);
  });

  it('leaves a nameless link to axe', () => {
    expect(run(linkNotExplicit, '<body><a href="/a"></a></body>').findings).toEqual([]);
  });
});

describe('rgaa-duplicate-link-text', () => {
  it('flags identical wording leading to different places', () => {
    const html =
      '<body><a href="/a">En savoir plus</a><a href="/b">En savoir plus</a></body>';
    expect(run(duplicateLinkText, html).findings).toHaveLength(2);
  });

  it('accepts repeated links to the same destination', () => {
    const html = '<body><a href="/a">Panier</a><a href="/a">Panier</a></body>';
    expect(run(duplicateLinkText, html).findings).toEqual([]);
  });
});

describe('the rule registry', () => {
  it('gives every rule an id, a criterion and a recommendation', () => {
    for (const rule of CUSTOM_RULES) {
      expect(rule.id, 'rule without an id').toBeTruthy();
      expect(rule.rgaa.length, `${rule.id} declares no RGAA criterion`).toBeGreaterThan(0);
      expect(rule.wcag.length, `${rule.id} declares no WCAG criterion`).toBeGreaterThan(0);
      expect(rule.recommendation, `${rule.id} has no recommendation`).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = CUSTOM_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns no findings on a page with nothing to say', () => {
    // A rule that fires on an empty document would fire everywhere.
    for (const rule of CUSTOM_RULES) {
      const result = run(rule, '<head><title>Boutique</title></head><body><main>x</main></body>', 'fr');
      const unexpected = result.findings.filter(() => rule.id !== 'rgaa-skip-link-missing');
      expect(unexpected, `${rule.id} fired on a clean page`).toEqual([]);
    }
  });
});
