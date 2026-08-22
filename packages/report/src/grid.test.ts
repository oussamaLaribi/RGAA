import { describe, expect, it } from 'vitest';
import { RGAA_CRITERIA_COUNT, type AuditResult, type Violation } from '@rgaa-source/core';
import { buildGrid, toGridCsv } from './grid.js';

const violation = (over: Partial<Violation> = {}): Violation => ({
  ruleId: 'image-alt',
  severity: 'critical',
  message: 'Images must have alternative text',
  help: '',
  recommendation: '',
  wcag: ['1.1.1'],
  rgaa: ['1.1', '1.2'],
  origin: 'axe',
  targets: [
    {
      selector: 'img',
      html: '<img src="a.png">',
      source: { file: 'src/app/app.html', line: 3, column: 3 },
    },
  ],
  ...over,
});

const result = (over: Partial<AuditResult> = {}): AuditResult => ({
  url: '/',
  timestamp: '2026-08-20T10:00:00.000Z',
  engineVersion: '0.2.0',
  rgaaVersion: '4.1.2',
  violations: [],
  passedRuleIds: [],
  manualChecks: [],
  score: { value: 100, scoringVersion: 1, applicableRules: 5, failedRules: 0, automatedOnly: true },
  coverage: {
    version: '4.1.2',
    totalCriteria: 106,
    referenced: [],
    failing: [],
    needingReview: [],
    silent: 106,
  },
  ...over,
});

describe('buildGrid', () => {
  it('produces one row per criterion in the frame', () => {
    expect(buildGrid(result())).toHaveLength(RGAA_CRITERIA_COUNT);
  });

  /**
   * The integrity constraint of the whole deliverable.
   *
   * Under the RGAA method a criterion is conform only when every one of its
   * tests passes, and an automated pass covers a fraction of them — criterion
   * 1.1 alone has eight. Marking one conform because the single aspect we can
   * check came back clean would assert something we never established, in the
   * one document whose purpose is to record what was.
   */
  it('never declares a criterion conform', () => {
    const rows = buildGrid(
      result({
        coverage: {
          version: '4.1.2',
          totalCriteria: 106,
          referenced: ['1.1', '6.1', '9.1'],
          failing: [],
          needingReview: [],
          silent: 103,
        },
      }),
    );

    expect(rows.some((row) => row.status === 'C')).toBe(false);
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(['NT']));
  });

  it('marks a criterion NC only where a violation cites it', () => {
    const rows = buildGrid(result({ violations: [violation()] }));
    const failing = rows.filter((row) => row.status === 'NC').map((row) => row.criterion);

    expect(failing).toEqual(['1.1', '1.2']);
  });

  it('pre-fills the failing rows with the exact source locations', () => {
    const rows = buildGrid(result({ violations: [violation()] }));
    const row = rows.find((entry) => entry.criterion === '1.1');

    // The time actually saved: the auditor opens the grid and already knows
    // which line to go to.
    expect(row?.changes).toContain('src/app/app.html:3:3');
  });

  it('falls back to the selector when a violation was never traced to source', () => {
    const untraceable = violation({
      targets: [{ selector: 'body > img', html: '<img>', source: null }],
    });
    const rows = buildGrid(result({ violations: [untraceable] }));

    expect(rows.find((entry) => entry.criterion === '1.1')?.changes).toContain('body > img');
  });

  it('says why each untested criterion was left untested', () => {
    const rows = buildGrid(
      result({
        manualChecks: [{ ruleId: 'r', question: 'q', wcag: [], rgaa: ['6.1'], targets: [] }],
        coverage: {
          version: '4.1.2',
          totalCriteria: 106,
          referenced: ['6.1', '9.1'],
          failing: [],
          needingReview: ['6.1'],
          silent: 104,
        },
      }),
    );

    expect(rows.find((row) => row.criterion === '6.1')?.comments).toContain('examiner');
    expect(rows.find((row) => row.criterion === '9.1')?.comments).toContain('Aucune anomalie');
    expect(rows.find((row) => row.criterion === '4.1')?.comments).toContain('manuellement');
  });

  it('uses the official topic names', () => {
    const rows = buildGrid(result());
    expect(rows[0]?.topic).toBe('IMAGES');
  });
});

describe('toGridCsv', () => {
  it('lays out the columns of the official grid, in order', () => {
    const header = toGridCsv([result()]).split('\r\n')[3];

    expect(header).toBe(
      '"Thématique";"Critère";"Recommandation";"Statut";"Dérogation";"Modifications à apporter";"Commentaires en cas de dérogations"',
    );
  });

  it('starts with a byte order mark', () => {
    // Without it Excel renders every accented criterion title as mojibake,
    // which is the first thing an auditor would notice.
    expect(toGridCsv([result()]).charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes quotes inside a cell', () => {
    const quoted = violation({ message: 'Page title is "Document"', rgaa: ['8.6'] });
    const csv = toGridCsv([result({ violations: [quoted] })]);

    expect(csv).toContain('Page title is ""Document""');
  });

  it('says on the page itself that nothing is declared conform', () => {
    expect(toGridCsv([result()])).toContain('aucun critère n’est déclaré conforme');
  });
});
