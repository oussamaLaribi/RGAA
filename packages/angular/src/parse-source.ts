import type { ParsedTemplate, TemplateElement } from '@rgaa-source/core';
import { parseTemplateElements } from './template-ast.js';
import { findInlineTemplates, type InlineTemplate } from './inline-template.js';

/**
 * Parse any file that can hold a template, and report every element in the
 * coordinates of that file.
 *
 * The fixers work from what this returns: they match an element by the line and
 * column a violation reported, then edit at its offsets. Feeding them a `.ts`
 * file through the plain template parser produced a parse error and no elements
 * at all — so a fixable violation inside an inline template was quietly
 * reported as having no fixer, which is worse than saying nothing.
 *
 * Nothing here is specific to fixing. It is the same translation the
 * instrumentation does, exposed so both work from one definition of where an
 * element is.
 */

/** Shift a template's coordinates into those of the file that contains it. */
function intoFile(element: TemplateElement, origin: InlineTemplate): TemplateElement {
  const shift = (offset: number | null): number | null =>
    offset === null ? null : offset + origin.start;

  return {
    ...element,
    openStart: element.openStart + origin.start,
    openEnd: element.openEnd + origin.start,
    closeStart: shift(element.closeStart),
    closeEnd: shift(element.closeEnd),
    line: origin.line + element.line - 1,
    // Only the first line is offset horizontally: it begins after `template: \``,
    // while the rest begin at column 1 of the file like any other line.
    column: element.line === 1 ? origin.column + element.column - 1 : element.column,
    attributes: element.attributes.map((attribute) => ({
      ...attribute,
      start: attribute.start + origin.start,
      end: attribute.end + origin.start,
      valueStart: shift(attribute.valueStart),
      valueEnd: shift(attribute.valueEnd),
    })),
  };
}

/**
 * Elements of a template file, or of every inline template a TypeScript file
 * declares.
 *
 * One template failing to parse costs its own findings rather than the whole
 * file's: a single experimental component should not put a codebase's fixes out
 * of reach.
 */
export function parseSourceFile(source: string, filePath: string): ParsedTemplate {
  if (!filePath.endsWith('.ts')) return parseTemplateElements(source, filePath);

  const elements: TemplateElement[] = [];
  const errors: string[] = [];

  for (const inline of findInlineTemplates(source)) {
    const parsed = parseTemplateElements(inline.content, filePath);

    if (parsed.errors.length > 0) errors.push(...parsed.errors);
    else elements.push(...parsed.elements.map((element) => intoFile(element, inline)));
  }

  return { elements, errors };
}
