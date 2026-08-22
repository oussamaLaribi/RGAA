import { RGAA_VERSION } from '../version.js';
import { RGAA_CRITERIA, RGAA_CRITERIA_COUNT } from './rgaa.js';

/**
 * What an automated run can and cannot say about the reference frame.
 *
 * Carried on every audit rather than left to documentation. Roughly a quarter of
 * RGAA is automatable at all; presenting only what was checked, with no measure
 * of what was not, is how an automated score gets mistaken for a conformance
 * rate — a figure that is regulated and established by human audit.
 */
export interface RgaaCoverage {
  version: string;
  /** 106. */
  totalCriteria: number;
  /** Criteria this run touched, whether they passed, failed or need review. */
  referenced: string[];
  /** Criteria with at least one automated failure. */
  failing: string[];
  /** Criteria whose automated check could not decide, and needs a human. */
  needingReview: string[];
  /** Criteria this run said nothing about at all. */
  silent: number;
}

export interface CoverageInput {
  failing: readonly string[];
  passing: readonly string[];
  needingReview: readonly string[];
}

function sortCriteria(criteria: Iterable<string>): string[] {
  return [...new Set(criteria)].sort((a, b) => {
    const left = a.split('.').map(Number) as [number, number];
    const right = b.split('.').map(Number) as [number, number];
    return left[0] - right[0] || left[1] - right[1];
  });
}

export function computeCoverage(input: CoverageInput): RgaaCoverage {
  const referenced = sortCriteria([...input.failing, ...input.passing, ...input.needingReview]);

  return {
    version: RGAA_VERSION,
    totalCriteria: RGAA_CRITERIA_COUNT,
    referenced,
    failing: sortCriteria(input.failing),
    needingReview: sortCriteria(input.needingReview),
    silent: RGAA_CRITERIA_COUNT - referenced.length,
  };
}

/** Criteria grouped by topic, for reports that walk the frame in order. */
export function criteriaByTopic(): { topic: number; name: string; criteria: string[] }[] {
  const topics = new Map<number, { name: string; criteria: string[] }>();

  for (const criterion of RGAA_CRITERIA) {
    const entry = topics.get(criterion.topic) ?? { name: criterion.topicName, criteria: [] };
    entry.criteria.push(criterion.id);
    topics.set(criterion.topic, entry);
  }

  return [...topics]
    .sort(([a], [b]) => a - b)
    .map(([topic, entry]) => ({ topic, name: entry.name, criteria: entry.criteria }));
}
