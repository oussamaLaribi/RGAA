/**
 * A framework-neutral description of an element as it was written in source.
 *
 * These types live in the core, not in the Angular adapter, so that everything
 * downstream — the fixers above all — depends on the *shape* of a template
 * element rather than on the parser that produced it. Adding a second framework
 * then means adding a package that yields these, and changing nothing else.
 */

export interface TemplateAttribute {
  name: string;
  /** Empty string for a valueless attribute such as `disabled`. */
  value: string;
  /** Offsets of the whole attribute, e.g. `tabindex="3"`. */
  start: number;
  end: number;
  /** Offsets of the value inside its quotes; null when there is no value. */
  valueStart: number | null;
  valueEnd: number | null;
}

export interface TemplateElement {
  /** Tag as written, with any namespace prefix stripped. */
  tagName: string;
  /** Character offsets of the opening tag, into the original source. */
  openStart: number;
  openEnd: number;
  /**
   * Offsets of the closing tag. Null for void elements, and equal to the opening
   * offsets for self-closing ones — so "has a real closing tag" means
   * `closeStart !== null && closeStart !== openStart`.
   */
  closeStart: number | null;
  closeEnd: number | null;
  /** 1-based, as editors display them. */
  line: number;
  column: number;
  /** Static attributes only; framework bindings are not attributes. */
  attributes: readonly TemplateAttribute[];
}

export interface ParsedTemplate {
  elements: TemplateElement[];
  /** Parse errors. When non-empty, `elements` is empty. */
  errors: string[];
}

/**
 * What an adapter has to provide.
 *
 * One function: source text in, located elements out. Everything the fixers do
 * is expressed against this, so a React or Vue adapter is a single
 * implementation away.
 */
export type TemplateParser = (source: string, filePath: string) => ParsedTemplate;

/** Find a static attribute by name. */
export function attributeOf(
  element: TemplateElement,
  name: string,
): TemplateAttribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}

export function hasAttribute(element: TemplateElement, name: string): boolean {
  return attributeOf(element, name) !== undefined;
}
