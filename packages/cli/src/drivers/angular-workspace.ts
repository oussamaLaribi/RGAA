import { join, normalize, resolve } from 'node:path';

/**
 * Reads what `angular.json` actually declares, instead of assuming the layout a
 * fresh `ng new` produces.
 *
 * The previous version hard-coded `src` and `dist`. Both are defaults, not
 * rules: a workspace may set `sourceRoot` and `outputPath` to anything, and a
 * monorepo always does. Guessing produced two failures — a clear one, "no build
 * output", on projects that build perfectly well; and a silent one, scanning
 * whichever application the filesystem happened to list first.
 */

/** One buildable application, with every path already resolved to absolute. */
export interface AngularApplication {
  name: string;
  /** Where its templates live. */
  sourceRoot: string;
  /** The directory its build writes into, `browser` subdirectory included. */
  outputBase: string;
  /**
   * The configuration the build will run with, or null to run with none.
   *
   * Carried on the application rather than decided again at build time: the
   * output path depends on it, so the two deciding separately is a bug waiting
   * to happen — we would look where one configuration writes and build with
   * another.
   */
  configuration: string | null;
}

interface RawTarget {
  /** Angular's name for it. */
  builder?: unknown;
  /** Nx's name for the same thing, in `project.json`. */
  executor?: unknown;
  options?: { outputPath?: unknown };
  configurations?: Record<string, unknown>;
}

interface RawProject {
  projectType?: unknown;
  root?: unknown;
  sourceRoot?: unknown;
  architect?: Record<string, RawTarget>;
  targets?: Record<string, RawTarget>;
}

/**
 * Builders that split their output, putting the browser bundle in a `browser`
 * subdirectory. `:browser` and `:browser-esbuild` write straight into
 * `outputPath`, so the suffix is what distinguishes them, not the package.
 */
const SPLIT_OUTPUT = /:application$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Resolve where a build writes.
 *
 * `outputPath` is either absent, a string, or — since Angular 17 — an object
 * splitting `base` from the `browser` subdirectory. All three appear in the
 * wild, and the object form is the one a hand-written path check gets wrong.
 */
function resolveOutput(
  root: string,
  name: string,
  target: RawTarget | undefined,
  /** The configuration the build will actually run with, if any. */
  configuration: string | null,
): string {
  // A configuration overrides the base options — that is the whole point of one.
  // Reading only `options` sends the scan to a directory the build never wrote:
  // a project whose development configuration sets `dist/dev` builds fine and is
  // then reported as having no build output at all.
  const overrides = configuration === null ? undefined : target?.configurations?.[configuration];
  const raw =
    (isRecord(overrides) ? overrides['outputPath'] : undefined) ?? target?.options?.outputPath;

  const declared = target?.builder ?? target?.executor;
  const builder = typeof declared === 'string' ? declared : '';

  if (isRecord(raw)) {
    const base = typeof raw['base'] === 'string' ? raw['base'] : join('dist', name);
    // An explicit empty string means "no subdirectory", which is why this cannot
    // fall back to 'browser' on any falsy value.
    const sub = typeof raw['browser'] === 'string' ? raw['browser'] : 'browser';
    return resolve(root, join(base, sub));
  }

  // Absent means Angular's own default, `dist/<project>`.
  const base = typeof raw === 'string' ? raw : join('dist', name);
  return resolve(root, SPLIT_OUTPUT.test(builder) ? join(base, 'browser') : base);
}

/**
 * Turn one project entry into an application, or null when it is not one we can
 * scan.
 *
 * Shared between `angular.json` and Nx's per-project `project.json`, whose
 * entries have the same shape down to the key names — Nx only calls the builder
 * an `executor`.
 *
 * A project with no build target is skipped even when it calls itself an
 * application: Nx gives every end-to-end suite `projectType: "application"`, and
 * including those would offer the user a choice between their app and a Cypress
 * project that produces nothing to serve.
 */
export function toApplication(
  root: string,
  name: string,
  value: unknown,
): AngularApplication | null {
  if (!isRecord(value)) return null;
  const project = value as RawProject;
  if (project.projectType !== 'application') return null;

  const build = (project.targets ?? project.architect ?? {})['build'];
  if (!build) return null;

  const projectRoot = typeof project.root === 'string' ? project.root : '';

  // `development` when the project declares it — it is what `ng new` scaffolds
  // and what a scan wants, since a production build strips what makes the
  // output readable. It is not guaranteed to exist, and asking for an undeclared
  // configuration fails the build outright, on a project that builds fine.
  const configuration = build.configurations?.['development'] ? 'development' : null;

  return {
    name,
    sourceRoot: resolve(
      root,
      typeof project.sourceRoot === 'string' ? project.sourceRoot : join(projectRoot, 'src'),
    ),
    outputBase: resolveOutput(root, name, build, configuration),
    configuration,
  };
}

/** Every application `angular.json` declares. Libraries are skipped: nothing to serve. */
export function readApplications(root: string, workspace: unknown): AngularApplication[] {
  if (!isRecord(workspace) || !isRecord(workspace['projects'])) return [];

  return Object.entries(workspace['projects'])
    .map(([name, value]) => toApplication(root, name, value))
    .filter((application): application is AngularApplication => application !== null);
}

/**
 * Where a project keeps its sources, whatever kind of project it is.
 *
 * Libraries matter here even though they cannot be served. One application is
 * built, but the markup that reaches the page comes from everything it imports —
 * and in an Nx workspace that is most of the code: angular-ngrx-nx-realworld
 * keeps 35 component files in `libs/` against 7 in `apps/`. Instrumenting only
 * the application left five components in six untraceable.
 */
export function toSourceRoot(root: string, value: unknown): string | null {
  if (!isRecord(value)) return null;
  const project = value as RawProject;

  if (typeof project.sourceRoot === 'string') return resolve(root, project.sourceRoot);
  if (typeof project.root === 'string') return resolve(root, join(project.root, 'src'));
  return null;
}

/** Every source root in an `angular.json` workspace, applications and libraries alike. */
export function readSourceRoots(root: string, workspace: unknown): string[] {
  if (!isRecord(workspace) || !isRecord(workspace['projects'])) return [];

  return [...new Set(
    Object.values(workspace['projects'])
      .map((value) => toSourceRoot(root, value))
      .filter((path): path is string => path !== null),
  )];
}

/**
 * Pick the application to scan.
 *
 * Ambiguity is an error rather than a choice. Scanning the wrong application of
 * a monorepo produces a full, plausible report about code the user never asked
 * about — a failure they may never notice, which is worse than one that stops
 * them.
 */
export function selectApplication(
  applications: readonly AngularApplication[],
  requested: string | undefined,
  errors: {
    noApplication: string;
    unknownApplication: (name: string, available: string[]) => string;
    ambiguousApplication: (available: string[]) => string;
  },
): AngularApplication {
  const names = applications.map((application) => application.name);

  if (requested !== undefined) {
    const found = applications.find((application) => application.name === requested);
    if (!found) throw new Error(errors.unknownApplication(requested, names));
    return found;
  }

  if (applications.length === 0) throw new Error(errors.noApplication);
  if (applications.length > 1) throw new Error(errors.ambiguousApplication(names));

  return applications[0]!;
}

/**
 * The shell among the built HTML files: the shallowest `index.html`.
 *
 * Prerendering writes one `index.html` per route, so taking the first match a
 * recursive walk returns can serve `/about` as the application's entry point —
 * and the scan then reports on the wrong page without any error.
 */
export function pickShell(htmlFiles: readonly string[]): string | null {
  const depth = (path: string): number => normalize(path).split(/[\\/]/).length;

  const shells = htmlFiles
    .filter((path) => /(^|[\\/])index\.html$/.test(path))
    // Ties broken by name so the choice is deterministic rather than dependent
    // on the order the filesystem happened to return.
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));

  return shells[0] ?? null;
}
