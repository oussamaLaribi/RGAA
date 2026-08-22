# @rgaa-source/cli

Accessibility scanning for **Angular** projects that reports **the line of
code**, not a CSS selector.

```bash
npx @rgaa-source/cli check --project ./my-app
```

```
  src/app/checkout/checkout.component.html
    42:8      critical image-alt      Images must have alternative text
              <img src="product.jpg">
              WCAG 1.1.1  ·  RGAA 1.1, 1.2
```

Existing tools stop at `body > main > form > input.email`, which matches no file
you can open. Here the violation carries its own source address, because the
templates were instrumented before the build.

## Commands

| | |
|---|---|
| `check --project <dir>` | instrument, build, serve and scan an Angular project |
| `check <url…>` | scan already-served pages (no source locations) |
| `criteria` | what the engine can reach of the 106 RGAA criteria |

## Options

`--route <path>` (repeatable) · `--min-score <n>` · `--baseline <file>` ·
`--html <file>` · `--grid <file>` · `--json <file>` · `--fix` ·
`--fix-suggested` · `--dry-run` · `--browser <channel>` · `--lang <fr|en>` ·
`--no-fail` · `--reuse-build` · `--force` · `--verbose`

Output defaults to French, the reference frame's own language; `--lang en`
switches everything — console, HTML, grid and JSON alike.

Exit codes: `0` within threshold · `1` violations, insufficient score or a
regression · `2` the scan itself failed.

## Requirements

Node 20.12+ and a browser for Playwright. By default the CLI drives the Edge
already present on Windows; elsewhere, `npx playwright install chromium` then
`--browser chromium`.

## Scope

The score is an **automated pre-audit**, not an RGAA conformance rate — that
notion is regulatory and is established by human audit. About a third of the 106
criteria is reachable automatically; `rgaa-source criteria` spells out which.

Full documentation: [project README](https://github.com/oussamaLaribi/RGAA#readme)
· [en français](https://github.com/oussamaLaribi/RGAA/blob/main/README.fr.md).
