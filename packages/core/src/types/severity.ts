/**
 * Severity levels. Ordered from most to least severe; the order is meaningful
 * and is what `SEVERITY_WEIGHT` and all sorting rely on.
 */
export const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * Weights used by the scoring formula. Kept next to the enum so that adding a
 * severity forces a deliberate choice of weight rather than a silent default.
 */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);
}
