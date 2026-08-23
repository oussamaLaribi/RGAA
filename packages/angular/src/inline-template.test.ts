import { describe, expect, it } from 'vitest';
import { findInlineTemplates } from './inline-template.js';

const only = (source: string): string | null => {
  const found = findInlineTemplates(source);
  return found.length === 1 ? (found[0]?.content ?? null) : null;
};

describe('findInlineTemplates', () => {
  it('finds the template of a component', () => {
    const source = [
      "@Component({",
      "  selector: 'app-badge',",
      '  template: `<span class="badge">{{ label }}</span>`,',
      '})',
      'export class BadgeComponent {}',
    ].join('\n');

    expect(only(source)).toBe('<span class="badge">{{ label }}</span>');
  });

  it('reports where the content starts in the file', () => {
    const source = ['@Component({', '  template: `<p>hi</p>`,', '})'].join('\n');
    const [found] = findInlineTemplates(source);

    // Line 2, and the column just after the backtick — this is what every
    // reported location is then measured from, so being off by one here is off
    // by one in every finding the file produces.
    expect(found?.line).toBe(2);
    expect(found?.column).toBe(14);
    expect(source.slice(found!.start, found!.end)).toBe('<p>hi</p>');
  });

  it('ignores templateUrl, which names a file rather than holding markup', () => {
    const source = "@Component({ templateUrl: './x.html', styles: [`p{}`] })";

    expect(findInlineTemplates(source)).toEqual([]);
  });

  it('ignores other backtick strings in the same decorator', () => {
    // `styles` is a template literal too, and instrumenting CSS would be absurd.
    const source = '@Component({ styles: [`p { color: red }`], template: `<p></p>` })';

    expect(only(source)).toBe('<p></p>');
  });

  it('accepts the quoted property form', () => {
    expect(only("@Component({ 'template': `<b></b>` })")).toBe('<b></b>');
  });

  it('is not fooled by the word template inside a string', () => {
    const source = ["const message = 'template: nope';", '@Component({ template: `<i></i>` })'].join(
      '\n',
    );

    expect(only(source)).toBe('<i></i>');
  });

  it('is not fooled by a commented-out template', () => {
    const source = [
      '// template: `<del>old</del>`',
      '/* template: `<del>older</del>` */',
      '@Component({ template: `<ins>new</ins>` })',
    ].join('\n');

    expect(only(source)).toBe('<ins>new</ins>');
  });

  it('walks past an escaped backtick rather than stopping at it', () => {
    // Stopping here would report a literal whose end is somewhere else entirely,
    // and every offset after it would be wrong.
    const source = '@Component({ template: `<p>a \\` b</p>` })';

    expect(only(source)).toBe('<p>a \\` b</p>');
  });

  it('walks through an interpolation that contains its own backticks', () => {
    // ${...} holds arbitrary code, including further template literals. Counting
    // backticks instead of walking the code stops at the wrong one.
    const source = '@Component({ template: `<p>${ inner(`x`) }</p>` })';

    expect(only(source)).toBe('<p>${ inner(`x`) }</p>');
  });

  it('handles nested braces inside an interpolation', () => {
    const source = '@Component({ template: `<p>${ f({ a: { b: 1 } }) }</p>` })';

    expect(only(source)).toBe('<p>${ f({ a: { b: 1 } }) }</p>');
  });

  it('finds every component in a file that declares several', () => {
    const source = [
      '@Component({ template: `<one></one>` })',
      'export class One {}',
      '@Component({ template: `<two></two>` })',
      'export class Two {}',
    ].join('\n');

    expect(findInlineTemplates(source).map((t) => t.content)).toEqual([
      '<one></one>',
      '<two></two>',
    ]);
  });

  it('gives up rather than guess on source it cannot follow', () => {
    // An unterminated string makes everything after it unreadable. Resynchronising
    // on a guess is how a scanner ends up rewriting the wrong region of a file.
    expect(findInlineTemplates("const broken = 'oops\n@Component({ template: `<p></p>` })")).toEqual(
      [],
    );
  });

  it('finds nothing in a file that has no inline template', () => {
    expect(findInlineTemplates('export class Plain {}')).toEqual([]);
    expect(findInlineTemplates('')).toEqual([]);
  });

  it('does not mistake a division for a comment', () => {
    const source = ['const ratio = a / b;', '@Component({ template: `<p></p>` })'].join('\n');

    expect(only(source)).toBe('<p></p>');
  });
});
