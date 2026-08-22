import { describe, expect, it } from 'vitest';
import { SOURCE_ATTRIBUTE, parseSourceLocation } from '@rgaa-source/core';
import { injectSourceAttributes } from './inject-source.js';
import { parseTemplateElements } from './template-ast.js';

const FILE = 'checkout.component.html';

/**
 * The golden check the product rests on: every injected location must point at
 * the exact spot in the ORIGINAL source where that element was written.
 *
 * It re-parses the rewritten template, reads each element's location back
 * through the same parser the runtime uses, and asserts the original text at
 * that line and column really does open that tag. A location that is merely
 * plausible is a bug: a developer sent to the wrong line loses more time than
 * one sent nowhere at all.
 *
 * Returns the number of elements verified, so callers can also assert that
 * nothing was silently skipped.
 */
function expectEveryElementLocatable(source: string): number {
  const { code, errors } = injectSourceAttributes(source, FILE);
  expect(errors).toEqual([]);

  const reparsed = parseTemplateElements(code, FILE);
  expect(reparsed.errors).toEqual([]);

  const originalLines = source.split('\n');
  let verified = 0;

  for (const element of reparsed.elements) {
    const attribute = element.attributes.find((entry) => entry.name === SOURCE_ATTRIBUTE);
    expect(attribute, `no location on <${element.tagName}>`).toBeDefined();

    const location = parseSourceLocation(attribute!.value);
    expect(location, `unparsable location on <${element.tagName}>`).not.toBeNull();
    expect(location!.file).toBe(FILE);

    const textAtLocation = originalLines[location!.line - 1]?.slice(location!.column - 1) ?? '';
    expect(
      textAtLocation.startsWith(`<${element.tagName}`),
      `<${element.tagName}> claims ${location!.line}:${location!.column}, but the source there is ${JSON.stringify(textAtLocation.slice(0, 40))}`,
    ).toBe(true);

    verified++;
  }

  return verified;
}

describe('injectSourceAttributes', () => {
  it('locates every element of a realistic template', () => {
    const source = [
      '<div class="wrapper">',
      '  <img src="product.jpg">',
      '  <button (click)="close()"><svg><path /></svg></button>',
      '  <a href="#">go</a>',
      '  <textarea></textarea>',
      '</div>',
    ].join('\n');

    expect(expectEveryElementLocatable(source)).toBe(7);
  });

  it('reaches inside every control-flow block', () => {
    const source = [
      '@if (user) {',
      '  <input type="email" [value]="email" />',
      '} @else {',
      '  <p>anonymous</p>',
      '}',
      '@for (item of items; track item.id) {',
      '  <li>{{ item.name }}</li>',
      '} @empty {',
      '  <li>none</li>',
      '}',
      '@switch (mode) {',
      '  @case ("a") { <span>A</span> }',
      '  @default { <span>D</span> }',
      '}',
      '@defer {',
      '  <article>content</article>',
      '} @placeholder {',
      '  <div>loading</div>',
      '}',
    ].join('\n');

    // A plain `children` walk finds none of these; all eight must be reached.
    expect(expectEveryElementLocatable(source)).toBe(8);
  });

  it('places the attribute before the slash of a self-closing tag', () => {
    const { code } = injectSourceAttributes('<input type="email" />', FILE);
    // Reuses the space that was already there rather than doubling it.
    expect(code).toBe(`<input type="email" ${SOURCE_ATTRIBUTE}="${FILE}:1:1"/>`);
  });

  it('skips elements that render no DOM node', () => {
    const source = '<ng-container *ngIf="x"><a href="#">go</a></ng-container>';
    const { code, injected } = injectSourceAttributes(source, FILE);

    expect(injected).toBe(1);
    expect(code).toContain(`<a href="#" ${SOURCE_ATTRIBUTE}=`);
    expect(code).toContain('<ng-container *ngIf="x">');
  });

  it('is idempotent, so a retried run cannot double-inject', () => {
    const source = '<div><img src="a.png"></div>';
    const once = injectSourceAttributes(source, FILE).code;
    const twice = injectSourceAttributes(once, FILE);

    expect(twice.injected).toBe(0);
    expect(twice.code).toBe(once);
  });

  it('preserves bindings, interpolation and formatting verbatim', () => {
    const source = [
      '<div',
      '   [class.active]="isActive"',
      '   (click)="go($event)">',
      '  {{ label | uppercase }}',
      '</div>',
    ].join('\n');

    const { code } = injectSourceAttributes(source, FILE);

    // Removing what we added must give back the input, byte for byte.
    const stripped = code
      .split(` ${SOURCE_ATTRIBUTE}="`)
      .map((part, index) => (index === 0 ? part : part.slice(part.indexOf('"') + 1)))
      .join('');
    expect(stripped).toBe(source);
  });

  it('leaves a broken template untouched and reports the error', () => {
    const source = '<div><span></div>';
    const { code, injected, errors } = injectSourceAttributes(source, FILE);

    expect(errors.length).toBeGreaterThan(0);
    expect(injected).toBe(0);
    expect(code).toBe(source);
  });
});
