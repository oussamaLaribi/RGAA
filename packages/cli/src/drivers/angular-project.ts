import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { instrumentTemplates, type InstrumentationSession } from '@rgaa-source/angular';
import { serveDirectory, type StaticSite } from './static-server.js';
import { resolveProjectBin, runNodeScript } from './run-command.js';
import {
  pickShell,
  readApplications,
  selectApplication,
  toApplication,
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
 * Locate the build output at the path the workspace declares.
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

/** Read one JSON file, blaming the file rather than the tool when it is broken. */
async function readJson(path: string, options: PrepareOptions): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(options.errors?.badWorkspace(path) ?? `${path} is not valid JSON`);
  }
}

/**
 * Every application in an Nx workspace, which keeps one `project.json` per
 * project instead of a central file.
 *
 * Nx is common in exactly the organisations a French accessibility obligation
 * applies to, and it has no `angular.json` at all — so without this the tool
 * refuses the whole category with "this is not an Angular project", which is
 * both wrong and unhelpful.
 *
 * The search is bounded to three levels. Nx puts projects under `apps/` and
 * `libs/` by convention but does not enforce it, and walking an entire
 * repository to find configuration files would be slow and full of surprises.
 */
async function readNxApplications(
  root: string,
  options: PrepareOptions,
): Promise<AngularApplication[]> {
  const found: AngularApplication[] = [];

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 3) return;

    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isFile() && entry.name === 'project.json') {
        const project = await readJson(path, options);
        // Nx allows the name to be omitted, in which case it is the directory.
        const name =
          typeof (project as { name?: unknown })?.name === 'string'
            ? ((project as { name: string }).name)
            : basename(directory);

        const application = toApplication(root, name, project);
        if (application) found.push(application);
        continue;
      }

      // node_modules holds thousands of project.json files that are not ours.
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        await walk(path, depth + 1);
      }
    }
  };

  await walk(root, 0);
  return found;
}

/**
 * Settle on one application before anything is touched.
 *
 * Done up front, so a workspace we cannot make sense of fails before a single
 * template has been rewritten.
 */
async function resolveApplication(
  workspacePath: string | null,
  root: string,
  options: PrepareOptions,
): Promise<AngularApplication> {
  const applications =
    workspacePath === null
      ? await readNxApplications(root, options)
      : readApplications(root, await readJson(workspacePath, options));

  const application = selectApplication(applications, options.app, {
    noApplication: options.errors?.noApplication ?? 'this workspace declares no application',
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
    binNotFound: (name: string, path: string) => string;
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

  // Two shapes are accepted: a central `angular.json`, and an Nx workspace,
  // which has none and keeps a `project.json` beside each project instead.
  const angularJson = join(root, 'angular.json');
  const isAngularWorkspace = await exists(angularJson);
  const isNxWorkspace = !isAngularWorkspace && (await exists(join(root, 'nx.json')));

  if (!isAngularWorkspace && !isNxWorkspace) {
    throw new Error(
      options.errors?.notAngular(root) ??
        `${root} does not look like an Angular project (no angular.json)`,
    );
  }

  const application = await resolveApplication(
    isAngularWorkspace ? angularJson : null,
    root,
    options,
  );

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
      // Nx workspaces are driven by the Nx CLI. `ng build` may exist there too,
      // but only when @nx/angular installed it, so relying on it would work on
      // some Nx projects and fail on others for no reason the user can see.
      const cli = isNxWorkspace
        ? resolveProjectBin(root, 'nx/bin/nx.js', options.errors?.binNotFound)
        : resolveProjectBin(root, '@angular/cli/bin/ng.js', options.errors?.binNotFound);

      // Name the application: in a workspace with several, a bare `build`
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
          cli,
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
