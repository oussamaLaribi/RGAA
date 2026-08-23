import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { instrumentTemplates, type InstrumentationSession } from '@rgaa-source/angular';
import { serveDirectory, type StaticSite } from './static-server.js';
import { resolveProjectBin, runNodeScript } from './run-command.js';
import {
  pickShell,
  readApplications,
  selectApplication,
  type AngularApplication,
} from './angular-workspace.js';

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
 * Every HTML file under the application's own source root, the app shell
 * included.
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

/**
 * Locate the build output at the path `angular.json` declares.
 *
 * The directory is read rather than trusted outright: a stale or partial build
 * leaves the path valid and its contents wrong, and "no index.html here" is a
 * far more actionable message than a scan of an empty site.
 */
async function findBuildOutput(
  outputBase: string,
  errors?: PrepareOptions['errors'],
): Promise<string> {
  if (!(await exists(outputBase))) {
    throw new Error(errors?.noBuildOutput(outputBase) ?? `no build output at ${outputBase}`);
  }

  const entries = await readdir(outputBase, { withFileTypes: true, recursive: true });
  const html = entries
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) => join(entry.parentPath, entry.name));

  const shell = pickShell(html);
  if (!shell) throw new Error(errors?.noIndexHtml(outputBase) ?? `no index.html under ${outputBase}`);

  return dirname(shell);
}

/**
 * Read `angular.json` and settle on one application before anything is touched.
 *
 * Done up front, so a workspace we cannot make sense of fails before a single
 * template has been rewritten.
 */
async function resolveApplication(
  workspacePath: string,
  root: string,
  options: PrepareOptions,
): Promise<AngularApplication> {
  let workspace: unknown;
  try {
    workspace = JSON.parse(await readFile(workspacePath, 'utf8'));
  } catch {
    throw new Error(
      options.errors?.badWorkspace(workspacePath) ?? `${workspacePath} is not valid JSON`,
    );
  }

  const application = selectApplication(readApplications(root, workspace), options.app, {
    noApplication: options.errors?.noApplication ?? 'angular.json declares no application',
    unknownApplication:
      options.errors?.unknownApplication ??
      ((name, available): string => `unknown application "${name}". Available: ${available.join(', ')}`),
    ambiguousApplication:
      options.errors?.ambiguousApplication ??
      ((available): string => `several applications, pick one with --app: ${available.join(', ')}`),
  });

  if (!(await exists(application.sourceRoot))) {
    throw new Error(
      options.errors?.noSourceRoot(application.sourceRoot) ??
        `no source directory at ${application.sourceRoot}`,
    );
  }

  return application;
}

export interface PrepareOptions {
  force?: boolean;
  /** Skip instrumentation and the build, and serve whatever is already in dist. */
  reuseBuild?: boolean;
  /** Which application to scan, when the workspace declares several. */
  app?: string;
  onProgress?: (message: string) => void;
  /** Wording for the three steps, so the driver says nothing in a fixed language. */
  labels?: { instrumenting: (count: number) => string; building: string; serving: (origin: string) => string };
  /** Wording for the errors this driver raises, for the same reason. */
  errors?: {
    notAngular: (path: string) => string;
    noBuildOutput: (path: string) => string;
    noIndexHtml: (path: string) => string;
    buildFailed: string;
    badWorkspace: (path: string) => string;
    noApplication: string;
    unknownApplication: (name: string, available: string[]) => string;
    ambiguousApplication: (available: string[]) => string;
    noSourceRoot: (path: string) => string;
  };
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

  const workspacePath = join(root, 'angular.json');
  if (!(await exists(workspacePath))) {
    throw new Error(
      options.errors?.notAngular(root) ??
        `${root} does not look like an Angular project (no angular.json)`,
    );
  }

  const application = await resolveApplication(workspacePath, root, options);

  let session: InstrumentationSession | null = null;
  let instrumented = 0;
  let templateCount = 0;
  let skipped: { path: string; errors: string[] }[] = [];
  let recovered: string[] = [];

  if (!options.reuseBuild) {
    const templates = await findTemplates(application.sourceRoot);
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
      // Name the application: in a workspace with several, a bare `ng build`
      // either picks the default or refuses, and neither is what was asked for.
      //
      // `development` is requested only when it exists. It is what `ng new`
      // scaffolds, not something Angular guarantees, and passing an undeclared
      // configuration fails the build outright — on a project that builds fine.
      const buildArgs = ['build', application.name];
      if (application.configurations.includes('development')) {
        buildArgs.push('--configuration', 'development');
      }

      try {
        await runNodeScript(
          ngCli,
          buildArgs,
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
          `${options.errors?.buildFailed ?? "the project's own build failed."}\n\n${output}`,
        );
      }
    } finally {
      // Restore before anything else can fail: the build has already baked the
      // locations into its output.
      await session.restore();
    }
  }

  const site = await serveDirectory(await findBuildOutput(application.outputBase, options.errors));
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
