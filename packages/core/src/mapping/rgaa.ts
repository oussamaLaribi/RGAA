import { RGAA_VERSION } from '../version.js';
import { RGAA_CRITERIA, type RgaaCriterion } from './rgaa-criteria.generated.js';
import { CUSTOM_RULES } from '../rules/registry.js';

export { RGAA_CRITERIA, type RgaaCriterion } from './rgaa-criteria.generated.js';

/** 106, read from the reference frame rather than hard-coded. */
export const RGAA_CRITERIA_COUNT = RGAA_CRITERIA.length;

const BY_ID = new Map(RGAA_CRITERIA.map((criterion) => [criterion.id, criterion]));

export function rgaaCriterion(id: string): RgaaCriterion | undefined {
  return BY_ID.get(id);
}

/** WCAG success criterion to every RGAA criterion resting on it. */
const BY_WCAG = ((): Map<string, RgaaCriterion[]> => {
  const index = new Map<string, RgaaCriterion[]>();
  for (const criterion of RGAA_CRITERIA) {
    for (const sc of criterion.wcag) {
      index.set(sc, [...(index.get(sc) ?? []), criterion]);
    }
  }
  return index;
})();

/**
 * Precise criteria for well-known axe rules.
 *
 * Going through WCAG alone is far too coarse to be useful: success criterion
 * 1.1.1 alone underpins nineteen RGAA criteria across seven topics, so a missing
 * `alt` would cite captions, CAPTCHAs and media transcripts. Each entry below is
 * justified against the official criterion wording.
 *
 * Where a failure could legitimately be either of two criteria, both are listed:
 * deciding between them is exactly the human judgement RGAA requires, and this
 * tool reports the criteria concerned rather than adjudicating them.
 */
const BY_RULE: Readonly<Record<string, readonly string[]>> = {
  // 1.1 informative image has an alternative / 1.2 decorative image is ignored.
  'image-alt': ['1.1', '1.2'],
  'role-img-alt': ['1.1', '1.2'],
  'svg-img-alt': ['1.1', '1.2'],
  'input-image-alt': ['1.1'], // test 1.1.3 covers <input type="image">
  'area-alt': ['1.1'], // test 1.1.2 covers <area>
  'image-redundant-alt': ['1.3'], // the alternative must be relevant
  'object-alt': ['1.1'],

  // 2 Cadres.
  'frame-title': ['2.1'],
  'frame-title-unique': ['2.2'],

  // 3 Couleurs.
  'color-contrast': ['3.2'],
  'color-contrast-enhanced': ['3.2'],
  'link-in-text-block': ['3.1'],

  // 5 Tableaux.
  'td-headers-attr': ['5.7'],
  'th-has-data-cells': ['5.7'],
  'td-has-header': ['5.7'],
  'scope-attr-valid': ['5.7'],
  'empty-table-header': ['5.6'],
  'table-duplicate-name': ['5.5'],
  'table-fake-caption': ['5.4'],
  'layout-table': ['5.8'],

  // 6 Liens: 6.2 requires a label at all, 6.1 requires it to be explicit.
  'link-name': ['6.2', '6.1'],

  // 8 Éléments obligatoires.
  'html-has-lang': ['8.3'],
  'html-lang-valid': ['8.4'],
  'html-xml-lang-mismatch': ['8.4'],
  'valid-lang': ['8.8'],
  'document-title': ['8.5'],
  'duplicate-id': ['8.2'],
  'duplicate-id-active': ['8.2'],
  'duplicate-id-aria': ['8.2'],

  // 9 Structuration.
  'heading-order': ['9.1'],
  'empty-heading': ['9.1'],
  'page-has-heading-one': ['9.1'],
  list: ['9.3'],
  listitem: ['9.3'],
  'definition-list': ['9.3'],
  dlitem: ['9.3'],

  // 10 Présentation.
  'meta-viewport': ['10.4'],
  'meta-viewport-large': ['10.4'],
  'avoid-inline-spacing': ['10.12'],

  // 11 Formulaires: 11.1 requires a label, 11.2 requires it to be relevant.
  label: ['11.1', '11.2'],
  'select-name': ['11.1', '11.2'],
  'form-field-multiple-labels': ['11.1'],
  'aria-input-field-name': ['11.1'],
  'aria-toggle-field-name': ['11.1'],
  'label-title-only': ['11.1'],
  'button-name': ['11.9'],
  'input-button-name': ['11.9'],
  'autocomplete-valid': ['11.13'],

  // 12 Navigation.
  region: ['12.6'],
  'landmark-one-main': ['12.6'],
  'landmark-unique': ['12.6'],
  'landmark-complementary-is-top-level': ['12.6'],
  'landmark-banner-is-top-level': ['12.6'],
  'landmark-contentinfo-is-top-level': ['12.6'],
  'landmark-main-is-top-level': ['12.6'],
  'landmark-no-duplicate-banner': ['12.6'],
  'landmark-no-duplicate-contentinfo': ['12.6'],
  'landmark-no-duplicate-main': ['12.6'],
  bypass: ['12.7'],
  'skip-link': ['12.7'],
  tabindex: ['12.8'],
  accesskeys: ['12.10'],

  // 13 Consultation.
  'meta-refresh': ['13.1'],
  'meta-refresh-no-exceptions': ['13.1'],
};

/**
 * Fallback narrowing, from axe's own category tags to RGAA topics.
 *
 * Only used for rules with no precise entry above. It keeps coverage without
 * pretending to precision, and results resolved this way are marked `topic` so
 * a report can say so.
 */
const TOPICS_BY_CATEGORY: Readonly<Record<string, readonly number[]>> = {
  'cat.text-alternatives': [1],
  'cat.time-and-media': [4],
  'cat.color': [3],
  'cat.tables': [5],
  'cat.forms': [11],
  'cat.language': [8],
  'cat.parsing': [8],
  'cat.structure': [9, 8],
  'cat.semantics': [9],
  'cat.aria': [7],
  'cat.name-role-value': [6, 7, 11],
  'cat.keyboard': [7, 12],
  'cat.sensory-and-visual-cues': [10],
};

/**
 * Every criterion the engine can reach with a precise mapping, whatever the page.
 *
 * The capability statement, published rather than implied. It is the honest
 * answer to "what does this actually check?", and the number it produces —
 * a fraction of 106 — is the reason the reports never claim conformance.
 */
export const ADDRESSABLE_CRITERIA: readonly string[] = [
  ...new Set([
    ...Object.values(BY_RULE).flat(),
    // Our own rules declare the criterion they were written against, so they
    // count towards the capability statement exactly like the mapped axe rules.
    ...CUSTOM_RULES.flatMap((rule) => rule.rgaa),
  ]),
].sort((a, b) => {
  const left = a.split('.').map(Number) as [number, number];
  const right = b.split('.').map(Number) as [number, number];
  return left[0] - right[0] || left[1] - right[1];
});

export interface RgaaMapping {
  /** Criterion identifiers, sorted by topic then number. */
  criteria: string[];
  /** Version of the reference frame these were resolved against. */
  version: string;
  /**
   * How they were found. `rule` is precise; `topic` is a narrowed set to look
   * at; `none` means nothing could be resolved and the list is empty.
   */
  precision: 'rule' | 'topic' | 'none';
  /** Success criteria that resolved to no RGAA criterion at all. */
  unmapped: string[];
}

function sortCriteria(criteria: Iterable<string>): string[] {
  return [...new Set(criteria)].sort((a, b) => {
    const left = a.split('.').map(Number) as [number, number];
    const right = b.split('.').map(Number) as [number, number];
    return left[0] - right[0] || left[1] - right[1];
  });
}

export interface RgaaLookup {
  /** axe rule id, when the finding came from axe. */
  ruleId?: string;
  /** WCAG success criteria, as dotted numbers. */
  wcag: readonly string[];
  /** The rule's raw tags, used to narrow by category when no rule entry exists. */
  tags?: readonly string[];
}

/**
 * Resolve the RGAA criteria concerned by a finding.
 *
 * These are the criteria a human auditor should examine, not a verdict on them.
 * RGAA conformance is established by human audit, and several of these criteria
 * turn on judgements no automated check can make.
 */
export function rgaaCriteriaFor(lookup: RgaaLookup): RgaaMapping {
  const precise = lookup.ruleId ? BY_RULE[lookup.ruleId] : undefined;
  if (precise) {
    return {
      criteria: sortCriteria(precise),
      version: RGAA_VERSION,
      precision: 'rule',
      unmapped: [],
    };
  }

  const candidates: RgaaCriterion[] = [];
  const unmapped: string[] = [];

  for (const sc of lookup.wcag) {
    const matches = BY_WCAG.get(sc);
    if (!matches) {
      unmapped.push(sc);
      continue;
    }
    candidates.push(...matches);
  }

  if (candidates.length === 0) {
    return { criteria: [], version: RGAA_VERSION, precision: 'none', unmapped };
  }

  const topics = new Set(
    (lookup.tags ?? []).flatMap((tag) => TOPICS_BY_CATEGORY[tag] ?? []),
  );
  const narrowed =
    topics.size > 0 ? candidates.filter((criterion) => topics.has(criterion.topic)) : [];

  const resolved = narrowed.length > 0 ? narrowed : candidates;

  return {
    criteria: sortCriteria(resolved.map((criterion) => criterion.id)),
    version: RGAA_VERSION,
    precision: 'topic',
    unmapped,
  };
}
