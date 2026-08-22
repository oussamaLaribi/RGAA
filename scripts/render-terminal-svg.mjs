/**
 * Render captured terminal output as an SVG.
 *
 * The documentation images are generated from what the tool actually prints,
 * never drawn by hand: a screenshot made once drifts from the product within a
 * release or two, and a README that shows output the tool no longer produces is
 * worse than one with no image at all.
 *
 * SVG rather than a PNG or a GIF: it stays sharp at any size, it is text so it
 * diffs and versions like the rest of the repository, and it can carry a real
 * accessible description — which an accessibility tool had better do.
 *
 * Usage:  <command producing ANSI> | node scripts/render-terminal-svg.mjs out.svg "Title"
 */
import { writeFileSync, readFileSync } from 'node:fs';

const ESC = String.fromCharCode(27);

/** Terminal palette, tuned to stay legible on the light and dark GitHub themes. */
const COLOURS = {
  '31': '#e5534b', // red
  '32': '#57ab5a', // green
  '33': '#c69026', // yellow
  '34': '#6cb6ff', // blue
  '90': '#768390',
};

const FOREGROUND = '#adbac7';
const BACKGROUND = '#22272e';
const DIM = '#768390';

/**
 * Split an ANSI string into runs of text sharing one style.
 *
 * Only the sequences this tool emits are handled — bold, dim, four colours and
 * a reset. Anything else is dropped rather than rendered as literal noise.
 */
function parse(line) {
  const runs = [];
  let style = { colour: null, bold: false, dim: false };
  let text = '';

  const flush = () => {
    if (text) runs.push({ text, ...style });
    text = '';
  };

  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ESC || line[i + 1] !== '[') {
      text += line[i];
      continue;
    }
    const end = line.indexOf('m', i);
    if (end === -1) break;

    flush();
    for (const code of line.slice(i + 2, end).split(';')) {
      if (code === '0' || code === '') style = { colour: null, bold: false, dim: false };
      else if (code === '1') style.bold = true;
      else if (code === '2') style.dim = true;
      else if (COLOURS[code]) style.colour = COLOURS[code];
    }
    i = end;
  }
  flush();
  return runs;
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(text, title) {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();

  const CHAR = 8.4;
  const LINE = 20;
  const PAD = 18;
  const TOP = 46; // room for the window chrome

  const columns = Math.max(...lines.map((l) => parse(l).reduce((n, r) => n + r.text.length, 0)));
  const width = Math.ceil(columns * CHAR + PAD * 2);
  const height = lines.length * LINE + TOP + PAD;

  const body = lines
    .map((line, index) => {
      let x = PAD;
      const y = TOP + index * LINE;
      const spans = parse(line).map((run) => {
        const fill = run.colour ?? (run.dim ? DIM : FOREGROUND);
        const weight = run.bold ? ' font-weight="600"' : '';
        const span = `<text x="${x.toFixed(1)}" y="${y}" fill="${fill}"${weight} xml:space="preserve">${escapeXml(run.text)}</text>`;
        x += run.text.length * CHAR;
        return span;
      });
      return spans.join('');
    })
    .join('\n');

  // A real accessible name and description: this is the README of an
  // accessibility tool, and an undescribed image here would be indefensible.
  // Built from the parsed runs, so no escape sequence ever reaches the text a
  // screen reader would announce.
  const spoken = lines
    .map((line) => parse(line).map((run) => run.text).join('').trim())
    .filter(Boolean)
    .join(' — ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="titre description">
  <title id="titre">${escapeXml(title)}</title>
  <desc id="description">${escapeXml(spoken)}</desc>
  <rect width="${width}" height="${height}" rx="8" fill="${BACKGROUND}"/>
  <circle cx="24" cy="22" r="6" fill="#e5534b"/>
  <circle cx="44" cy="22" r="6" fill="#c69026"/>
  <circle cx="64" cy="22" r="6" fill="#57ab5a"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13.5">
${body}
  </g>
</svg>
`;
}

const [out, title] = process.argv.slice(2);
if (!out) {
  process.stderr.write('usage: … | node scripts/render-terminal-svg.mjs <sortie.svg> "<titre>"\n');
  process.exit(2);
}

const input = readFileSync(0, 'utf8');
writeFileSync(out, render(input, title ?? 'Sortie du terminal'), 'utf8');
process.stderr.write(`${out} écrit\n`);
