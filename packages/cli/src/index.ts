#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { check, type CheckOptions } from './commands/check.js';
import { criteria } from './commands/criteria.js';
import { parseLang, messages, DEFAULT_LANG } from './i18n.js';
import { usage } from './usage.js';
import { loadConfig, pick, type Config } from './config.js';

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

  // The flag alone decides the language for anything that can fail before the
  // configuration file has been read — including reading it.
  const langDrapeau = parseLang(values.lang);
  if (langDrapeau === null) {
    process.stderr.write(`${messages(DEFAULT_LANG).badLang}\n`);
    return 2;
  }

  const configPath = values.config;
  const loaded = values['no-config']
    ? { config: {} as Config, path: null, warnings: [] as string[] }
    : loadConfig(process.cwd(), messages(langDrapeau), configPath);
  const file = loaded.config;

  for (const warning of loaded.warnings) {
    process.stderr.write(`${loaded.path} : ${warning}\n`);
  }

  // Resolved before the dispatch: every command below speaks it.
  const lang = parseLang(values.lang ?? file.lang);
  if (lang === null) {
    process.stderr.write(`${messages(langDrapeau).badLang}\n`);
    return 2;
  }
  const t = messages(lang);

  if (values.help || !command || command === 'help') {
    process.stdout.write(`${usage(lang)}\n`);
    return values.help || command === 'help' ? 0 : 2;
  }
  if (command === 'criteria') return criteria(lang);

  if (command !== 'check') {
    process.stderr.write(`${t.unknownCommand(command)}\n\n${usage(lang)}\n`);
    return 2;
  }

  const rawScore = values['min-score'];
  const minScore = rawScore === undefined ? file.minScore : Number(rawScore);
  if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 100)) {
    process.stderr.write(`${t.badScore}\n`);
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
  //
  // The language is read straight off the arguments: this catches failures from
  // before the parser ran, where nothing has been resolved yet.
  const drapeau = process.argv.indexOf('--lang');
  const lang = parseLang(drapeau === -1 ? undefined : process.argv[drapeau + 1]) ?? DEFAULT_LANG;

  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n\n${usage(lang)}\n`,
  );
  process.exitCode = 2;
}
