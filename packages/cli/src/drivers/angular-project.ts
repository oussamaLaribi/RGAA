import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { instrumentTemplates, type InstrumentationSession } from '@rgaa-source/angular';
import { serveDirectory, type StaticSite } from './static-server.js';
import { resolveProjectBin, runNodeScript } from './run-command.js';

export interface PreparedProject {
  site: StaticSite;
  instrumented: number;
  templateCount: number;
  skipped: { path: string; errors: string[] }[];
  /** Templates put back from a previous run that was killed before finishing. */
  recovered: string[];
  /** Restores templates and stops the server. Always call from a `finally`. */
  dispose(): Promise<void>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every HTML file under `src`, the app shell included.
 *
 * `index.html` is worth instrumenting even though Angular never compiles it:
 * the build copies it through to the output, so the locations survive and the
 * document-level findings — a missing `lang`, no page title, a viewport that
 * blocks zoom — become traceable and fixable like any other markup. Excluding it
 * would put the most mechanically fixable violations out of reach.
 */
async function findTemplates(sourceRoot: string): Promise<string[]> {
  const entries = await readdir(sourceRoot, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Locate the build output, which Angular writes to `dist/<project>/browser`. */
async function findBuildOutput(projectRoot: string): Promise<string> {
  const distRoot = join(projectRoot, 'dist');
  if (!(await exists(distRoot))) throw new Error(`no build output at ${distRoot}`);

  const entries = await readdir(distRoot, { withFileTypes: true, recursive: true });
  const shell = entries.find((entry) => entry.isFile() && entry.name === 'index.html');
  if (!shell) throw new Error(`no index.html under ${distRoot}`);

  return shell.parentPath;
}

export interface PrepareOptions {
  force?: boolean;
  /** Skip instrumentation and the build, and serve whatever is already in dist. */
  reuseBuild?: boolean;
  onProgress?: (message: string) => void;
  /** Wording for the three steps, so the driver says nothing in a fixed language. */
  labels?: { instrumenting: (count: number) => string; building: string; serving: (origin: string) => string };
  /** Echo the build output as it arrives. */
  onBuildOutput?: (chunk: string) => void;
}

/**
 * Instrument, build and serve an Angular project so it can be scanned with
 * source locations attached.
 *
 * Templates are restored as soon as the build has consumed them — the compiled
 * output keeps the locations, so there is no reason to leave rewritten files on
 * disk for the length of the scan.
 */
export async function prepareProject(
  projectRoot: string,
  options: PrepareOptions = {},
): Promise<PreparedProject> {
  const root = resolve(projectRoot);
  const report = options.onProgress ?? ((): void => {});

  if (!(await exists(join(root, 'angular.json')))) {
    throw new Error(`${root} does not look like an Angular project (no angular.json)`);
  }

  let session: InstrumentationSession | null = null;
  let instrumented = 0;
  let templateCount = 0;
  let skipped: { path: string; errors: string[] }[] = [];
  let recovered: string[] = [];

  if (!options.reuseBuild) {
    const templates = await findTemplates(join(root, 'src'));
    templateCount = templates.length;

    report(
      options.labels?.instrumenting(templates.length) ??
        `instrumenting ${templates.length} template(s)`,
    );

    session = await instrumentTemplates(templates, root);
    instrumented = session.files.reduce((total, file) => total + file.injected, 0);
    skipped = session.skipped;
    recovered = session.recovered;

    try {
      report(options.labels?.building ?? 'building');
      const ngCli = resolveProjectBin(root, '@angular/cli/bin/ng.js');
      try {
        await runNodeScript(
          ngCli,
          ['build', '--configuration', 'development'],
          root,
          options.onBuildOutput ? { onOutput: options.onBuildOutput } : {},
        );
      } catch (error) {
        // Say whose build failed. Without this the raw failure — a node command
        // line hundreds of characters long — reads as if this tool broke the
        // project, when almost always the project simply does not build.
        const details = error as { stdout?: string; stderr?: string };
        const output = `${details.stdout ?? ''}${details.stderr ?? ''}`.trim();
        throw new Error(
          `the project's own build failed. Check that "ng build" works before scanning.\n\n${output}`,
        );
      }
    } finally {
      // Restore before anything else can fail: the build has already baked the
      // locations into its output.
      await session.restore();
    }
  }

  const site = await serveDirectory(await findBuildOutput(root));
  report(options.labels?.serving(site.origin) ?? `serving ${site.origin}`);

  return {
    site,
    instrumented,
    templateCount,
    skipped,
    recovered,
    dispose: () => site.close(),
  };
}
