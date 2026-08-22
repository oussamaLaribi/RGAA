import { describe, expect, it } from 'vitest';
import { parseTemplateElements } from '@rgaa-source/angular';
import type { Violation, ViolationTarget } from '@rgaa-source/core';
import { applyEdits } from './edits.js';
import { fixerFor, FIXERS } from './fixers.js';
import { PLACEHOLDER } from './types.js';

const violation: Violation = {
  ruleId: 'x',
  severity: 'serious',
  message: '',
  help: '',
  recommendation: '',
  wcag: [],
  rgaa: [],
  targets: [],
  origin: 'axe',
};
const target: ViolationTarget = { selector: '', html: '', source: null };

/** Run the fixer for `ruleId` against the element at `index` and return the result. */
function fix(ruleId: string, source: string, index = 0): string | null {
  const fixer = fixerFor(ruleId);
  expect(fixer, `no fixer for ${ruleId}`).toBeDefined();

  const parsed = parseTemplateElements(source, 'f.html');
  expect(parsed.errors).toEqual([]);

  const edits = fixer!.propose({
    element: parsed.elements[index]!,
    elements: parsed.elements,
    source,
    violation,
    target,
  });

  return edits ? applyEdits(source, edits) : null;
}

describe('safe fixers', () => {
  it('only classifies a fix as safe when it needs no knowledge of the page', () => {
    const safe = FIXERS.filter((fixer) => fixer.level === 'safe').map((fixer) => fixer.ruleId);

    // Every text-authoring fix must be a suggestion: no tool can know what an
    // image shows or what a button does, and a confidently wrong alternative is
    // worse than a missing one because a screen reader user believes it.
    expect(safe).not.toContain('image-alt');
    expect(safe).not.toContain('button-name');
    expect(safe).not.toContain('link-name');
    expect(safe).not.toContain('label');
  });

  it('removes a positive tabindex', () => {
    expect(fix('tabindex', '<a href="#" tabindex="3">go</a>')).toBe('<a href="#">go</a>');
  });

  it('leaves tabindex="-1" and tabindex="0" alone', () => {
    // Both are legitimate; only a positive value breaks the tab order.
    expect(fix('tabindex', '<div tabindex="-1"></div>')).toBeNull();
    expect(fix('tabindex', '<div tabindex="0"></div>')).toBeNull();
  });

  it('re-enables zooming without discarding the rest of the viewport', () => {
    const out = fix(
      'meta-viewport',
      '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">',
    );

    expect(out).toContain('width=device-width');
    expect(out).toContain('initial-scale=1');
    expect(out).not.toContain('user-scalable');
  });

  it('declines when the viewport already allows zooming', () => {
    expect(fix('meta-viewport', '<meta name="viewport" content="width=device-width">')).toBeNull();
  });
});

describe('suggested fixers', () => {
  it('marks generated text so an unedited placeholder cannot ship quietly', () => {
    expect(fix('image-alt', '<img src="a.png">')).toBe(`<img src="a.png" alt="${PLACEHOLDER}">`);
    expect(fix('button-name', '<button></button>')).toContain(PLACEHOLDER);
    expect(fix('label', '<input type="email">')).toContain(PLACEHOLDER);
  });

  it('writes the page title into head, not onto the reported element', () => {
    const source = ['<html>', '<head>', '  <meta charset="utf-8">', '</head>', '</html>'].join('\n');
    const out = fix('document-title', source);

    expect(out).toContain(`<title>${PLACEHOLDER}</title>`);
    expect(out!.indexOf('<title>')).toBeGreaterThan(out!.indexOf('<head>'));
    expect(out!.indexOf('<title>')).toBeLessThan(out!.indexOf('</head>'));
  });

  it('does not add a second title when one already exists', () => {
    const source = '<html><head><title>a</title></head></html>';
    expect(fix('document-title', source)).toBeNull();
  });
});

describe('heading-order fixer', () => {
  it('steps down from the preceding heading rather than by one level', () => {
    // Between an h1 and an h4, lowering by one still leaves a gap — and a fix
    // that does not resolve the violation is worse than none: it looks done.
    const out = fix('heading-order', '<h1>a</h1><h4>b</h4>', 1);
    expect(out).toBe('<h1>a</h1><h2>b</h2>');
  });

  it('follows a nearer heading when there is one', () => {
    const out = fix('heading-order', '<h1>a</h1><h2>b</h2><h5>c</h5>', 2);
    expect(out).toBe('<h1>a</h1><h2>b</h2><h3>c</h3>');
  });

  it('promotes a heading that opens the file to h1', () => {
    expect(fix('heading-order', '<h3>a</h3>')).toBe('<h1>a</h1>');
  });

  it('declines when the level is already right', () => {
    expect(fix('heading-order', '<h1>a</h1><h2>b</h2>', 1)).toBeNull();
  });

  it('never goes past h6', () => {
    const out = fix('heading-order', '<h6>a</h6><h6>b</h6>', 1);
    expect(out).toBeNull();
  });
});

describe('the fixer registry', () => {
  it('has one fixer per rule', () => {
    const ids = FIXERS.map((fixer) => fixer.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns nothing for a rule with no fixer', () => {
    expect(fixerFor('color-contrast')).toBeUndefined();
  });
});
