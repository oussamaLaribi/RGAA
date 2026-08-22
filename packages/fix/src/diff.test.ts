import { describe, expect, it } from 'vitest';
import { formatDiff } from './diff.js';
import type { FilePlan } from './plan.js';

const plan = (original: string, fixed: string): FilePlan => ({
  relativePath: 'f.html',
  absolutePath: '/f.html',
  original,
  fixed,
  applied: [],
});

/** Marker column, as laid out by the renderer. */
const markers = (lines: string[]): string => lines.map((line) => line[9]).join('');

describe('formatDiff', () => {
  it('marks only the line that changed', () => {
    const lines = formatDiff(
      plan('<a>\n<b>\n<c>\n', '<a>\n<B>\n<c>\n'),
      { context: 1 },
    );

    expect(markers(lines)).toBe(' -+ ');
  });

  /**
   * The case a line-by-line comparison gets wrong. Inserting a line shifts
   * everything below it, which then reads as changed — a diff that overstates
   * what it will do teaches people to skim past it, defeating the point of
   * showing it before writing.
   */
  it('does not mark the lines an insertion pushed down', () => {
    const lines = formatDiff(
      plan('<head>\n<meta>\n<link>\n</head>\n', '<head>\n<title>\n<meta>\n<link>\n</head>\n'),
      { context: 1 },
    );

    expect(markers(lines)).toBe(' + ');
    expect(lines.some((line) => line.includes('<link>'))).toBe(false);
  });

  it('handles a deletion the same way', () => {
    const lines = formatDiff(plan('<a>\n<b>\n<c>\n', '<a>\n<c>\n'), { context: 1 });

    expect(markers(lines)).toBe(' - ');
  });

  it('numbers deletions in the original and everything else in the result', () => {
    const lines = formatDiff(
      plan('<head>\n<meta>\n</head>\n', '<head>\n<title>\n<meta>\n</head>\n'),
      { context: 0 },
    );

    // The inserted line is numbered 2, where it will actually be.
    expect(lines[0]).toContain('   2 + <title>');
  });

  it('returns nothing when the file is unchanged', () => {
    expect(formatDiff(plan('<a>\n', '<a>\n'))).toEqual([]);
  });

  it('keeps distant changes in separate hunks', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n');
    const after = ['A', 'b', 'c', 'd', 'e', 'f', 'g', 'H'].join('\n');
    const lines = formatDiff(plan(before, after), { context: 1 });

    // Only the two ends and their context, never the untouched middle.
    expect(lines.some((line) => line.includes('d'))).toBe(false);
    expect(lines.length).toBe(6);
  });
});
