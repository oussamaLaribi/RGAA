import { describe, expect, it } from 'vitest';
import { normalizeReport, stripSourceAttribute } from './normalize.js';
import type { RawAxeReport, RawRuleResult } from './collect.js';

const rule = (over: Partial<RawRuleResult> = {}): RawRuleResult => ({
  id: 'image-alt',
  impact: 'critical',
  tags: ['cat.text-alternatives', 'wcag2a', 'wcag111'],
  help: 'Images must have alternative text',
  description: 'Ensures <img> elements have alternate text',
  helpUrl: 'https://example.test/image-alt',
  nodes: [
    {
      html: '<img src="a.png" data-a11y-src="src/app/app.html:3:3">',
      target: ['img'],
      source: 'src/app/app.html:3:3',
      failureSummary: 'Add an alt attribute',
    },
  ],
  ...over,
});

const report = (over: Partial<RawAxeReport> = {}): RawAxeReport => ({
  url: 'http://127.0.0.1:1234/',
  violations: [],
  passes: [],
  incomplete: [],
  inapplicable: [],
  ...over,
});

describe('stripSourceAttribute', () => {
  it('removes our instrumentation from a snippet', () => {
    const html = '<img src="a.png" data-a11y-src="src/app/app.html:3:3" alt="">';
    expect(stripSourceAttribute(html)).toBe('<img src="a.png" alt="">');
  });

  it('removes every occurrence, including on nested elements', () => {
    const html = '<button data-a11y-src="a.html:1:1"><svg data-a11y-src="a.html:1:9"></svg></button>';
    expect(stripSourceAttribute(html)).toBe('<button><svg></svg></button>');
  });

  it('leaves untouched markup alone', () => {
    expect(stripSourceAttribute('<img src="a.png">')).toBe('<img src="a.png">');
  });

  it('removes the attributes Angular stamps on at runtime', () => {
    // Seen on a real project: these are style-encapsulation markers, not markup
    // anyone wrote, and leaving them in sends developers hunting for an
    // attribute that is not in their file.
    const rendered = '<div _ngcontent-ng-c566006033="" class="banner">x</div>';
    expect(stripSourceAttribute(rendered)).toBe('<div class="banner">x</div>');
  });

  it('removes host and reflect markers too', () => {
    const rendered = '<app-root _nghost-ng-c12="" ng-reflect-value="3" id="root">';
    expect(stripSourceAttribute(rendered)).toBe('<app-root id="root">');
  });

  it('keeps attributes whose names merely start similarly', () => {
    const kept = '<div data-ngcontent="1" nghost="2">';
    expect(stripSourceAttribute(kept)).toBe(kept);
  });

  it('preserves valueless attributes and single quotes', () => {
    const markup = `<input disabled _ngcontent-c1='' name='q'>`;
    expect(stripSourceAttribute(markup)).toBe(`<input disabled name='q'>`);
  });
});

describe('normalizeReport', () => {
  it('attaches the source location to each target', () => {
    const result = normalizeReport(report({ violations: [rule()] }));
    const target = result.violations[0]!.targets[0]!;

    expect(target.source).toEqual({ file: 'src/app/app.html', line: 3, column: 3 });
  });

  it('hides the instrumentation attribute from the snippet shown to the developer', () => {
    const result = normalizeReport(report({ violations: [rule()] }));

    // Showing it would send someone to fix markup they never wrote.
    expect(result.violations[0]!.targets[0]!.html).toBe('<img src="a.png">');
  });

  it('reports no location for a page that was never instrumented', () => {
    const uninstrumented = rule({
      nodes: [{ html: '<img src="a.png">', target: ['img'], source: null, failureSummary: null }],
    });
    const result = normalizeReport(report({ violations: [uninstrumented] }));

    // Absent, never guessed: a developer sent to the wrong line loses more time
    // than one sent nowhere.
    expect(result.violations[0]!.targets[0]!.source).toBeNull();
  });

  it('derives WCAG criteria from axe tags', () => {
    const result = normalizeReport(
      report({ violations: [rule({ tags: ['wcag2a', 'wcag244', 'wcag412', 'best-practice'] })] }),
    );

    expect(result.violations[0]!.wcag).toEqual(['2.4.4', '4.1.2']);
  });

  it('falls back to a defined severity when axe reports an unexpected impact', () => {
    const result = normalizeReport(report({ violations: [rule({ impact: 'catastrophic' })] }));

    expect(result.violations[0]!.severity).toBe('moderate');
  });

  it('turns axe incomplete results into checks that need a human', () => {
    const result = normalizeReport(
      report({ incomplete: [rule({ id: 'color-contrast', tags: ['wcag2aa', 'wcag143'] })] }),
    );

    // Roughly three quarters of RGAA cannot be automated, so these are a
    // first-class result rather than a footnote.
    expect(result.manualChecks).toHaveLength(1);
    expect(result.manualChecks[0]!.ruleId).toBe('color-contrast');
    expect(result.manualChecks[0]!.wcag).toEqual(['1.4.3']);
    expect(result.violations).toHaveLength(0);
  });

  it('counts passes and incompletes in the score denominator', () => {
    const failing = normalizeReport(report({ violations: [rule()] }));
    const mostlyPassing = normalizeReport(
      report({
        violations: [rule()],
        passes: [rule({ impact: null, nodes: Array.from({ length: 99 }, () => rule().nodes[0]!) })],
      }),
    );

    // One broken image among a hundred must score better than one among one.
    expect(mostlyPassing.score.value).toBeGreaterThan(failing.score.value);
  });

  it('excludes rules that examined nothing', () => {
    const result = normalizeReport(
      report({ violations: [rule()], inapplicable: [rule({ id: 'table-scope', nodes: [] })] }),
    );

    expect(result.score.applicableRules).toBe(1);
  });

  it('records the route rather than the ephemeral served address', () => {
    const result = normalizeReport(report(), { url: '/checkout' });

    // Ports change between runs; results have to stay comparable.
    expect(result.url).toBe('/checkout');
  });

  it('stamps the engine and reference-frame versions on every result', () => {
    const result = normalizeReport(report());

    expect(result.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.rgaaVersion).toBe('4.1.2');
  });
});
