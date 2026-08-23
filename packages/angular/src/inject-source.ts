import {
  SOURCE_ATTRIBUTE,
  formatSourceLocation,
  hasAttribute,
  type TemplateElement,
} from '@rgaa-source/core';
import { parseTemplateElements } from './template-ast.js';
import { findInlineTemplates } from './inline-template.js';

/**
 * Elements that never produce a DOM node, so they can never carry a violation.
 * Instrumenting them would be inert at best and, for `ng-template`, misleading.
 */
const NON_RENDERING = new Set(['ng-container', 'ng-template']);

export interface InjectionResult {
  /** The rewritten file. Byte-identical to the input where nothing was added. */
  code: string;
  /** Number of elements that received a location. */
  injected: number;
  /** Parse errors. When non-empty, `code` is the untouched input. */
  errors: string[];
}

/** One insertion, expressed in offsets into the file being rewritten. */
interface Edit {
  at: number;
  text: string;
}

/**
 * Where a template begins inside the file that holds it.
 *
 * An `.html` file is its own template and starts at the beginning; an inline
 * template starts partway into a `.ts` file, and every position it reports has
 * to be shifted by that much before it means anything to an editor.
 */
interface Origin {
  offset: number;
  line: number;
  column: number;
}

const FILE_START: Origin = { offset: 0, line: 1, column: 1 };

function shouldInstrument(element: TemplateElement): boolean {
  if (NON_RENDERING.has(element.tagName)) return false;
  // Idempotent: re-instrumenting an already-instrumented file must be a no-op,
  // because a failed run may leave files rewritten and be retried.
  return !hasAttribute(element, SOURCE_ATTRIBUTE);
}

/**
 * Find where to insert an attribute inside an opening tag: before the `/` of a
 * self-closing tag, otherwise before the final `>`.
 */
function insertionOffset(template: string, element: TemplateElement): number | null {
  const openingTag = template.slice(element.openStart, element.openEnd);
  const closingBracket = openingTag.lastIndexOf('>');
  if (closingBracket === -1) return null;

  const selfClosing = openingTag[closingBracket - 1] === '/';
  return element.openStart + (selfClosing ? closingBracket - 1 : closingBracket);
}

/**
 * The position an editor should open, given a position inside the template.
 *
 * Only the first line of an inline template is offset horizontally: it starts
 * after `template: \``, whereas every following line starts at column 1 of the
 * file like any other.
 */
function positionInFile(
  origin: Origin,
  element: TemplateElement,
): { line: number; column: number } {
  return {
    line: origin.line + element.line - 1,
    column: element.line === 1 ? origin.column + element.column - 1 : element.column,
  };
}

/** The insertions one template calls for, in offsets into the enclosing file. */
function editsFor(
  template: string,
  filePath: string,
  origin: Origin,
): { edits: Edit[]; errors: string[] } {
  const { elements, errors } = parseTemplateElements(template, filePath);
  if (errors.length > 0) return { edits: [], errors };

  const edits: Edit[] = [];

  for (const element of elements) {
    if (!shouldInstrument(element)) continue;

    const at = insertionOffset(template, element);
    if (at === null) continue;

    const location = formatSourceLocation({ file: filePath, ...positionInFile(origin, element) });
    // `<input />` already has a space before the slash; adding another would
    // leave the rewritten files visibly untidy in diffs and editors.
    const previous = template[at - 1] ?? '';
    const separator = previous.trim() === '' ? '' : ' ';

    edits.push({
      at: origin.offset + at,
      text: `${separator}${SOURCE_ATTRIBUTE}="${location}"`,
    });
  }

  return { edits, errors: [] };
}

/** Apply back to front, so each offset still refers to the original string. */
function applyEdits(source: string, edits: readonly Edit[]): string {
  let code = source;

  for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
    code = code.slice(0, edit.at) + edit.text + code.slice(edit.at);
  }

  return code;
}

/**
 * Rewrite a TypeScript file so every element of its inline templates carries the
 * file, line and column it was written at.
 *
 * The insertions land inside the template literals, so the file's syntax is
 * untouched whatever else happens — the surrounding code is never parsed, only
 * walked well enough to know where each literal begins and ends.
 *
 * A template that fails to parse is skipped on its own rather than costing the
 * whole file: one experimental component should not put the rest of a codebase
 * out of reach.
 */
function injectIntoTypeScript(source: string, filePath: string): InjectionResult {
  const edits: Edit[] = [];
  const errors: string[] = [];

  for (const template of findInlineTemplates(source)) {
    const result = editsFor(template.content, filePath, {
      offset: template.start,
      line: template.line,
      column: template.column,
    });

    if (result.errors.length > 0) errors.push(...result.errors);
    else edits.push(...result.edits);
  }

  if (edits.length === 0) return { code: source, injected: 0, errors };
  return { code: applyEdits(source, edits), injected: edits.length, errors };
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
 *
 * `.ts` files are handled too: a component may hold its template inline in the
 * `@Component` decorator instead of in a separate file, and on real codebases
 * that is common enough to decide whether the tool is useful at all.
 */
export function injectSourceAttributes(source: string, filePath: string): InjectionResult {
  if (filePath.endsWith('.ts')) return injectIntoTypeScript(source, filePath);

  const { edits, errors } = editsFor(source, filePath, FILE_START);
  if (errors.length > 0) return { code: source, injected: 0, errors };

  return { code: applyEdits(source, edits), injected: edits.length, errors: [] };
}
