import { describe, expect, it } from 'vitest';
import type { AuditResult, Violation } from '@rgaa-source/core';
import { formatConsoleReport } from './console.js';

const violation = (over: Partial<Violation> = {}): Violation => ({
  ruleId: 'image-alt',
  severity: 'critical',
  message: 'Images must have alternative text',
  help: 'Ensures img elements have alternate text',
  recommendation: 'Add an alt attribute',
  wcag: ['1.1.1'],
  rgaa: [],
  origin: 'axe',
  targets: [
    {
      selector: 'img',
      html: '<img src="a.png">',
      source: { file: 'src/app/app.html', line: 3, column: 3 },
    },
  ],
  ...over,
});

const result = (over: Partial<AuditResult> = {}): AuditResult => ({
  url: '/',
  timestamp: '2026-08-20T00:00:00.000Z',
  engineVersion: '0.2.0',
  rgaaVersion: '4.1.2',
  violations: [],
  passedRuleIds: [],
  manualChecks: [],
  score: {
    value: 100,
    scoringVersion: 1,
    applicableRules: 10,
    failedRules: 0,
    automatedOnly: true,
  },
  coverage: {
    version: '4.1.2',
    totalCriteria: 106,
    referenced: [],
    failing: [],
    needingReview: [],
    silent: 106,
  },
  ...over,
});

/** Colour is disabled outside a TTY, so assertions can match plain text. */
describe('formatConsoleReport', () => {
  it('leads with the file and position, not a CSS selector', () => {
    const output = formatConsoleReport([result({ violations: [violation()] })], { lang: 'fr' });

    expect(output).toContain('src/app/app.html');
    expect(output).toContain('3:3');
    expect(output).toContain('image-alt');
  });

  it('orders occurrences by position within a file', () => {
    const late = violation({
      ruleId: 'link-name',
      targets: [
        { selector: 'a', html: '<a></a>', source: { file: 'src/app/app.html', line: 20, column: 1 } },
      ],
    });
    const output = formatConsoleReport([result({ violations: [late, violation()] })], { lang: 'fr' });

    // Reads like a compiler's error list, top of file downwards.
    expect(output.indexOf('image-alt')).toBeLessThan(output.indexOf('link-name'));
  });

  it('separates violations it could not trace to source, and says why', () => {
    const untraceable = violation({
      targets: [{ selector: 'html > img', html: '<img>', source: null }],
    });
    const output = formatConsoleReport([result({ violations: [untraceable] })], { lang: 'fr' });

    expect(output).toContain('non rattaché à un fichier source');
    expect(output).toContain('html > img');
  });

  it('caps repeated occurrences of one rule and says how many were hidden', () => {
    const many = violation({
      targets: Array.from({ length: 9 }, (_, index) => ({
        selector: `img:nth-child(${index})`,
        html: '<img>',
        source: { file: 'src/app/app.html', line: index + 1, column: 1 },
      })),
    });
    const output = formatConsoleReport([result({ violations: [many] })], { lang: 'fr' });

    expect(output).toContain('4 autre(s) pour image-alt');
  });

  it('lists every occurrence when asked', () => {
    const many = violation({
      targets: Array.from({ length: 9 }, (_, index) => ({
        selector: 'img',
        html: '<img>',
        source: { file: 'src/app/app.html', line: index + 1, column: 1 },
      })),
    });
    const output = formatConsoleReport([result({ violations: [many] })], { verbose: true, lang: 'fr' });

    expect(output).not.toContain('more of');
    expect(output).toContain('9:1');
  });

  it('always states that conformance is established by human audit', () => {
    // The regulated figure comes from a human audit; implying otherwise would be
    // a legally misleading claim, so it is said on every run.
    const output = formatConsoleReport([result()], { lang: 'fr' });

    expect(output).toContain("La conformité RGAA s'établit par un audit humain");
    expect(output).toContain('non un verdict rendu sur eux');
  });

  it('always says how much of the reference frame it could not check', () => {
    // Roughly three quarters of RGAA cannot be automated. A report showing only
    // what it checked is how an automated score gets read as a conformance rate.
    const output = formatConsoleReport([
      result({
        coverage: {
          version: '4.1.2',
          totalCriteria: 106,
          referenced: ['1.1', '1.2'],
          failing: ['1.1'],
          needingReview: ['3.2'],
          silent: 104,
        },
      }),
    ], { lang: 'fr' });

    expect(output).toContain('2 critère(s) examiné(s) sur 106');
    expect(output).toContain('104 hors de portée de tout contrôle automatique');
    expect(output).toContain('1 à vérifier');
  });

  it('reports a clean page plainly', () => {
    const output = formatConsoleReport([result()], { lang: 'fr' });
    expect(output).toContain('aucune anomalie détectée automatiquement');
  });

  it('surfaces concrete elements a human has to look at', () => {
    const output = formatConsoleReport([
      result({
        manualChecks: [
          { ruleId: 'color-contrast', question: 'Check contrast', wcag: ['1.4.3'], rgaa: ['3.2'], targets: [] },
        ],
      }),
    ], { lang: 'fr' });

    // Distinct from the criteria tally: this counts places to go and look.
    expect(output).toContain('1 point(s) à vérifier par un humain');
  });
});
