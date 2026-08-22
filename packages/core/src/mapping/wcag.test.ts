import { describe, expect, it } from 'vitest';
import { wcagCriteriaFromTags, wcagLevelFromTags } from './wcag.js';

describe('wcagCriteriaFromTags', () => {
  it('reads criteria out of axe tags', () => {
    expect(wcagCriteriaFromTags(['cat.forms', 'wcag2a', 'wcag412'])).toEqual(['4.1.2']);
  });

  it('handles two-digit criterion numbers', () => {
    // 2.4.12 exists in WCAG 2.2; splitting on digits naively would give 2.4.1.
    expect(wcagCriteriaFromTags(['wcag2412'])).toEqual(['2.4.12']);
  });

  it('ignores conformance-level and non-WCAG tags', () => {
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice', 'section508', 'ACT'];
    expect(wcagCriteriaFromTags(tags)).toEqual([]);
  });

  it('deduplicates and sorts numerically', () => {
    // 2.4.10 must come after 2.4.9, which string sorting gets wrong.
    expect(wcagCriteriaFromTags(['wcag2410', 'wcag111', 'wcag249', 'wcag111'])).toEqual([
      '1.1.1',
      '2.4.9',
      '2.4.10',
    ]);
  });
});

describe('wcagLevelFromTags', () => {
  it('reads the level across WCAG versions', () => {
    expect(wcagLevelFromTags(['wcag2a'])).toBe('A');
    expect(wcagLevelFromTags(['wcag21aa'])).toBe('AA');
    expect(wcagLevelFromTags(['wcag22aaa'])).toBe('AAA');
  });

  it('keeps the strictest level when several are tagged', () => {
    expect(wcagLevelFromTags(['wcag2aa', 'wcag2a'])).toBe('A');
  });

  it('returns null for best-practice rules that map to no criterion', () => {
    expect(wcagLevelFromTags(['best-practice', 'cat.semantics'])).toBeNull();
  });
});
