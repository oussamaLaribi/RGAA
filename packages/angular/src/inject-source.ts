import {
  SOURCE_ATTRIBUTE,
  formatSourceLocation,
  hasAttribute,
  type TemplateElement,
} from '@rgaa-source/core';
import { parseTemplateElements } from './template-ast.js';

/**
 * Elements that never produce a DOM node, so they can never carry a violation.
 * Instrumenting them would be inert at best and, for `ng-template`, misleading.
 */
const NON_RENDERING = new Set(['ng-container', 'ng-template']);

export interface InjectionResult {
  /** The rewritten template. Byte-identical to the input where nothing was added. */
  code: string;
  /** Number of elements that received a location. */
  injected: number;
  /** Parse errors. When non-empty, `code` is the untouched input. */
  errors: string[];
}

function shouldInstrument(element: TemplateElement): boolean {
  if (NON_RENDERING.has(element.tagName)) return false;
  // Idempotent: re-instrumenting an already-instrumented file must be a no-op,
  // because a failed run may leave templates rewritten and be retried.
  return !hasAttribute(element, SOURCE_ATTRIBUTE);
}

/**
 * Find where to insert an attribute inside an opening tag: before the `/` of a
 * self-closing tag, otherwise before the final `>`.
 */
function insertionOffset(source: string, element: TemplateElement): number | null {
  const openingTag = source.slice(element.openStart, element.openEnd);
  const closingBracket = openingTag.lastIndexOf('>');
  if (closingBracket === -1) return null;

  const selfClosing = openingTag[closingBracket - 1] === '/';
  return element.openStart + (selfClosing ? closingBracket - 1 : closingBracket);
}

/**
 * Rewrite an Angular template so every rendered element carries the file, line
 * and column it was written at.
 *
 * This is the bridge the whole product rests on. A violation found at runtime
 * reads its own address off the DOM instead of being matched back to source by
 * heuristics, so the reported location is exact or absent — never a guess.
 *
 * The rewrite is pure text insertion at offsets the compiler reported. The AST
 * is never re-serialised, so formatting, whitespace, bindings and control-flow
 * syntax survive untouched.
 */
export function injectSourceAttributes(source: string, filePath: string): InjectionResult {
  const { elements, errors } = parseTemplateElements(source, filePath);
  if (errors.length > 0) return { code: source, injected: 0, errors };

  const edits: { at: number; text: string }[] = [];
  for (const element of elements) {
    if (!shouldInstrument(element)) continue;

    const at = insertionOffset(source, element);
    if (at === null) continue;

    const location = formatSourceLocation({
      file: filePath,
      line: element.line,
      column: element.column,
    });
    // `<input />` already has a space before the slash; adding another would
    // leave the rewritten templates visibly untidy in diffs and editors.
    const previous = source[at - 1] ?? '';
    const separator = previous.trim() === '' ? '' : ' ';
    edits.push({ at, text: `${separator}${SOURCE_ATTRIBUTE}="${location}"` });
  }

  // Apply back to front so each offset still refers to the original string.
  edits.sort((a, b) => b.at - a.at);

  let code = source;
  for (const edit of edits) {
    code = code.slice(0, edit.at) + edit.text + code.slice(edit.at);
  }

  return { code, injected: edits.length, errors: [] };
}
