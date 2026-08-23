import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  pickShell,
  readApplications,
  readSourceRoots,
  selectApplication,
  toApplication,
} from './angular-workspace.js';

const ROOT = resolve('/ws');
const at = (...parts: string[]): string => resolve(ROOT, ...parts);

const workspace = (projects: Record<string, unknown>): unknown => ({ projects });

const application = (build: unknown, extra: Record<string, unknown> = {}): unknown => ({
  projectType: 'application',
  root: '',
  ...extra,
  architect: { build },
});

describe('readApplications', () => {
  it('falls back to Angular own defaults when nothing is declared', () => {
    // `sourceRoot` and `outputPath` are optional, and a project that omits them
    // is not misconfigured — it is the common case. Both defaults have to be
    // reproduced rather than treated as required fields.
    const [app] = readApplications(ROOT, workspace({ shop: application({}) }));

    expect(app?.sourceRoot).toBe(at('src'));
    expect(app?.outputBase).toBe(at('dist', 'shop'));
  });

  it('appends browser/ for the builder that splits its output', () => {
    // The `application` builder writes the browser bundle in a subdirectory;
    // the older `browser` builder writes straight into outputPath. Getting this
    // wrong means serving a directory with no index.html in it.
    const split = readApplications(
      ROOT,
      workspace({ shop: application({ builder: '@angular/build:application' }) }),
    );
    const flat = readApplications(
      ROOT,
      workspace({ shop: application({ builder: '@angular-devkit/build-angular:browser' }) }),
    );

    expect(split[0]?.outputBase).toBe(at('dist', 'shop', 'browser'));
    expect(flat[0]?.outputBase).toBe(at('dist', 'shop'));
  });

  it('reads the object form of outputPath introduced in Angular 17', () => {
    const [app] = readApplications(
      ROOT,
      workspace({
        shop: application({
          builder: '@angular/build:application',
          options: { outputPath: { base: 'build/shop', browser: 'public' } },
        }),
      }),
    );

    expect(app?.outputBase).toBe(at('build', 'shop', 'public'));
  });

  it('honours an explicitly empty browser subdirectory', () => {
    // `browser: ''` means "no subdirectory". Treating it as a missing value and
    // falling back to 'browser' would point at a directory that never exists.
    const [app] = readApplications(
      ROOT,
      workspace({
        shop: application({
          builder: '@angular/build:application',
          options: { outputPath: { base: 'dist/shop', browser: '' } },
        }),
      }),
    );

    expect(app?.outputBase).toBe(at('dist', 'shop'));
  });

  it('resolves the paths a monorepo actually uses', () => {
    const [app] = readApplications(
      ROOT,
      workspace({
        portal: application(
          { builder: '@angular/build:application' },
          { root: 'apps/portal', sourceRoot: 'apps/portal/src' },
        ),
      }),
    );

    expect(app?.sourceRoot).toBe(at('apps', 'portal', 'src'));
    expect(app?.outputBase).toBe(at('dist', 'portal', 'browser'));
  });

  it('derives sourceRoot from the project root when it is not declared', () => {
    const [app] = readApplications(
      ROOT,
      workspace({ portal: application({}, { root: 'apps/portal' }) }),
    );

    expect(app?.sourceRoot).toBe(at('apps', 'portal', 'src'));
  });

  it('accepts both the old architect key and the new targets key', () => {
    const withTargets = readApplications(
      ROOT,
      workspace({
        shop: {
          projectType: 'application',
          root: '',
          targets: { build: { options: { outputPath: 'out' } } },
        },
      }),
    );

    expect(withTargets[0]?.outputBase).toBe(at('out'));
  });

  it('skips libraries, which have nothing to serve', () => {
    const apps = readApplications(
      ROOT,
      workspace({
        shop: application({}),
        'ui-kit': { projectType: 'library', root: 'libs/ui-kit' },
      }),
    );

    expect(apps.map((a) => a.name)).toEqual(['shop']);
  });

  it('builds with development only when the project declares it', () => {
    const [app] = readApplications(
      ROOT,
      workspace({ shop: application({ configurations: { production: {} } }) }),
    );

    expect(app?.configuration).toBeNull();
  });

  it('lets the build configuration override the output path', () => {
    // Reported from a real project: the build announced `dist/dev` while the
    // scan looked in `dist/<name>/browser` and declared there was no output at
    // all. Overriding options is the entire purpose of a configuration, so
    // reading only `options` describes a build that never ran.
    const [app] = readApplications(
      ROOT,
      workspace({
        angularexampleapp: application({
          builder: '@angular/build:application',
          options: { outputPath: 'dist/angularexampleapp' },
          configurations: { development: { outputPath: 'dist/dev' }, production: {} },
        }),
      }),
    );

    expect(app?.configuration).toBe('development');
    expect(app?.outputBase).toBe(at('dist', 'dev', 'browser'));
  });

  it('keeps the base output path when the configuration does not override it', () => {
    const [app] = readApplications(
      ROOT,
      workspace({
        shop: application({
          options: { outputPath: 'dist/shop' },
          configurations: { development: { sourceMap: true } },
        }),
      }),
    );

    expect(app?.outputBase).toBe(at('dist', 'shop'));
  });

  it('ignores a production override, since it never builds with it', () => {
    const [app] = readApplications(
      ROOT,
      workspace({
        shop: application({
          options: { outputPath: 'dist/shop' },
          configurations: { production: { outputPath: 'dist/prod' } },
        }),
      }),
    );

    expect(app?.configuration).toBeNull();
    expect(app?.outputBase).toBe(at('dist', 'shop'));
  });

  it('treats a malformed workspace as having no applications', () => {
    expect(readApplications(ROOT, null)).toEqual([]);
    expect(readApplications(ROOT, {})).toEqual([]);
    expect(readApplications(ROOT, { projects: 'nope' })).toEqual([]);
  });
});

describe('toApplication, on the Nx shape', () => {
  // Taken from a real project.json in stefanoslig/angular-ngrx-nx-realworld:
  // Nx keeps one of these per project instead of a central angular.json, and
  // calls the builder an executor. Everything else is identical.
  const conduit = {
    name: 'conduit',
    projectType: 'application',
    sourceRoot: 'apps/conduit/src',
    targets: {
      build: {
        executor: '@angular-devkit/build-angular:browser-esbuild',
        options: { outputPath: 'dist/apps/conduit' },
        configurations: { production: {}, development: {} },
      },
    },
  };

  it('reads an Nx project as readily as an Angular one', () => {
    const app = toApplication(ROOT, 'conduit', conduit);

    expect(app?.sourceRoot).toBe(at('apps', 'conduit', 'src'));
    expect(app?.outputBase).toBe(at('dist', 'apps', 'conduit'));
    expect(app?.configuration).toBe('development');
  });

  it('does not add browser/ for the esbuild drop-in', () => {
    // `browser-esbuild` replaces `browser` and writes to outputPath directly.
    // Only `:application` splits its output, so matching on the package name
    // rather than the suffix would point at a directory that never exists.
    expect(toApplication(ROOT, 'conduit', conduit)?.outputBase).toBe(
      at('dist', 'apps', 'conduit'),
    );
  });

  it('skips a project that declares no build target', () => {
    // Nx marks every end-to-end suite as projectType "application". Offering
    // one as a scan target would put a Cypress project, which produces nothing
    // to serve, next to the real app in the list.
    const e2e = {
      name: 'conduit-e2e',
      projectType: 'application',
      targets: { e2e: { executor: '@nx/cypress:cypress' } },
    };

    expect(toApplication(ROOT, 'conduit-e2e', e2e)).toBeNull();
  });

  it('refuses anything that is not an application', () => {
    expect(toApplication(ROOT, 'ui', { projectType: 'library', targets: { build: {} } })).toBeNull();
    expect(toApplication(ROOT, 'x', null)).toBeNull();
  });
});

describe('readSourceRoots', () => {
  it('includes libraries, whose markup reaches the page too', () => {
    // Measured on angular-ngrx-nx-realworld: 35 component files in libs/ against
    // 7 in apps/. Instrumenting only the application left five components in six
    // with no source location at all.
    const roots = readSourceRoots(
      ROOT,
      workspace({
        conduit: application({}, { root: 'apps/conduit', sourceRoot: 'apps/conduit/src' }),
        'feature-home': { projectType: 'library', root: 'libs/home', sourceRoot: 'libs/home/src' },
      }),
    );

    expect(roots).toEqual([at('apps', 'conduit', 'src'), at('libs', 'home', 'src')]);
  });

  it('derives a root that was never declared', () => {
    const roots = readSourceRoots(ROOT, workspace({ ui: { projectType: 'library', root: 'libs/ui' } }));

    expect(roots).toEqual([at('libs', 'ui', 'src')]);
  });

  it('lists each root once, however many projects share it', () => {
    const roots = readSourceRoots(
      ROOT,
      workspace({
        a: application({}, { sourceRoot: 'src' }),
        b: { projectType: 'library', sourceRoot: 'src' },
      }),
    );

    expect(roots).toEqual([at('src')]);
  });

  it('skips a project that says nothing about where its sources are', () => {
    expect(readSourceRoots(ROOT, workspace({ ghost: { projectType: 'library' } }))).toEqual([]);
    expect(readSourceRoots(ROOT, null)).toEqual([]);
  });
});

describe('selectApplication', () => {
  const errors = {
    noApplication: 'none',
    unknownApplication: (name: string, available: string[]) => `unknown ${name} of ${available}`,
    ambiguousApplication: (available: string[]) => `ambiguous ${available}`,
  };
  const apps = readApplications(
    ROOT,
    workspace({ shop: application({}), portal: application({}, { root: 'apps/portal' }) }),
  );

  it('takes the only application without being asked', () => {
    expect(selectApplication([apps[0]!], undefined, errors).name).toBe('shop');
  });

  it('refuses to guess between several', () => {
    // Scanning the wrong application of a monorepo yields a complete, plausible
    // report about code nobody asked about — a failure that can go unnoticed,
    // which is worse than one that stops the run.
    expect(() => selectApplication(apps, undefined, errors)).toThrow(/ambiguous/);
    expect(() => selectApplication(apps, undefined, errors)).toThrow(/shop.*portal|portal.*shop/);
  });

  it('takes the one that was named', () => {
    expect(selectApplication(apps, 'portal', errors).name).toBe('portal');
  });

  it('lists what exists when the name is wrong', () => {
    expect(() => selectApplication(apps, 'shopp', errors)).toThrow(/unknown shopp/);
  });

  it('says so when the workspace declares no application at all', () => {
    expect(() => selectApplication([], undefined, errors)).toThrow('none');
  });
});

describe('pickShell', () => {
  it('takes the shallowest index.html', () => {
    // Prerendering writes one index.html per route. Taking whichever the
    // filesystem lists first can serve /about as the entry point, and the scan
    // then reports on the wrong page without any error at all.
    expect(
      pickShell([at('dist/app/about/index.html'), at('dist/app/index.html')]),
    ).toBe(at('dist/app/index.html'));
  });

  it('ignores html files that are not the shell', () => {
    expect(pickShell([at('dist/app/assets/widget.html')])).toBeNull();
    expect(pickShell([])).toBeNull();
  });

  it('breaks ties by name rather than by filesystem order', () => {
    const first = pickShell([at('dist/b/index.html'), at('dist/a/index.html')]);
    const again = pickShell([at('dist/a/index.html'), at('dist/b/index.html')]);

    expect(first).toBe(again);
  });
});
