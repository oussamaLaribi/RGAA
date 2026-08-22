import { messages, DEFAULT_LANG, type Lang } from '../i18n.js';
import { dim, bold, green } from '../reporters/colour.js';
import {
  ADDRESSABLE_CRITERIA,
  RGAA_CRITERIA_COUNT,
  criteriaByTopic,
  rgaaCriterion,
  RGAA_VERSION,
} from '@rgaa-source/core';

/**
 * Print what the engine can and cannot reach in the reference frame.
 *
 * Published as a command rather than buried in a README because it is the claim
 * that has to survive contact with a professional auditor. Overstating coverage
 * is the fastest way to lose the audience most able to check it.
 */
export function criteria(lang: Lang = DEFAULT_LANG): 0 {
  const t = messages(lang);
  const addressable = new Set(ADDRESSABLE_CRITERIA);
  const lines: string[] = ['', bold(`RGAA ${RGAA_VERSION}`), ''];

  for (const topic of criteriaByTopic()) {
    const covered = topic.criteria.filter((id) => addressable.has(id));
    const heading = `${String(topic.topic).padStart(2)}. ${topic.name}`;

    lines.push(
      `  ${bold(heading.padEnd(34))} ${dim(`${covered.length}/${topic.criteria.length}`)}`,
    );

    for (const id of covered) {
      const criterion = rgaaCriterion(id);
      lines.push(`      ${green(id.padEnd(6))} ${dim(criterion?.title.slice(0, 84) ?? '')}`);
    }
  }

  const percent = Math.round((addressable.size / RGAA_CRITERIA_COUNT) * 100);
  lines.push(
    '',
    `  ${bold(t.criteriaReach(addressable.size, RGAA_CRITERIA_COUNT, percent))}`,
    `  ${dim(t.criteriaRest)}`,
    '',
  );

  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}
