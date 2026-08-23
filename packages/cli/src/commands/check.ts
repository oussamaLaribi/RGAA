import { readFile, writeFile } from 'node:fs/promises';
import { normalizeReport, type AuditResult } from '@rgaa-source/core';
import { openBrowser } from '../drivers/browser.js';
import { prepareProject } from '../drivers/angular-project.js';
import { formatConsoleReport } from '../reporters/console.js';
import { formatFixReport } from '../reporters/fix.js';
import { planFixes, writePlan, type FixLevel } from '@rgaa-source/fix';
import { parseTemplateElements } from '@rgaa-source/angular';
import { assertRecoverable } from '../drivers/git.js';
import { formatRegressionReport } from '../reporters/regression.js';
import { createProgress } from '../reporters/progress.js';
import { messages, DEFAULT_LANG, type Lang } from '../i18n.js';
import { loadAxeLocale, loadRuleLocale } from '../locales.js';
import {
  compareToBaseline,
  hasBlockingRegression,
  toGridCsv,
  toHtml,
  type BaselineComparison,
} from '@rgaa-source/report';

export interface CheckOptions {
  urls: string[];
  project?: string;
  /** Which application to scan, when the workspace declares several. */
  app?: string;
  routes: string[];
  minScore?: number;
  fail: boolean;
  json?: string;
  /** Self-contained HTML report, for whoever commissioned the work. */
  html?: string;
  /** RGAA evaluation grid as CSV, for the official spreadsheet. */
  grid?: string;
  /** Reference run to compare against; failures are judged on what is new. */
  baseline?: string;
  browser?: string;
  violationsOnly: boolean;
  lang: Lang;
  reuseBuild: boolean;
  force: boolean;
  verbose: boolean;
  /** Write the fixes that need no judgement. */
  fix: boolean;
  /** Also write the fixes whose wording a human still has to supply. */
  fixSuggested: boolean;
  /** Show what would be written, and write nothing. */
  dryRun: boolean;
}

/** 0 clean, 1 the gate rejected the results, 2 the run itself failed. */
export type ExitCode = 0 | 1 | 2;

/**
 * Plan the edits, show them, and write them unless this is a rehearsal.
 *
 * The plan is always printed in full before anything is written. Editing
 * someone's source automatically is only acceptable if they can read every
 * change first; a summary count is not something a reviewer can check.
 */
async function applyFixes(
  results: readonly AuditResult[],
  options: CheckOptions,
  log: (message: string) => void,
): Promise<'done' | 'failed'> {
  if (!options.project) {
    log(messages(options.lang).fixNeedsProject);
    return 'failed';
  }

  const levels: FixLevel[] = options.fixSuggested ? ['safe', 'suggested'] : ['safe'];
  const plan = await planFixes({
    results,
    projectRoot: options.project,
    // The composition root is where the framework is chosen; everything below
    // works on offsets and attributes and never learns which one it was.
    parse: parseTemplateElements,
    options: { levels },
  });

  if (!options.dryRun && plan.files.length > 0) {
    await assertRecoverable(
      options.project,
      plan.files.map((file) => file.absolutePath),
      options.force,
      messages(options.lang).guardFix,
      { dirty: messages(options.lang).guardDirty, how: messages(options.lang).guardHow },
    );
  }

  const willWrite = !options.dryRun && plan.files.length > 0;
  if (willWrite) await writePlan(plan);

  process.stdout.write(`${formatFixReport(plan, willWrite, options.lang)}\n`);
  return 'done';
}

/**
 * Write every requested deliverable and return the baseline comparison, if one
 * was asked for.
 */
async function emit(
  results: readonly AuditResult[],
  options: CheckOptions,
  log: (message: string) => void,
): Promise<BaselineComparison | null> {
  const t = messages(options.lang);
  if (options.json) {
    await writeFile(options.json, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    log(t.wrote(options.json));
  }
  if (options.html) {
    await writeFile(options.html, toHtml(results), 'utf8');
    log(t.wrote(options.html));
  }
  if (options.grid) {
    await writeFile(options.grid, toGridCsv(results), 'utf8');
    log(t.wrote(options.grid));
  }

  if (!options.baseline) return null;

  let recorded: AuditResult[];
  try {
    recorded = JSON.parse(await readFile(options.baseline, 'utf8')) as AuditResult[];
  } catch {
    // A missing baseline is the normal first run, not a failure: record it and
    // let the next run compare against it.
    await writeFile(options.baseline, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    log(t.baselineRecorded(options.baseline));
    return null;
  }

  const comparison = compareToBaseline(results, recorded);
  process.stdout.write(`${formatRegressionReport(comparison, options.lang)}\n`);
  return comparison;
}

function gate(
  results: readonly AuditResult[],
  options: CheckOptions,
  comparison: BaselineComparison | null,
): boolean {
  if (!options.fail) return true;

  // A baseline changes the question from "is this codebase clean?" to "did this
  // change make it worse?". Nobody can fix hundreds of existing violations
  // before the next release; everybody can agree not to add more — and a gate a
  // team can actually meet is one they keep switched on.
  if (comparison) return !hasBlockingRegression(comparison);

  if (options.minScore !== undefined) {
    return results.every((result) => result.score.value >= options.minScore!);
  }
  return results.every((result) => result.violations.length === 0);
}

export async function check(options: CheckOptions): Promise<ExitCode> {
  // Progress goes to stderr so that stdout stays a clean, pipeable report.
  const t = messages(options.lang);
  const progress = createProgress(process.stderr);
  const log = (message: string): void => progress.note(message);

  let targets: { url: string; label: string }[];
  let dispose: () => Promise<void> = async () => {};

  try {
    if (options.project) {
      const project = await prepareProject(options.project, {
        force: options.force,
        reuseBuild: options.reuseBuild,
        onProgress: (message) => progress.step(message),
        labels: { instrumenting: t.instrumenting, building: t.building, serving: t.serving },
        errors: {
          notAngular: t.notAngular,
          noBuildOutput: t.noBuildOutput,
          noIndexHtml: t.noIndexHtml,
          buildFailed: t.buildFailed,
          badWorkspace: t.badWorkspace,
          noApplication: t.noApplication,
          unknownApplication: t.unknownApplication,
          ambiguousApplication: t.ambiguousApplication,
          noSourceRoot: t.noSourceRoot,
        },
        // Assigned conditionally: the option type forbids an explicit undefined.
        ...(options.app !== undefined ? { app: options.app } : {}),
        // The build is the long step and says plenty while it works; --verbose
        // lets it through so a slow project can be diagnosed rather than guessed at.
        ...(options.verbose
          ? { onBuildOutput: (chunk: string) => process.stderr.write(chunk) }
          : {}),
      });
      dispose = project.dispose;

      if (!options.reuseBuild) {
        log(t.located(project.instrumented, project.templateCount));
        for (const path of project.recovered) {
          log(t.recovered(path));
        }
        for (const skip of project.skipped) {
          log(t.skippedTemplate(skip.path, skip.errors[0] ?? ''));
        }
      }

      const routes = options.routes.length > 0 ? options.routes : ['/'];
      targets = routes.map((route) => ({
        url: `${project.site.origin}${route.startsWith('/') ? route : `/${route}`}`,
        // Record the route, not the ephemeral port, so results stay comparable
        // between runs and between machines.
        label: route,
      }));
    } else {
      targets = options.urls.map((url) => ({ url, label: url }));
    }

    if (targets.length === 0) {
      log(t.nothingToScan);
      return 2;
    }

    const browserOptions: Parameters<typeof openBrowser>[0] = {
      violationsOnly: options.violationsOnly,
      // Translated in the page, before anything is produced, so the console,
      // the HTML report, the grid and the JSON all come out in one language.
      locale: loadAxeLocale(options.lang),
      ruleLocale: loadRuleLocale(options.lang),
    };
    if (options.browser) browserOptions.channel = options.browser;

    const session = await openBrowser(browserOptions);
    const results: AuditResult[] = [];

    try {
      for (const target of targets) {
        progress.step(t.scanning(target.label));
        const { axe, custom } = await session.scan(target.url);

        if (axe.error) {
          log(t.axeFailed(target.label, axe.error));
          return 2;
        }
        for (const failure of custom.errors) {
          // A rule that throws costs its own finding, never the whole scan.
          log(t.ruleFailed(failure.ruleId, failure.message));
        }

        results.push(normalizeReport(axe, { url: target.label, custom }));
      }
    } finally {
      await session.close();
    }

    progress.done();
    const foundSomething = results.some((result) => result.violations.length > 0);
    process.stdout.write(`${formatConsoleReport(results, {
      verbose: options.verbose,
      lang: options.lang,
      gateHint: !options.fail && foundSomething,
    })}\n`);

    const comparison = await emit(results, options, log);

    if (options.fix || options.fixSuggested) {
      const wrote = await applyFixes(results, options, log);
      // Fixing does not launder the result. The gate still reflects what the
      // scan found, so a pipeline cannot be made to pass by rewriting source
      // during the run.
      if (wrote === 'failed') return 2;
    }

    return gate(results, options, comparison) ? 0 : 1;
  } catch (error) {
    log(t.errorPrefix(error instanceof Error ? error.message : String(error)));
    return 2;
  } finally {
    progress.done();
    await dispose();
  }
}
