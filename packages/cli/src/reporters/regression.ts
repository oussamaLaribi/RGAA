import type { BaselineComparison } from '@rgaa-source/report';
import { dim, bold, red, green } from './colour.js';
import { messages, DEFAULT_LANG, type Lang } from '../i18n.js';

export function formatRegressionReport(
  comparison: BaselineComparison,
  lang: Lang = DEFAULT_LANG,
): string {
  const t = messages(lang);
  const out: string[] = ['', bold(t.regressionTitle)];

  if (comparison.introduced.length === 0) {
    out.push(`  ${green(t.regressionNone)}`);
  } else {
    out.push(`  ${red(t.regressionNew(comparison.introduced.length))}`);
    for (const entry of comparison.introduced) {
      const where =
        entry.file !== null ? `${entry.file}:${entry.line}:${entry.column}` : entry.url;
      out.push(
        `    ${dim(where.padEnd(38))} ${t.severity[entry.severity].padEnd(9)} ${entry.ruleId}`,
      );
    }
  }

  if (comparison.resolved.length > 0) {
    out.push(`  ${green(t.regressionResolved(comparison.resolved.length))}`);
  }
  // The number a team is deciding not to fix today. Stated plainly so the
  // baseline stays a visible debt rather than a way to make it disappear.
  out.push(`  ${dim(t.regressionCarried(comparison.carried))}`);

  return out.join('\n');
}
