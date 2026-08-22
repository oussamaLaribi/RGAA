import type { AuditResult, Severity, ViolationTarget, Violation } from '@rgaa-source/core';
import { RGAA_CRITERIA_COUNT, SEVERITIES } from '@rgaa-source/core';
import { messages, DEFAULT_LANG, type Lang, type Messages } from '../i18n.js';

const useColour = !process.env['NO_COLOR'] && process.stdout.isTTY;

/** Built from a char code so no raw control byte ever sits in this file. */
const ESC = String.fromCharCode(27);

const paint = (code: string) => (text: string): string =>
  useColour ? `${ESC}[${code}m${text}${ESC}[0m` : text;

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const yellow = paint('33');
const blue = paint('34');
const green = paint('32');

const SEVERITY_COLOUR: Record<Severity, (text: string) => string> = {
  critical: red,
  serious: red,
  moderate: yellow,
  minor: blue,
};

interface Entry {
  violation: Violation;
  target: ViolationTarget;
}

/**
 * Group by file and sort by position, so the output reads like a compiler's
 * error list — the format developers already know how to work through, and the
 * one every other accessibility tool cannot produce.
 */
function groupByFile(entries: Entry[]): Map<string, Entry[]> {
  const byFile = new Map<string, Entry[]>();

  for (const entry of entries) {
    const file = entry.target.source?.file;
    if (!file) continue;
    byFile.set(file, [...(byFile.get(file) ?? []), entry]);
  }

  for (const [file, group] of byFile) {
    byFile.set(
      file,
      group.sort(
        (a, b) =>
          (a.target.source!.line - b.target.source!.line) ||
          (a.target.source!.column - b.target.source!.column),
      ),
    );
  }

  return new Map([...byFile].sort(([a], [b]) => a.localeCompare(b)));
}

function formatEntry(entry: Entry, indent: string, t: Messages): string[] {
  const { violation, target } = entry;
  const colour = SEVERITY_COLOUR[violation.severity];
  const severityLabel = t.severity[violation.severity];
  const position = target.source ? `${target.source.line}:${target.source.column}` : target.selector;

  const lines = [
    `${indent}${dim(position.padEnd(9))} ${colour(severityLabel.padEnd(9))} ${bold(violation.ruleId.padEnd(24))} ${violation.message}`,
    `${indent}${' '.repeat(10)}${dim(target.html.split('\n')[0]?.slice(0, 92) ?? '')}`,
  ];

  const references = [
    violation.wcag.length > 0 ? `WCAG ${violation.wcag.join(', ')}` : null,
    violation.rgaa.length > 0 ? `RGAA ${violation.rgaa.join(', ')}` : null,
  ].filter(Boolean);

  if (references.length > 0) {
    lines.push(`${indent}${' '.repeat(10)}${dim(references.join('  ·  '))}`);
  }
  return lines;
}

export interface ConsoleReportOptions {
  /** Show every occurrence rather than the first few of each rule. */
  verbose?: boolean;
  lang?: Lang;
  /** Explain why a run with findings still exited 0. */
  gateHint?: boolean;
}

const MAX_PER_RULE = 5;

export function formatConsoleReport(
  results: readonly AuditResult[],
  options: ConsoleReportOptions = {},
): string {
  const t = messages(options.lang ?? DEFAULT_LANG);
  const out: string[] = [];

  for (const result of results) {
    const entries: Entry[] = result.violations.flatMap((violation) =>
      violation.targets.map((target) => ({ violation, target })),
    );

    out.push('', bold(result.url));

    if (entries.length === 0) {
      out.push(`  ${green(t.noViolations)}`);
    }

    const located = groupByFile(entries);
    for (const [file, group] of located) {
      out.push('', `  ${bold(file)}`);

      const shown = new Map<string, number>();
      for (const entry of group) {
        const count = (shown.get(entry.violation.ruleId) ?? 0) + 1;
        shown.set(entry.violation.ruleId, count);

        if (!options.verbose && count > MAX_PER_RULE) continue;
        out.push(...formatEntry(entry, '    ', t));
      }

      for (const [ruleId, count] of shown) {
        if (!options.verbose && count > MAX_PER_RULE) {
          out.push(`    ${dim(t.moreOf(count - MAX_PER_RULE, ruleId))}`);
        }
      }
    }

    const unlocated = entries.filter((entry) => !entry.target.source);
    if (unlocated.length > 0) {
      out.push(
        '',
        `  ${bold(t.notTraced)} ${dim(`(${unlocated.length})`)}`,
        ...t.notTracedWhy.map((line) => `  ${dim(line)}`),
      );
      for (const entry of unlocated.slice(0, options.verbose ? undefined : MAX_PER_RULE)) {
        out.push(...formatEntry(entry, '    ', t));
      }
    }

    out.push('', ...formatSummary(result, t, options.gateHint ?? false));
  }

  return out.join('\n');
}

function formatSummary(result: AuditResult, t: Messages, gateHint: boolean): string[] {
  const counts = new Map<Severity, number>();
  for (const violation of result.violations) {
    counts.set(
      violation.severity,
      (counts.get(violation.severity) ?? 0) + violation.targets.length,
    );
  }

  const breakdown = SEVERITIES.filter((severity) => counts.has(severity))
    .map((severity) => SEVERITY_COLOUR[severity](`${counts.get(severity)} ${t.severity[severity]}`))
    .join('   ');

  const { coverage } = result;

  return [
    `  ${bold(t.score(result.score.value))}`,
    `  ${breakdown || green(t.nothingFound)}`,
    // Distinct from the criteria count below: this is concrete elements axe
    // looked at and could not decide about, each one a place to go and look.
    result.manualChecks.length > 0
      ? `  ${yellow(t.needHuman(result.manualChecks.length))} ${dim(t.needHumanWhy)}`
      : '',
    '',
    `  ${bold(`RGAA ${result.rgaaVersion}`)} ${dim(t.criteriaExamined(coverage.referenced.length, RGAA_CRITERIA_COUNT))}`,
    coverage.failing.length > 0
      ? `    ${red(t.failing(coverage.failing.length))}   ${dim(coverage.failing.join(', '))}`
      : '',
    coverage.needingReview.length > 0
      ? `    ${yellow(t.needReview(coverage.needingReview.length))}   ${dim(coverage.needingReview.join(', '))}`
      : '',
    // The number that keeps the rest honest. Roughly three quarters of RGAA
    // cannot be automated, and a report that shows only what it checked is how
    // an automated score gets mistaken for a conformance rate.
    `    ${dim(t.notCovered(coverage.silent))}`,
    '',
    ...t.disclaimer.map((line) => `  ${dim(line)}`),
    `  ${dim(t.engineLine(result.engineVersion, result.score.scoringVersion, result.score.applicableRules))}`,
    gateHint ? `  ${dim(t.gateHint)}` : '',
  ].filter((line) => line !== '');
}
