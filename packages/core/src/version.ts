/**
 * Kept out of the barrel file so modules can import it without pulling the whole
 * package back in through a cycle.
 */

/**
 * Bumped on any change to the rule set. Recorded on every `AuditResult`, because
 * scores are only comparable within one engine version: adding rules mechanically
 * lowers scores, and a user would otherwise read an upgrade as a regression in
 * their own site.
 */
export const ENGINE_VERSION = '0.2.0';

/** Version of the RGAA reference frame the mapping targets. */
export const RGAA_VERSION = '4.1.2';
