import type { AccessibilityRule } from './rule.interface.js';
import { langMismatch } from './lang-mismatch.js';
import { duplicateLinkText, linkNotExplicit } from './link-not-explicit.js';
import { groupWithoutFieldset, missingAutocomplete } from './form-rules.js';
import { placeholderPageTitle, skipLinkMissing } from './navigation-rules.js';

/**
 * Rules of our own, run alongside axe.
 *
 * Every one answers an RGAA criterion that axe does not test, either because it
 * has no equivalent rule or because its rule stops short of what the French
 * frame asks for. Duplicating what axe already does well would only add ways to
 * disagree with it.
 */
export const CUSTOM_RULES: readonly AccessibilityRule[] = [
  langMismatch,
  placeholderPageTitle,
  skipLinkMissing,
  groupWithoutFieldset,
  missingAutocomplete,
  linkNotExplicit,
  duplicateLinkText,
];

export function customRule(id: string): AccessibilityRule | undefined {
  return CUSTOM_RULES.find((rule) => rule.id === id);
}
