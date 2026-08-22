#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { check, type CheckOptions } from './commands/check.js';
import { criteria } from './commands/criteria.js';
import { parseLang } from './i18n.js';
import { CONFIG_FILENAME, loadConfig, pick, type Config } from './config.js';

const USAGE = `
rgaa-source — accessibility scan that reports the line of code, not a CSS selector

Usage
  rgaa-source check <url...>                 scan pages that are already served
  rgaa-source check --project <dir>          instrument, build, serve and scan an Angular project
  rgaa-source criteria                       show which RGAA criteria an automated check can reach

Options
  --project <dir>       Angular project to instrument and build
  --route <path>        route to scan in project mode (repeatable, default /)
  --min-score <n>       fail when a page scores below n
  --fail                exit 1 on findings (the default outside a terminal, e.g. CI)
  --no-fail             always exit 0, whatever is found
  --lang <fr|en>        language of the output (default fr)
  --json <file>         write the full results as JSON
  --html <file>         write a self-contained report to hand over
  --grid <file>         write the RGAA evaluation grid as CSV
  --baseline <file>     compare against a reference run and fail only on what is new
  --browser <channel>   Playwright channel (default msedge; pass chromium to use the download)
  --violations-only     faster, but disables scoring
  --reuse-build         serve the existing dist without instrumenting or building
  --force               instrument even when the git tree is dirty
  --verbose             list every occurrence, and stream the build output
  --config <file>       read settings from this file instead of ./rgaa.config.json
  --no-config           ignore any configuration file

Fixing (project mode only)
  --fix                 write the fixes that need no judgement
  --fix-suggested       also draft the ones whose wording you must supply
  --dry-run             show the diff and write nothing
  -h, --help

Exit codes
  0  nothing found, or the gate passed
  1  violations found, or the score is below --min-score
  2  the scan itself could not run

Configuration
  Settings a project repeats can live in ${CONFIG_FILENAME}, next to package.json:

    { "project": ".", "routes": ["/", "/contact"], "minScore": 80 }

  A flag always wins over the file.

Source locations only appear for pages built from instrumented templates. A scan
of an arbitrary URL still reports violations, but cannot trace them to a file.
`.trim();

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      route: { type: 'string', multiple: true },
      'min-score': { type: 'string' },
      // No `default` on any of these: with one, an absent flag and an explicit
      // false look identical, and the configuration file could never be
      // overridden in both directions. Absent means undefined here, and the
      // fallback chain in `pick` decides.
      //
      // `no-fail` is declared in full because parseArgs has no `--no-` negation:
      // without it the flag is an unknown option rather than the opposite of a
      // known one.
      fail: { type: 'boolean' },
      'no-fail': { type: 'boolean' },
      lang: { type: 'string' },
      json: { type: 'string' },
      html: { type: 'string' },
      grid: { type: 'string' },
      baseline: { type: 'string' },
      browser: { type: 'string' },
      config: { type: 'string' },
      'no-config': { type: 'boolean' },
      'violations-only': { type: 'boolean' },
      'reuse-build': { type: 'boolean' },
      force: { type: 'boolean' },
      verbose: { type: 'boolean' },
      fix: { type: 'boolean' },
      'fix-suggested': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, ...urls] = positionals;

  const configPath = values.config;
  const loaded = values['no-config']
    ? { config: {} as Config, path: null, warnings: [] as string[] }
    : loadConfig(process.cwd(), configPath);
  const file = loaded.config;

  for (const warning of loaded.warnings) {
    process.stderr.write(`${loaded.path} : ${warning}\n`);
  }

  // Resolved before the dispatch: every command below speaks it.
  const lang = parseLang(values.lang ?? file.lang);
  if (lang === null) {
    process.stderr.write('--lang accepte fr ou en\n');
    return 2;
  }

  if (values.help || !command || command === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return values.help || command === 'help' ? 0 : 2;
  }
  if (command === 'criteria') return criteria(lang);

  if (command !== 'check') {
    process.stderr.write(`unknown command "${command}"\n\n${USAGE}\n`);
    return 2;
  }

  const rawScore = values['min-score'];
  const minScore = rawScore === undefined ? file.minScore : Number(rawScore);
  if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 100)) {
    process.stderr.write('--min-score doit être compris entre 0 et 100\n');
    return 2;
  }

  const options: CheckOptions = {
    urls,
    routes: values.route ?? file.routes ?? [],
    // Blocking is right in CI and wrong for a human exploring an existing
    // codebase, who reads exit 1 as a crash. An explicit flag decides, then the
    // configuration file, then the presence of a terminal — and the report says
    // so when a run would have failed elsewhere.
    fail: values.fail
      ? true
      : values['no-fail']
        ? false
        : (file.fail ?? !process.stdout.isTTY),
    lang,
    violationsOnly: pick(values['violations-only'], file.violationsOnly, false),
    reuseBuild: pick(values['reuse-build'], file.reuseBuild, false),
    force: values.force ?? false,
    verbose: pick(values.verbose, file.verbose, false),
    fix: values.fix ?? false,
    fixSuggested: values['fix-suggested'] ?? false,
    dryRun: values['dry-run'] ?? false,
  };
  // Assigned conditionally: the option type forbids an explicit undefined.
  const project = values.project ?? file.project;
  if (project !== undefined) options.project = project;
  if (minScore !== undefined) options.minScore = minScore;
  const json = values.json ?? file.json;
  const html = values.html ?? file.html;
  const grid = values.grid ?? file.grid;
  const baseline = values.baseline ?? file.baseline;
  const browser = values.browser ?? file.browser;

  if (json !== undefined) options.json = json;
  if (html !== undefined) options.html = html;
  if (grid !== undefined) options.grid = grid;
  if (baseline !== undefined) options.baseline = baseline;
  if (browser !== undefined) options.browser = browser;

  return check(options);
}

try {
  process.exitCode = await main();
} catch (error) {
  // A bad flag must be a usage error with a message, not an unhandled rejection
  // that exits 1 and looks exactly like "violations were found".
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
  process.exitCode = 2;
}
