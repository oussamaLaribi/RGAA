import { parseTemplate } from '@angular/compiler';
import type {
  ParsedTemplate,
  TemplateElement,
} from '@rgaa-source/core';

/**
 * The single place that touches Angular's compiler AST.
 *
 * The shape of `parseTemplate`'s output is not a public contract and has moved
 * between patch releases before — the 19.2.1 to 19.2.2 change renamed keys and
 * broke angular-eslint. Everything version-fragile is therefore confined here,
 * behind our own types, so a future break is one file to fix.
 */

interface AstNode {
  readonly name?: string;
  readonly children?: readonly AstNode[];
  readonly branches?: readonly { readonly children?: readonly AstNode[] }[];
  /** `@switch` holds its cases under `groups`; `cases` is accepted defensively. */
  readonly groups?: readonly { readonly children?: readonly AstNode[] }[];
  readonly cases?: readonly { readonly children?: readonly AstNode[] }[];
  readonly empty?: { readonly children?: readonly AstNode[] } | null;
  readonly placeholder?: { readonly children?: readonly AstNode[] } | null;
  readonly loading?: { readonly children?: readonly AstNode[] } | null;
  readonly error?: { readonly children?: readonly AstNode[] } | null;
  readonly attributes?: readonly {
    readonly name?: string;
    readonly value?: string;
    readonly sourceSpan?: { start: { offset: number }; end: { offset: number } };
    readonly valueSpan?: { start: { offset: number }; end: { offset: number } } | null;
  }[];
  readonly startSourceSpan?: {
    start: { offset: number; line: number; col: number };
    end: { offset: number };
  } | null;
  readonly endSourceSpan?: { start: { offset: number }; end: { offset: number } } | null;
}

/**
 * Control-flow blocks hold their children under different keys depending on the
 * block, and none of them is an `Element`, so a plain `children` walk silently
 * skips everything inside `@if` / `@for` / `@switch` / `@defer`.
 */
function childrenOf(node: AstNode): AstNode[] {
  const children: AstNode[] = [...(node.children ?? [])];
  for (const group of [
    ...(node.branches ?? []),
    ...(node.groups ?? []),
    ...(node.cases ?? []),
  ]) {
    children.push(...(group.children ?? []));
  }
  for (const slot of [node.empty, node.placeholder, node.loading, node.error]) {
    if (slot?.children) children.push(...slot.children);
  }
  return children;
}

function isElement(node: AstNode): boolean {
  // Structural rather than `instanceof`: the compiler's class identity is not
  // stable across duplicated installs of @angular/compiler in a workspace.
  return typeof node.name === 'string' && !!node.startSourceSpan;
}

function collect(nodes: readonly AstNode[], into: TemplateElement[]): void {
  for (const node of nodes) {
    if (isElement(node)) {
      const span = node.startSourceSpan!;
      into.push({
        tagName: node.name!.replace(/^:[^:]+:/, ''),
        openStart: span.start.offset,
        openEnd: span.end.offset,
        closeStart: node.endSourceSpan ? node.endSourceSpan.start.offset : null,
        closeEnd: node.endSourceSpan ? node.endSourceSpan.end.offset : null,
        line: span.start.line + 1, // the compiler counts from zero, editors do not
        column: span.start.col + 1,
        attributes: (node.attributes ?? [])
          .filter((a) => typeof a.name === 'string' && a.sourceSpan)
          .map((a) => ({
            name: a.name as string,
            value: a.value ?? '',
            start: a.sourceSpan!.start.offset,
            end: a.sourceSpan!.end.offset,
            valueStart: a.valueSpan ? a.valueSpan.start.offset : null,
            valueEnd: a.valueSpan ? a.valueSpan.end.offset : null,
          })),
      });
    }
    collect(childrenOf(node), into);
  }
}

export function parseTemplateElements(source: string, filePath: string): ParsedTemplate {
  const parsed = parseTemplate(source, filePath, { preserveWhitespaces: true });
  const errors = (parsed.errors ?? []).map((e) => String(e));
  if (errors.length > 0) return { elements: [], errors };

  const elements: TemplateElement[] = [];
  collect(parsed.nodes as readonly AstNode[], elements);
  return { elements, errors: [] };
}
