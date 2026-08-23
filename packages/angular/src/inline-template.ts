/**
 * Find the templates Angular components write inline, in the `@Component`
 * decorator, rather than in a separate `.html` file.
 *
 * On a real project — angular-realworld-example-app — 7 components out of 18 do
 * this, and only 24% of findings could be traced back to a line as a result. For
 * a tool whose whole claim is the line of code rather than the selector, that is
 * the difference between useful and not.
 *
 * The scan is hand-written rather than delegated to the TypeScript compiler.
 * Adding TypeScript as a runtime dependency to read one property is a heavy
 * price, and the risk it would buy back is small: an insertion made *inside* a
 * template literal cannot break the file's syntax whatever else is true, so the
 * worst a misidentification can do is edit a string that was not a template —
 * which the restore step undoes anyway.
 *
 * What it must never do is get a literal's *bounds* wrong, which is why the
 * scanner tracks comments, all three string forms and `${}` nesting properly
 * instead of matching a pattern.
 */

export interface InlineTemplate {
  /** Offset of the first character inside the backticks. */
  start: number;
  /** Offset just past the last character inside the backticks. */
  end: number;
  /** 1-based line, in the .ts file, of that first character. */
  line: number;
  /** 1-based column, in the .ts file, of that first character. */
  column: number;
  content: string;
}

/** Whether the text just before `at` is the property name `template`. */
function precededByTemplateKey(source: string, at: number): boolean {
  let index = at - 1;

  const skipBlanks = (): void => {
    while (index >= 0 && /\s/.test(source[index]!)) index--;
  };

  skipBlanks();
  if (source[index] !== ':') return false;
  index--;
  skipBlanks();

  // Read the identifier backwards. Quoted forms — `'template':` — are accepted
  // too, since both are valid object syntax and both appear in real code.
  let end = index + 1;
  if (source[index] === '"' || source[index] === "'") {
    index--;
    end = index + 1;
    while (index >= 0 && /[A-Za-z]/.test(source[index]!)) index--;
    const name = source.slice(index + 1, end);
    return name === 'template' && (source[index] === '"' || source[index] === "'");
  }

  while (index >= 0 && /[A-Za-z_$]/.test(source[index]!)) index--;
  return source.slice(index + 1, end) === 'template';
}

/**
 * Walk a template literal from its opening backtick to its closing one.
 *
 * `${...}` holds arbitrary code, including further strings and further template
 * literals, so it is walked by the same scanner rather than skipped by counting
 * braces — that is where a naive version stops at the wrong backtick and hands
 * back a literal whose end is somewhere in the middle of the file.
 */
function endOfTemplateLiteral(source: string, openingBacktick: number): number | null {
  let index = openingBacktick + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '`') return index;
    if (char === '$' && source[index + 1] === '{') {
      const closing = endOfInterpolation(source, index + 2);
      if (closing === null) return null;
      index = closing + 1;
      continue;
    }
    index++;
  }

  return null;
}

/** Walk the code inside `${` … `}`, and return the offset of the closing brace. */
function endOfInterpolation(source: string, from: number): number | null {
  let index = from;
  let depth = 1;

  while (index < source.length) {
    const char = source[index]!;

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return index;
    } else if (char === '`') {
      const closing = endOfTemplateLiteral(source, index);
      if (closing === null) return null;
      index = closing;
    } else if (char === "'" || char === '"') {
      const closing = endOfQuoted(source, index);
      if (closing === null) return null;
      index = closing;
    }

    index++;
  }

  return null;
}

/** Walk a single- or double-quoted string, and return the offset of its close. */
function endOfQuoted(source: string, openingQuote: number): number | null {
  const quote = source[openingQuote];
  let index = openingQuote + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    // Unterminated at end of line: broken source, and not ours to interpret.
    if (char === '\n') return null;
    if (char === quote) return index;
    index++;
  }

  return null;
}

/** 1-based line and column of an offset. */
function positionOf(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index++) {
    if (source[index] === '\n') {
      line++;
      lineStart = index + 1;
    }
  }

  return { line, column: offset - lineStart + 1 };
}

/**
 * Every inline template in a TypeScript file, in the order they appear.
 *
 * Returns an empty list rather than throwing on source it cannot follow: a file
 * this scanner does not understand must be left alone, not guessed at.
 */
export function findInlineTemplates(source: string): InlineTemplate[] {
  const found: InlineTemplate[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const newline = source.indexOf('\n', index);
      if (newline === -1) break;
      index = newline + 1;
      continue;
    }

    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close === -1) break;
      index = close + 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const closing = endOfQuoted(source, index);
      // An unterminated string means the rest of the file cannot be read
      // reliably, so stop here rather than resynchronise on a guess.
      if (closing === null) break;
      index = closing + 1;
      continue;
    }

    if (char === '`') {
      const closing = endOfTemplateLiteral(source, index);
      if (closing === null) break;

      if (precededByTemplateKey(source, index)) {
        const start = index + 1;
        found.push({
          start,
          end: closing,
          ...positionOf(source, start),
          content: source.slice(start, closing),
        });
      }

      index = closing + 1;
      continue;
    }

    index++;
  }

  return found;
}
