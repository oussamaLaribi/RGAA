import {
  RGAA_CRITERIA,
  RGAA_VERSION,
  type AuditResult,
  type Violation,
  type ViolationTarget,
} from '@rgaa-source/core';

/**
 * Statuses defined by the official RGAA evaluation grid.
 *
 * `NT` — non testé — is what the template itself starts every row at, and it is
 * exactly what an automated pass can honestly say about most of the frame.
 */
export type GridStatus = 'C' | 'NC' | 'NA' | 'NT';

export interface GridRow {
  topic: string;
  criterion: string;
  recommendation: string;
  status: GridStatus;
  derogation: 'N' | 'O';
  /** What to change, pre-filled with the exact source locations we found. */
  changes: string;
  comments: string;
}

/** Columns of the official per-page sheet, in order. */
const COLUMNS = [
  'Thématique',
  'Critère',
  'Recommandation',
  'Statut',
  'Dérogation',
  'Modifications à apporter',
  'Commentaires en cas de dérogations',
] as const;

function locate(target: ViolationTarget): string {
  return target.source
    ? `${target.source.file}:${target.source.line}:${target.source.column}`
    : target.selector;
}

function describe(violations: readonly Violation[]): string {
  return violations
    .map((violation) => {
      const places = violation.targets.map(locate).join(', ');
      return `${violation.message} — ${places}`;
    })
    .join('\n');
}

/**
 * Build the grid rows for one page.
 *
 * **No row is ever marked `C`.** Under the RGAA method a criterion is conform
 * only when every one of its tests passes, and an automated pass covers a
 * fraction of them — criterion 1.1 alone has eight. Marking a criterion conform
 * because the one aspect we can check came back clean would assert something we
 * have not established, in a document whose whole purpose is to record what was
 * established. Everything we did not disprove stays `NT`, which is where the
 * official template starts it.
 */
export function buildGrid(result: AuditResult): GridRow[] {
  const failuresByCriterion = new Map<string, Violation[]>();
  for (const violation of result.violations) {
    for (const criterion of violation.rgaa) {
      failuresByCriterion.set(criterion, [
        ...(failuresByCriterion.get(criterion) ?? []),
        violation,
      ]);
    }
  }

  const reviewCriteria = new Set(result.manualChecks.flatMap((check) => check.rgaa));
  const checkedClean = new Set(
    result.coverage.referenced.filter((criterion) => !failuresByCriterion.has(criterion)),
  );

  return RGAA_CRITERIA.map((criterion) => {
    const failures = failuresByCriterion.get(criterion.id);

    const comments = failures
      ? ''
      : reviewCriteria.has(criterion.id)
        ? 'Un contrôle automatique a signalé des éléments à examiner.'
        : checkedClean.has(criterion.id)
          ? 'Aucune anomalie détectée automatiquement. Les autres tests de ce critère restent à vérifier.'
          : 'Hors de portée d’un contrôle automatique. À vérifier manuellement.';

    return {
      topic: criterion.topicName.toUpperCase(),
      criterion: criterion.id,
      recommendation: criterion.title,
      status: failures ? 'NC' : 'NT',
      derogation: 'N',
      changes: failures ? describe(failures) : '',
      comments,
    };
  });
}

/** Quote for CSV: double the quotes, wrap anything containing a separator. */
function cell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export interface GridOptions {
  /**
   * Field separator. Semicolon by default, which is what Excel expects in a
   * French locale — a comma-separated file opens there as one column per row.
   */
  separator?: string;
}

/**
 * Render the grid as CSV, ready to paste into the official spreadsheet.
 *
 * CSV rather than `.ods`: producing the real workbook would mean reproducing its
 * formulas and its per-page sheets, and a file that looks like the official
 * template but computes a conformance rate we did not establish would be worse
 * than one an auditor pastes in deliberately.
 */
export function toGridCsv(results: readonly AuditResult[], options: GridOptions = {}): string {
  const separator = options.separator ?? ';';
  const lines: string[] = [];

  for (const result of results) {
    lines.push(cell(`RGAA ${RGAA_VERSION} – GRILLE D'ÉVALUATION`));
    lines.push(cell(result.url));
    lines.push(
      cell(
        `Pré-audit automatique du ${new Date(result.timestamp).toLocaleDateString('fr-FR')} — ` +
          'aucun critère n’est déclaré conforme : seuls les échecs constatés sont renseignés.',
      ),
    );
    lines.push(COLUMNS.map(cell).join(separator));

    for (const row of buildGrid(result)) {
      lines.push(
        [
          row.topic,
          row.criterion,
          row.recommendation,
          row.status,
          row.derogation,
          row.changes,
          row.comments,
        ]
          .map(cell)
          .join(separator),
      );
    }
    lines.push('');
  }

  // Byte order mark: without it Excel reads the accented criterion titles as
  // mojibake, which is the first thing an auditor would notice.
  return `﻿${lines.join('\r\n')}`;
}
