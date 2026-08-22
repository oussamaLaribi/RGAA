import type { TemplateElement } from '@rgaa-source/core';
import type { Violation, ViolationTarget } from '@rgaa-source/core';

/**
 * How much judgement a fix requires.
 *
 * The split exists because most accessibility fixes are not mechanical: they
 * require writing text that describes something, and no tool can know what an
 * image shows or what a button does. Pretending otherwise would fill codebases
 * with plausible-looking alternatives that are wrong, which is worse than the
 * missing attribute — a wrong alternative is silently believed by a screen
 * reader user, while a missing one is at least detectable.
 */
export type FixLevel =
  /** Mechanically certain. Applied by default. */
  | 'safe'
  /** The shape is known, the words are not. Applied only when asked, with a marker. */
  | 'suggested'
  /** Reported, never written. */
  | 'manual';

/** A replacement of `[start, end)` in a file. `start === end` inserts. */
export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

export interface ProposedFix {
  ruleId: string;
  level: FixLevel;
  /** One line, in the imperative, describing what the edit does. */
  description: string;
  file: string;
  line: number;
  column: number;
  edits: TextEdit[];
}

export interface FixerContext {
  element: TemplateElement;
  /**
   * Every element in the file. Some fixes land somewhere other than the element
   * that was reported: a missing page title is reported on <html> but has to be
   * written inside <head>.
   */
  elements: readonly TemplateElement[];
  /** The whole template, so a fixer can look at what surrounds the element. */
  source: string;
  violation: Violation;
  target: ViolationTarget;
}

export interface Fixer {
  /** axe rule this fixer answers. */
  ruleId: string;
  level: FixLevel;
  description: string;
  /** Returns null when this particular occurrence cannot be fixed mechanically. */
  propose(context: FixerContext): TextEdit[] | null;
}

/**
 * Marker left in generated text a human still has to write.
 *
 * Deliberately something that will not be missed in review and is trivially
 * greppable, because an unedited placeholder shipped to production is a worse
 * accessibility failure than the violation it replaced.
 */
export const PLACEHOLDER = 'TODO-a11y';
