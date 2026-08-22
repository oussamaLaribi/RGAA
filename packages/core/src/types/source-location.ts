/**
 * Where a violating element was written, in the project's own source.
 *
 * This is the whole point of the product: axe and every comparable tool stop at
 * a CSS selector, which maps to no file a developer can open. A location is only
 * available when the templates were instrumented by `@rgaa-source/angular` before
 * the build — a scan of an arbitrary production URL yields `null`, and that must
 * be reported honestly rather than guessed at.
 */
export interface SourceLocation {
  /** Path as emitted at instrumentation time, relative to the project root. */
  file: string;
  /** 1-based, matching what editors display. */
  line: number;
  /** 1-based, matching what editors display. */
  column: number;
}

/** Attribute carrying the source location through the build and into the DOM. */
export const SOURCE_ATTRIBUTE = 'data-a11y-src';

const LOCATION_PATTERN = /^(.*):(\d+):(\d+)$/;

/** Serialise for the `data-a11y-src` attribute. */
export function formatSourceLocation(loc: SourceLocation): string {
  return `${loc.file}:${loc.line}:${loc.column}`;
}

/**
 * Parse a `data-a11y-src` value. Returns `null` rather than throwing: the
 * attribute crosses a build boundary and may have been mangled by tooling we do
 * not control, and a missing location must degrade to "unknown", never to a crash.
 */
export function parseSourceLocation(value: string | null | undefined): SourceLocation | null {
  if (!value) return null;
  const match = LOCATION_PATTERN.exec(value);
  if (!match) return null;

  const [, file, line, column] = match as unknown as [string, string, string, string];
  const parsedLine = Number(line);
  const parsedColumn = Number(column);
  if (!file || parsedLine < 1 || parsedColumn < 1) return null;

  return { file, line: parsedLine, column: parsedColumn };
}
