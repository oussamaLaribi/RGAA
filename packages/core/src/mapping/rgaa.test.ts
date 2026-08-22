import { describe, expect, it } from 'vitest';
import {
  ADDRESSABLE_CRITERIA,
  RGAA_CRITERIA,
  RGAA_CRITERIA_COUNT,
  rgaaCriteriaFor,
  rgaaCriterion,
} from './rgaa.js';
import { computeCoverage, criteriaByTopic } from './coverage.js';

describe('the reference frame itself', () => {
  it('holds the 106 criteria of RGAA 4.1.2 across 13 topics', () => {
    expect(RGAA_CRITERIA_COUNT).toBe(106);
    expect(new Set(RGAA_CRITERIA.map((criterion) => criterion.topic)).size).toBe(13);
  });

  it('has a unique, well-formed identifier for every criterion', () => {
    const ids = RGAA_CRITERIA.map((criterion) => criterion.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d{1,2}\.\d{1,2}$/);
  });

  it('carries WCAG references and a level on every criterion', () => {
    for (const criterion of RGAA_CRITERIA) {
      expect(criterion.wcag.length, `${criterion.id} has no WCAG reference`).toBeGreaterThan(0);
      expect(['A', 'AA', 'AAA']).toContain(criterion.level);
    }
  });
});

describe('rgaaCriteriaFor', () => {
  /**
   * The test that matters most. Citing a criterion that does not exist, or that
   * says something other than what we imply, is the one mistake this tool cannot
   * afford — the people most likely to pay for it are the auditors best placed
   * to notice. A typo in the rule table must fail here, not in front of them.
   */
  it('never cites a criterion outside the reference frame', () => {
    const known = new Set(RGAA_CRITERIA.map((criterion) => criterion.id));
    const everyAxeRule = [
      'image-alt', 'role-img-alt', 'svg-img-alt', 'input-image-alt', 'area-alt',
      'image-redundant-alt', 'object-alt', 'frame-title', 'frame-title-unique',
      'color-contrast', 'color-contrast-enhanced', 'link-in-text-block',
      'td-headers-attr', 'th-has-data-cells', 'td-has-header', 'scope-attr-valid',
      'empty-table-header', 'table-duplicate-name', 'table-fake-caption', 'layout-table',
      'link-name', 'html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch',
      'valid-lang', 'document-title', 'duplicate-id', 'duplicate-id-active',
      'duplicate-id-aria', 'heading-order', 'empty-heading', 'page-has-heading-one',
      'list', 'listitem', 'definition-list', 'dlitem', 'meta-viewport',
      'meta-viewport-large', 'avoid-inline-spacing', 'label', 'select-name',
      'form-field-multiple-labels', 'aria-input-field-name', 'aria-toggle-field-name',
      'label-title-only', 'button-name', 'input-button-name', 'autocomplete-valid',
      'region', 'landmark-one-main', 'landmark-unique', 'bypass', 'skip-link',
      'tabindex', 'accesskeys', 'meta-refresh',
    ];

    for (const ruleId of everyAxeRule) {
      const mapping = rgaaCriteriaFor({ ruleId, wcag: [] });
      expect(mapping.precision, `${ruleId} lost its precise mapping`).toBe('rule');

      for (const id of mapping.criteria) {
        expect(known.has(id), `${ruleId} cites ${id}, which is not an RGAA criterion`).toBe(true);
      }
    }
  });

  it('cites both possibilities when the distinction is a human judgement', () => {
    // A missing alt is either an informative image without an alternative (1.1)
    // or a decorative one that is not correctly ignored (1.2). Deciding which is
    // exactly what RGAA asks a human to do.
    expect(rgaaCriteriaFor({ ruleId: 'image-alt', wcag: ['1.1.1'] }).criteria).toEqual(['1.1', '1.2']);
  });

  it('prefers the rule mapping over the far coarser WCAG one', () => {
    // 1.1.1 alone underpins nineteen criteria across seven topics; going through
    // it would cite captions, CAPTCHAs and media transcripts for a missing alt.
    const viaRule = rgaaCriteriaFor({ ruleId: 'image-alt', wcag: ['1.1.1'] });
    const viaWcag = rgaaCriteriaFor({ wcag: ['1.1.1'] });

    expect(viaRule.precision).toBe('rule');
    expect(viaRule.criteria.length).toBeLessThan(viaWcag.criteria.length);
  });

  it('narrows an unknown rule by its axe category', () => {
    const broad = rgaaCriteriaFor({ ruleId: 'unknown-rule', wcag: ['1.1.1'] });
    const narrowed = rgaaCriteriaFor({
      ruleId: 'unknown-rule',
      wcag: ['1.1.1'],
      tags: ['cat.text-alternatives'],
    });

    expect(narrowed.precision).toBe('topic');
    expect(narrowed.criteria.length).toBeLessThan(broad.criteria.length);
    for (const id of narrowed.criteria) expect(rgaaCriterion(id)!.topic).toBe(1);
  });

  it('reports honestly when nothing could be resolved', () => {
    const mapping = rgaaCriteriaFor({ ruleId: 'best-practice-only', wcag: [] });

    expect(mapping.criteria).toEqual([]);
    expect(mapping.precision).toBe('none');
  });

  it('records success criteria that map to no RGAA criterion', () => {
    const mapping = rgaaCriteriaFor({ wcag: ['9.9.9'] });
    expect(mapping.unmapped).toEqual(['9.9.9']);
  });

  it('sorts criteria numerically, not as strings', () => {
    // 11.9 must come before 11.10, which string ordering gets wrong.
    const mapping = rgaaCriteriaFor({ ruleId: 'label', wcag: [] });
    expect(mapping.criteria).toEqual(['11.1', '11.2']);
  });
});

describe('ADDRESSABLE_CRITERIA', () => {
  it('only names criteria that exist in the frame', () => {
    const known = new Set(RGAA_CRITERIA.map((criterion) => criterion.id));
    for (const id of ADDRESSABLE_CRITERIA) expect(known.has(id), `${id} is unknown`).toBe(true);
  });

  it('stays within the share of RGAA that is genuinely automatable', () => {
    // Published figures put automated coverage at roughly 20–30% of the frame.
    // A sudden jump means the mapping has started claiming criteria it cannot
    // actually decide — the failure mode that costs credibility with auditors.
    const share = ADDRESSABLE_CRITERIA.length / RGAA_CRITERIA_COUNT;

    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.4);
  });

  it('reaches no criterion in topics no automated check can judge', () => {
    // Multimédia (4) turns entirely on whether a transcript or an audio
    // description conveys the content, which no automated check can determine.
    const topics = new Set(ADDRESSABLE_CRITERIA.map((id) => rgaaCriterion(id)!.topic));
    expect(topics.has(4)).toBe(false);
  });
});

describe('computeCoverage', () => {
  it('states how much of the frame the run said nothing about', () => {
    const coverage = computeCoverage({
      failing: ['1.1', '1.2'],
      passing: ['6.1'],
      needingReview: ['3.2'],
    });

    expect(coverage.referenced).toEqual(['1.1', '1.2', '3.2', '6.1']);
    expect(coverage.silent).toBe(RGAA_CRITERIA_COUNT - 4);
  });

  it('counts a criterion once even when several findings touch it', () => {
    const coverage = computeCoverage({ failing: ['1.1', '1.1'], passing: ['1.1'], needingReview: [] });

    expect(coverage.referenced).toEqual(['1.1']);
    expect(coverage.failing).toEqual(['1.1']);
  });

  it('reports the whole frame as silent for a run that found nothing', () => {
    const coverage = computeCoverage({ failing: [], passing: [], needingReview: [] });
    expect(coverage.silent).toBe(RGAA_CRITERIA_COUNT);
  });
});

describe('criteriaByTopic', () => {
  it('walks the frame in order and accounts for every criterion', () => {
    const topics = criteriaByTopic();

    expect(topics.map((entry) => entry.topic)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(topics.reduce((total, entry) => total + entry.criteria.length, 0)).toBe(
      RGAA_CRITERIA_COUNT,
    );
    expect(topics[0]!.name).toBe('Images');
  });
});
