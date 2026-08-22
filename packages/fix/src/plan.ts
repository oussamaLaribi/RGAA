import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  AuditResult,
  TemplateElement,
  TemplateParser,
  Violation,
  ViolationTarget,
} from '@rgaa-source/core';
import { fixerFor } from './fixers.js';
import { applyEdits } from './edits.js';
import type { FixLevel, ProposedFix, TextEdit } from './types.js';

export interface FilePlan {
  /** Path recorded in the violations, relative to the project root. */
  relativePath: string;
  absolutePath: string;
  original: string;
  fixed: string;
  applied: ProposedFix[];
}

export interface FixPlan {
  files: FilePlan[];
  /** Violations a fixer exists for, but which were skipped by the level filter. */
  withheld: ProposedFix[];
  /** Violations with no fixer at all, or that no fixer could act on. */
  unfixable: { ruleId: string; count: number }[];
  /** Violations that were never traced to a file, so nothing could be edited. */
  untraceable: number;
}

/**
 * Find the element a violation points at.
 *
 * Matched on the exact line and column the bridge recorded, never on tag name or
 * position among siblings: an approximate match would edit the wrong element,
 * and writing to the wrong line is far worse than declining to write at all.
 */
function elementAt(
  elements: readonly TemplateElement[],
  line: number,
  column: number,
): TemplateElement | undefined {
  return elements.find((element) => element.line === line && element.column === column);
}

interface Candidate {
  violation: Violation;
  target: ViolationTarget;
}

export interface PlanOptions {
  /** Levels to include. Defaults to safe fixes only. */
  levels?: readonly FixLevel[];
}

export interface PlanInput {
  results: readonly AuditResult[];
  projectRoot: string;
  /**
   * How to read the project's templates.
   *
   * Injected rather than imported, so nothing here knows which framework it is
   * editing. Every fix is expressed against offsets and attributes, which are
   * the same whatever produced them — supporting a second framework is a second
   * parser, not a second set of fixers.
   */
  parse: TemplateParser;
  options?: PlanOptions;
}

/**
 * Turn an audit into concrete edits against the project's own source.
 *
 * Nothing is written here. The plan is produced in full first so it can be shown
 * as a diff and rejected before a single byte changes on disk.
 */
export async function planFixes(input: PlanInput): Promise<FixPlan> {
  const { results, parse, options = {} } = input;
  const levels = new Set<FixLevel>(options.levels ?? ['safe']);
  const root = resolve(input.projectRoot);

  const byFile = new Map<string, Candidate[]>();
  const unfixable = new Map<string, number>();
  const withheld: ProposedFix[] = [];
  let untraceable = 0;

  // Deduplicate: the same element can be reported on several scanned routes.
  const seen = new Set<string>();

  for (const result of results) {
    for (const violation of result.violations) {
      for (const target of violation.targets) {
        if (!target.source) {
          untraceable++;
          continue;
        }
        const key = `${violation.ruleId}@${target.source.file}:${target.source.line}:${target.source.column}`;
        if (seen.has(key)) continue;
        seen.add(key);

        byFile.set(target.source.file, [
          ...(byFile.get(target.source.file) ?? []),
          { violation, target },
        ]);
      }
    }
  }

  const files: FilePlan[] = [];

  for (const [relativePath, candidates] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const absolutePath = join(root, relativePath);
    const original = await readFile(absolutePath, 'utf8');
    const parsed = parse(original, relativePath);

    if (parsed.errors.length > 0) {
      for (const candidate of candidates) {
        unfixable.set(candidate.violation.ruleId, (unfixable.get(candidate.violation.ruleId) ?? 0) + 1);
      }
      continue;
    }

    const applied: ProposedFix[] = [];
    const edits: TextEdit[] = [];

    for (const { violation, target } of candidates) {
      const fixer = fixerFor(violation.ruleId);
      const element = elementAt(parsed.elements, target.source!.line, target.source!.column);

      if (!fixer || !element) {
        unfixable.set(violation.ruleId, (unfixable.get(violation.ruleId) ?? 0) + 1);
        continue;
      }

      const proposed = fixer.propose({
        element,
        elements: parsed.elements,
        source: original,
        violation,
        target,
      });
      if (!proposed || proposed.length === 0) {
        unfixable.set(violation.ruleId, (unfixable.get(violation.ruleId) ?? 0) + 1);
        continue;
      }

      const fix: ProposedFix = {
        ruleId: violation.ruleId,
        level: fixer.level,
        description: fixer.description,
        file: relativePath,
        line: target.source!.line,
        column: target.source!.column,
        edits: proposed,
      };

      if (!levels.has(fixer.level)) {
        withheld.push(fix);
        continue;
      }

      applied.push(fix);
      edits.push(...proposed);
    }

    if (applied.length === 0) continue;

    // Read in file order, the way the file itself will be reviewed.
    applied.sort((a, b) => a.line - b.line || a.column - b.column);

    files.push({
      relativePath,
      absolutePath,
      original,
      fixed: applyEdits(original, edits),
      applied,
    });
  }

  return {
    files,
    withheld,
    unfixable: [...unfixable]
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count),
    untraceable,
  };
}
