/**
 * Success criterion tags look like `wcag111`, `wcag143`, `wcag412`: the first
 * digit is the principle, the second the guideline, and everything after is the
 * criterion number — which reaches two digits (`wcag2412` is 2.4.12).
 *
 * Conformance-level tags such as `wcag2a`, `wcag21aa` end in letters and are
 * excluded by the anchored digits-only pattern.
 */
const CRITERION_TAG = /^wcag(\d)(\d)(\d+)$/;

/** `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aaa` — version digits then the level. */
const LEVEL_TAG = /^wcag\d{1,2}(a{1,3})$/;

export type WcagLevel = 'A' | 'AA' | 'AAA';

const LEVEL_BY_LETTERS: Record<string, WcagLevel> = { a: 'A', aa: 'AA', aaa: 'AAA' };

/**
 * Success criteria a rule maps to, as dotted numbers (`['1.1.1']`).
 *
 * Read straight from axe's own tags rather than kept in a table of our own:
 * axe is the authority on what its rules test, and a duplicated table would
 * drift silently on every axe upgrade.
 */
export function wcagCriteriaFromTags(tags: readonly string[]): string[] {
  const criteria = new Set<string>();

  for (const tag of tags) {
    const match = CRITERION_TAG.exec(tag);
    if (match) criteria.add(`${match[1]}.${match[2]}.${match[3]}`);
  }

  return [...criteria].sort(compareCriteria);
}

/** Strictest conformance level among a rule's tags, or `null` for best-practice rules. */
export function wcagLevelFromTags(tags: readonly string[]): WcagLevel | null {
  let strictest: WcagLevel | null = null;

  for (const tag of tags) {
    const match = LEVEL_TAG.exec(tag);
    const level = match ? LEVEL_BY_LETTERS[match[1] as string] : undefined;
    if (!level) continue;
    if (strictest === null || level.length < strictest.length) strictest = level;
  }

  return strictest;
}

/** Numeric ordering, so 2.4.10 sorts after 2.4.9 rather than before it. */
function compareCriteria(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
