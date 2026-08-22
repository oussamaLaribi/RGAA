# @rgaa-source/core

Accessibility engine: axe-core orchestration, rules of its own, WCAG ↔ RGAA
4.1.2 mapping, scoring.

Pure TypeScript, with no framework dependency and no Node API: the same engine
runs under Playwright, in an extension content script, and in a unit test.

## What it brings

- **RGAA mapping established per rule.** Going through WCAG alone is unusable:
  success criterion 1.1.1 underpins nineteen RGAA criteria across seven topics on
  its own. The table of 106 criteria is generated from the official French
  government (DINUM) source, carrying the SHA-256 digest of what produced it.
- **Seven rules of its own**, answering criteria axe does not test: declared
  language inconsistent with the content (8.4), a page title nobody wrote (8.6),
  missing skip link (12.7), ungrouped fields (11.5/11.6), missing `autocomplete`
  (11.13), link text that is not explicit (6.1).
- **Coverage reported on every result**: how many criteria were examined, and
  above all how many were not.

## Adding a rule

Implement `AccessibilityRule`, add a line to the registry. The scanner is never
touched.

```ts
export const myRule: AccessibilityRule = {
  id: 'rgaa-my-rule',
  severity: 'moderate',
  wcag: ['1.3.1'],
  rgaa: ['9.3'],
  message: '…',
  help: '…',
  recommendation: '…',
  run({ document }) {
    const candidates = [...document.querySelectorAll('…')];
    return { candidates: candidates.length, findings: [] };
  },
};
```

`candidates` is the score's denominator: a rule that examined nothing neither
penalises nor rewards the page. A rule marked `review: true` produces points to
verify rather than failures, and does not enter the score.

Full documentation: [project README](https://github.com/oussamaLaribi/RGAA#readme)
· [en français](https://github.com/oussamaLaribi/RGAA/blob/main/README.fr.md).
