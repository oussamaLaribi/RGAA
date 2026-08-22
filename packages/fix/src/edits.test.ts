import { describe, expect, it } from 'vitest';
import { parseTemplateElements } from '@rgaa-source/angular';
import { attributeOf, type TemplateElement } from '@rgaa-source/core';
import { applyEdits, insertChild, removeAttribute, renameTag, setAttribute } from './edits.js';

function parse(source: string): { source: string; elements: TemplateElement[] } {
  const parsed = parseTemplateElements(source, 'f.html');
  expect(parsed.errors).toEqual([]);
  return { source, elements: parsed.elements };
}

/** Apply one element-level edit and return the rewritten source. */
function edit(source: string, make: (element: TemplateElement, source: string) => unknown): string {
  const { elements } = parse(source);
  const result = make(elements[0]!, source);
  const edits = Array.isArray(result) ? result : [result];
  return applyEdits(source, edits.filter(Boolean) as never);
}

describe('setAttribute', () => {
  it('adds an attribute before the closing bracket', () => {
    const out = edit('<img src="a.png">', (el, src) => setAttribute(el, src, 'alt', 'chat'));
    expect(out).toBe('<img src="a.png" alt="chat">');
  });

  it('adds it before the slash of a self-closing tag', () => {
    const out = edit('<input type="text" />', (el, src) => setAttribute(el, src, 'alt', 'x'));
    expect(out).toBe('<input type="text" alt="x"/>');
  });

  it('replaces an existing value rather than adding a duplicate', () => {
    const out = edit('<img alt="old" src="a.png">', (el, src) => setAttribute(el, src, 'alt', 'new'));
    expect(out).toBe('<img alt="new" src="a.png">');
  });

  it('gives a value to an attribute that had none', () => {
    // A valueless attribute has no value span, so the whole attribute is rewritten.
    const out = edit('<img alt src="a.png">', (el, src) => setAttribute(el, src, 'alt', 'chat'));
    expect(out).toBe('<img alt="chat" src="a.png">');
  });
});

describe('removeAttribute', () => {
  it('takes the whitespace in front of it', () => {
    // Leaving `<a href="#"  >` would make developers distrust the whole diff.
    const out = edit('<a href="#" tabindex="3">', (el, src) =>
      removeAttribute(attributeOf(el, 'tabindex')!, src),
    );
    expect(out).toBe('<a href="#">');
  });

  it('does not run two attributes together when removing the one between them', () => {
    const out = edit('<a tabindex="3" href="#">', (el, src) =>
      removeAttribute(attributeOf(el, 'tabindex')!, src),
    );
    expect(out).toBe('<a href="#">');
  });

  it('preserves attributes written on their own lines', () => {
    // Taking only the leading whitespace means the layout of the remaining
    // attributes survives, so the diff shows one removal and nothing else.
    const source = ['<a', '  tabindex="3"', '  href="#">'].join('\n');
    const out = edit(source, (el, src) => removeAttribute(attributeOf(el, 'tabindex')!, src));

    expect(out).toBe(['<a', '  href="#">'].join('\n'));
  });
});

describe('renameTag', () => {
  it('renames both the opening and closing tags', () => {
    const out = edit('<h4>titre</h4>', (el, src) => renameTag(el, src, 'h2'));
    expect(out).toBe('<h2>titre</h2>');
  });

  it('leaves a void element with no closing tag alone', () => {
    const out = edit('<img src="a.png">', (el, src) => renameTag(el, src, 'picture'));
    expect(out).toBe('<picture src="a.png">');
  });

  it('keeps attributes and children untouched', () => {
    const out = edit('<h3 class="x">a <b>b</b></h3>', (el, src) => renameTag(el, src, 'h2'));
    expect(out).toBe('<h2 class="x">a <b>b</b></h2>');
  });
});

describe('insertChild', () => {
  it('inserts using the indentation already inside the element', () => {
    const source = ['<head>', '    <meta charset="utf-8">', '</head>'].join('\n');
    const out = edit(source, (el, src) => insertChild(el, src, '<title>x</title>'));

    expect(out).toBe(
      ['<head>', '    <title>x</title>', '    <meta charset="utf-8">', '</head>'].join('\n'),
    );
  });

  it('declines on an element that has no closing tag to insert into', () => {
    const { elements } = parse('<img src="a.png">');
    expect(insertChild(elements[0]!, '<img src="a.png">', '<title>x</title>')).toBeNull();
  });
});

describe('applyEdits', () => {
  it('applies several edits without offsets drifting', () => {
    const source = '<img src="a.png"><img src="b.png">';
    const { elements } = parse(source);
    const edits = elements.map((element) => setAttribute(element, source, 'alt', 'x')!);

    expect(applyEdits(source, edits)).toBe('<img src="a.png" alt="x"><img src="b.png" alt="x">');
  });

  it('refuses overlapping edits instead of producing mangled markup', () => {
    // Two fixes wanting the same span is a bug in the plan; writing whichever
    // wins would corrupt the file silently.
    expect(() =>
      applyEdits('<img>', [
        { start: 0, end: 5, replacement: 'a' },
        { start: 2, end: 4, replacement: 'b' },
      ]),
    ).toThrow(/overlapping/);
  });

  it('leaves the source untouched when there is nothing to do', () => {
    expect(applyEdits('<img>', [])).toBe('<img>');
  });
});
