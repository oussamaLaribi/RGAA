# @rgaa-source/fix

Applies accessibility fixes **in the source code**, at the positions the bridge
recorded.

Fixes are graded by the judgement they demand:

| Level | Meaning |
|---|---|
| **safe** | Mechanically certain without knowing anything about the page's meaning |
| **suggested** | The shape is known, the words are not — writes a `TODO-a11y` marker |
| **manual** | Reported, never written |

The list of safe fixes is short, and that is deliberate. Most accessibility fixes
consist of **writing text that describes something**, and no tool knows what an
image shows or what a button does. A wrong alternative is worse than a missing
attribute: a screen reader believes it, whereas an absence stays detectable.

The plan is always produced in full before anything is written, so it can be
shown as a diff and refused. Overlapping edits are rejected rather than applied
in an arbitrary order.

Framework-agnostic: the template parser is injected, so this package knows
nothing about Angular.

Full documentation: [project README](https://github.com/oussamaLaribi/RGAA#readme)
· [en français](https://github.com/oussamaLaribi/RGAA/blob/main/README.fr.md).
