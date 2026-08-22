import type { BaselineComparison } from '@rgaa-source/report';

const ESC = String.fromCharCode(27);
const useColour = !process.env['NO_COLOR'] && process.stdout.isTTY;
const paint = (code: string) => (text: string): string =>
  useColour ? `${ESC}[${code}m${text}${ESC}[0m` : text;

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');

export function formatRegressionReport(comparison: BaselineComparison): string {
  const out: string[] = ['', bold('Comparaison à la référence')];

  if (comparison.introduced.length === 0) {
    out.push(`  ${green('aucune anomalie nouvelle')}`);
  } else {
    out.push(`  ${red(`${comparison.introduced.length} anomalie(s) nouvelle(s)`)}`);
    for (const entry of comparison.introduced) {
      const where =
        entry.file !== null ? `${entry.file}:${entry.line}:${entry.column}` : entry.url;
      out.push(`    ${dim(where.padEnd(38))} ${entry.severity.padEnd(8)} ${entry.ruleId}`);
    }
  }

  if (comparison.resolved.length > 0) {
    out.push(`  ${green(`${comparison.resolved.length} corrigée(s) depuis la référence`)}`);
  }
  // The number a team is deciding not to fix today. Stated plainly so the
  // baseline stays a visible debt rather than a way to make it disappear.
  out.push(`  ${dim(`${comparison.carried} anomalie(s) déjà présente(s) dans la référence`)}`);

  return out.join('\n');
}
