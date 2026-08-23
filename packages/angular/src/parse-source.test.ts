import { describe, expect, it } from 'vitest';
import { parseSourceFile } from './parse-source.js';

describe('parseSourceFile', () => {
  it('reads a template file as before', () => {
    const { elements, errors } = parseSourceFile('<p><span></span></p>', 'a.html');

    expect(errors).toEqual([]);
    expect(elements.map((element) => element.tagName)).toEqual(['p', 'span']);
    expect(elements[0]?.line).toBe(1);
  });

  it('reports an inline template in the coordinates of its own file', () => {
    // The fixers match an element by the line and column a violation reported,
    // then edit at its offsets. Both have to describe the .ts file, not the
    // template — otherwise nothing matches and a fixable finding is silently
    // reported as having no fixer.
    const source = ['@Component({', '  template: `<p>', '    <img>', '  </p>`,', '})'].join('\n');
    const { elements } = parseSourceFile(source, 'x.component.ts');

    const p = elements.find((element) => element.tagName === 'p');
    const img = elements.find((element) => element.tagName === 'img');

    expect(p?.line).toBe(2);
    // First line only: it starts after `template: \``.
    expect(p?.column).toBe(14);
    expect(img?.line).toBe(3);
    // Later lines start at column 1 of the file like any other.
    expect(img?.column).toBe(5);
  });

  it('gives offsets that point into the file, not into the template', () => {
    const source = '@Component({ template: `<img>` })';
    const [img] = parseSourceFile(source, 'x.component.ts').elements;

    expect(source.slice(img!.openStart, img!.openEnd)).toBe('<img>');
  });

  it('shifts attribute offsets too', () => {
    const source = '@Component({ template: `<img src="a.png">` })';
    const [img] = parseSourceFile(source, 'x.component.ts').elements;
    const src = img?.attributes[0];

    expect(source.slice(src!.start, src!.end)).toBe('src="a.png"');
  });

  it('collects every inline template in the file', () => {
    const source = [
      '@Component({ template: `<one>` })',
      'export class One {}',
      '@Component({ template: `<two>` })',
    ].join('\n');

    expect(parseSourceFile(source, 'x.ts').elements.map((e) => e.tagName)).toEqual(['one', 'two']);
  });

  it('lets one broken template cost only its own findings', () => {
    // A single experimental component should not put a whole codebase's fixes
    // out of reach.
    const source = [
      '@Component({ template: `<div></span>` })',
      '@Component({ template: `<ok>` })',
    ].join('\n');
    const { elements, errors } = parseSourceFile(source, 'x.ts');

    expect(errors.length).toBeGreaterThan(0);
    expect(elements.map((e) => e.tagName)).toEqual(['ok']);
  });

  it('finds nothing in a TypeScript file that holds no template', () => {
    expect(parseSourceFile('export class Plain {}', 'x.ts').elements).toEqual([]);
  });
});
