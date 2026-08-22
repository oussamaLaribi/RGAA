import { attributeOf, type TemplateAttribute, type TemplateElement } from '@rgaa-source/core';
import type { TextEdit } from './types.js';

/** Where a new attribute goes: before the `/` of a self-closing tag, else before `>`. */
function attributeInsertionPoint(element: TemplateElement, source: string): number | null {
  const openingTag = source.slice(element.openStart, element.openEnd);
  const bracket = openingTag.lastIndexOf('>');
  if (bracket === -1) return null;

  const selfClosing = openingTag[bracket - 1] === '/';
  return element.openStart + (selfClosing ? bracket - 1 : bracket);
}

/** Add an attribute, or replace its value if it is already there. */
export function setAttribute(
  element: TemplateElement,
  source: string,
  name: string,
  value: string,
): TextEdit | null {
  const existing = attributeOf(element, name);

  if (existing) {
    // Rewrite the whole attribute rather than just the value: a valueless
    // attribute has no value span to replace.
    return { start: existing.start, end: existing.end, replacement: `${name}="${value}"` };
  }

  const at = attributeInsertionPoint(element, source);
  if (at === null) return null;

  const previous = source[at - 1] ?? '';
  const separator = previous.trim() === '' ? '' : ' ';
  return { start: at, end: at, replacement: `${separator}${name}="${value}"` };
}

/**
 * Remove an attribute, taking the whitespace in front of it.
 *
 * Without that, removing `tabindex` from `<a href="#" tabindex="3">` leaves a
 * double space. The edit has to be invisible in review apart from the attribute
 * itself, or developers stop trusting it.
 */
export function removeAttribute(attribute: TemplateAttribute, source: string): TextEdit {
  // Take the whitespace that introduced this attribute, and only that. Whatever
  // follows keeps its own leading whitespace, so nothing has to be put back and
  // an attribute written on its own line does not collapse the ones after it.
  let start = attribute.start;
  while (start > 0 && (source[start - 1] ?? '').trim() === '') start--;

  return { start, end: attribute.end, replacement: '' };
}

/**
 * Insert markup as the first child of an element, matching the indentation
 * already used inside it so the result does not have to be reformatted.
 */
export function insertChild(
  element: TemplateElement,
  source: string,
  markup: string,
): TextEdit | null {
  if (element.closeStart === null || element.closeStart === element.openStart) return null;

  const inner = source.slice(element.openEnd, element.closeStart);
  const existingIndent = /\n([ \t]+)\S/.exec(inner)?.[1];
  const indent = existingIndent ?? '  ';

  return { start: element.openEnd, end: element.openEnd, replacement: `\n${indent}${markup}` };
}

/**
 * Replace everything between an element's tags.
 *
 * Only for elements whose content is plain text, such as `<title>`: used on
 * anything holding markup it would silently delete children.
 */
export function replaceContent(
  element: TemplateElement,
  source: string,
  text: string,
): TextEdit | null {
  if (element.closeStart === null || element.closeStart === element.openStart) return null;
  return { start: element.openEnd, end: element.closeStart, replacement: text };
}

/** Rename an element, opening and closing tags together. */
export function renameTag(
  element: TemplateElement,
  source: string,
  tagName: string,
): TextEdit[] {
  const edits: TextEdit[] = [
    {
      start: element.openStart + 1,
      end: element.openStart + 1 + element.tagName.length,
      replacement: tagName,
    },
  ];

  // A void or self-closing element reports its closing span as the whole tag,
  // so an offset equal to the opening one means there is nothing else to rename.
  const hasClosingTag = element.closeStart !== null && element.closeStart !== element.openStart;
  if (hasClosingTag) {
    const closing = source.slice(element.closeStart!, element.closeEnd!);
    if (closing.startsWith('</')) {
      edits.push({
        start: element.closeStart! + 2,
        end: element.closeStart! + 2 + element.tagName.length,
        replacement: tagName,
      });
    }
  }

  return edits;
}

/**
 * Apply edits to a source string.
 *
 * Applies back to front so every offset still refers to the original text, and
 * refuses to apply overlapping edits rather than producing mangled markup from
 * two fixes that both wanted the same span.
 */
export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);

  let result = source;
  let previousStart = Number.POSITIVE_INFINITY;

  for (const edit of ordered) {
    if (edit.end > previousStart) {
      throw new Error(
        `overlapping edits at ${edit.start}-${edit.end} and ${previousStart}; refusing to write`,
      );
    }
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    previousStart = edit.start;
  }

  return result;
}
