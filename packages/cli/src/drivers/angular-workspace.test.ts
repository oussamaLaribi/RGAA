import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pickShell, readApplications, selectApplication } from './angular-workspace.js';

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

  it('reports the build configurations, so none is passed blindly', () => {
    const [app] = readApplications(
      ROOT,
      workspace({ shop: application({ configurations: { production: {} } }) }),
    );

    expect(app?.configurations).toEqual(['production']);
  });

  it('treats a malformed workspace as having no applications', () => {
    expect(readApplications(ROOT, null)).toEqual([]);
    expect(readApplications(ROOT, {})).toEqual([]);
    expect(readApplications(ROOT, { projects: 'nope' })).toEqual([]);
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
