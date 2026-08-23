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
  /** Build configurations it declares, so we never pass one that is absent. */
  configurations: string[];
}

interface RawTarget {
  builder?: unknown;
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
 * Builders that split their output, putting the browser bundle in a
 * subdirectory. The older `:browser` builder writes straight into `outputPath`.
 */
const SPLIT_OUTPUT = /:(application|ssr-dev-server)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Resolve where a build writes.
 *
 * `outputPath` is either absent, a string, or — since Angular 17 — an object
 * splitting `base` from the `browser` subdirectory. All three appear in the
 * wild, and the object form is the one a hand-written path check gets wrong.
 */
function resolveOutput(root: string, name: string, target: RawTarget | undefined): string {
  const raw = target?.options?.outputPath;
  const builder = typeof target?.builder === 'string' ? target.builder : '';

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

/** Every application the workspace declares. Libraries are skipped: nothing to serve. */
export function readApplications(root: string, workspace: unknown): AngularApplication[] {
  if (!isRecord(workspace) || !isRecord(workspace['projects'])) return [];

  const applications: AngularApplication[] = [];

  for (const [name, value] of Object.entries(workspace['projects'])) {
    if (!isRecord(value)) continue;
    const project = value as RawProject;
    if (project.projectType !== 'application') continue;

    const projectRoot = typeof project.root === 'string' ? project.root : '';
    const build = (project.targets ?? project.architect ?? {})['build'];

    applications.push({
      name,
      sourceRoot: resolve(
        root,
        typeof project.sourceRoot === 'string' ? project.sourceRoot : join(projectRoot, 'src'),
      ),
      outputBase: resolveOutput(root, name, build),
      configurations: Object.keys(build?.configurations ?? {}),
    });
  }

  return applications;
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
