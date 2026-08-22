# @rgaa-source/report

Pre-audit deliverables: HTML report, RGAA evaluation grid, baseline comparison.

## RGAA 4.1 grid

Uses the exact columns of the official template — Topic, Criterion,
Recommendation, Status, Derogation, Changes required, Comments — for all 106
criteria.

**No row is ever marked `C` (conformant).** Under the RGAA method a criterion is
conformant only if all of its tests pass, and an automated check covers a
fraction of them: criterion 1.1 alone has eight. What has not been disproved
stays `NT`, not tested — where the official template puts it itself. The `NC`
rows arrive pre-filled with exact source locations.

## Baseline comparison

Turns "is this code clean?" into "did this change make it worse?". A finding's
identity rests on the rule, the file and the markup, never on the line number —
that moves the moment an import is added above, and a CI that cries wolf gets
deleted.

## HTML report

Self-contained: no external stylesheet, no script, no network call. It must still
open correctly from an email attachment in two years.

Full documentation: [project README](https://github.com/oussamaLaribi/RGAA#readme)
· [en français](https://github.com/oussamaLaribi/RGAA/blob/main/README.fr.md).
