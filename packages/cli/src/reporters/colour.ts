/** Built from a char code so no raw control byte ever sits in a source file. */
const ESC = String.fromCharCode(27);

/**
 * Whether to emit colour.
 *
 * `NO_COLOR` wins over everything, as the convention requires. `FORCE_COLOR`
 * turns it on where there is no terminal — for a CI log that renders ANSI, and
 * for capturing the real output to render the documentation images, which is
 * how those images stay accurate instead of being drawn by hand and drifting.
 */
export function coloursEnabled(
  stream: { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env['NO_COLOR']) return false;
  if (env['FORCE_COLOR'] && env['FORCE_COLOR'] !== '0') return true;
  return stream.isTTY === true;
}

const on = coloursEnabled();

const paint = (code: string) => (text: string): string =>
  on ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const dim = paint('2');
export const bold = paint('1');
export const red = paint('31');
export const green = paint('32');
export const yellow = paint('33');
export const blue = paint('34');
