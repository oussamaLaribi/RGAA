import { formatDiff, PLACEHOLDER, type FixPlan } from '@rgaa-source/fix';
import { messages, DEFAULT_LANG, type Lang } from '../i18n.js';
import { dim, bold, red, green, yellow } from './colour.js';

/** Colour the diff markers without re-parsing: the prefix is at a fixed column. */
function paintDiffLine(line: string): string {
  const marker = line[9];
  if (marker === '-') return red(line);
  if (marker === '+') return green(line);
  return dim(line);
}

export function formatFixReport(plan: FixPlan, applied: boolean, lang: Lang = DEFAULT_LANG): string {
  const t = messages(lang);
  const out: string[] = [''];
  const total = plan.files.reduce((sum, file) => sum + file.applied.length, 0);

  for (const file of plan.files) {
    out.push(`  ${bold(file.relativePath)}`);
    for (const fix of file.applied) {
      const quoi = t.fixDescriptions[fix.ruleId] ?? fix.description;
      out.push(`    ${dim(`${fix.line}:${fix.column}`)}  ${fix.ruleId} — ${quoi}`);
    }
    out.push(...formatDiff(file).map(paintDiffLine), '');
  }

  if (total === 0) {
    out.push(`  ${dim(t.fixNothing)}`, '');
  } else {
    out.push(
      applied
        ? `  ${green(t.fixWritten(total, plan.files.length))}`
        : `  ${yellow(t.fixWouldWrite(total, plan.files.length))} ${dim(t.fixNothingChanged)}`,
    );
  }

  const placeholders = plan.files
    .flatMap((file) => file.applied)
    .filter((fix) => fix.level === 'suggested').length;

  if (placeholders > 0) {
    // Stated loudly and last, so it is the thing left on screen. An unedited
    // placeholder shipped to production is a worse failure than the violation it
    // replaced: a wrong alternative is believed, a missing one is detectable.
    out.push(
      `  ${yellow(t.fixNeedWords(placeholders, PLACEHOLDER))}`,
    );
  }

  if (plan.withheld.length > 0) {
    const rules = [...new Set(plan.withheld.map((fix) => fix.ruleId))].sort();
    out.push(
      `  ${dim(t.fixWithheld(plan.withheld.length, rules.join(', ')))}`,
      `  ${dim(t.fixWithheldHow)}`,
    );
  }

  if (plan.unfixable.length > 0) {
    const rules = plan.unfixable.map((entry) => `${entry.ruleId} (${entry.count})`).join(', ');
    out.push(`  ${dim(t.fixNoFixer(rules))}`);
  }

  if (plan.untraceable > 0) {
    out.push(
      `  ${dim(t.fixUntraceable(plan.untraceable))}`,
    );
  }

  return out.join('\n');
}
