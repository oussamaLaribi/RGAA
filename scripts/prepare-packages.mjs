/**
 * Fill in the publishing metadata every package needs, from one place.
 *
 * Kept as a script rather than hand-edited into five files: the version and the
 * repository URL have to agree across all of them, and the first time they drift
 * npm will happily publish packages that depend on versions that do not exist.
 */
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Single source of truth for the release. */
const VERSION = '0.1.0';

/** Public home of the project; every package points its bug reports here. */
const REPOSITORY = 'https://github.com/oussamaLaribi/RGAA';

const DESCRIPTIONS = {
  '@rgaa-source/core':
    'Accessibility engine mapping axe-core and custom rules to the French RGAA 4.1 reference frame.',
  '@rgaa-source/angular':
    'Rewrites Angular templates so every rendered element carries the file, line and column it was written at.',
  '@rgaa-source/fix':
    'Applies accessibility fixes back to Angular source, classified by how much human judgement they need.',
  '@rgaa-source/report':
    'HTML report, RGAA evaluation grid and baseline comparison for accessibility audits.',
  '@rgaa-source/cli':
    'Accessibility scanner for Angular projects that reports the line of code, not a CSS selector.',
};

const KEYWORDS = [
  'accessibility',
  'a11y',
  'rgaa',
  'wcag',
  'angular',
  'axe-core',
  'audit',
  'accessibilite',
];

const PACKAGES = ['core', 'angular', 'fix', 'report', 'cli'];

for (const name of PACKAGES) {
  const path = join(root, 'packages', name, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));

  manifest.version = VERSION;
  manifest.description = DESCRIPTIONS[manifest.name];
  manifest.keywords = KEYWORDS;
  manifest.license = 'MIT';
  manifest.repository = { type: 'git', url: `git+${REPOSITORY}.git`, directory: `packages/${name}` };
  manifest.bugs = { url: `${REPOSITORY}/issues` };
  manifest.homepage = `${REPOSITORY}#readme`;
  // 20.12 and not 20: the code reads Dirent.parentPath, which landed there.
  // A looser range installs cleanly and then fails on undefined paths, which is
  // worse than refusing to install.
  manifest.engines = { node: '>=20.12' };
  // Scoped packages default to private on npm; without this the first publish
  // fails with a payment-required error that reads as a permissions problem.
  manifest.publishConfig = { access: 'public' };
  // The build emits source maps and declaration maps; without the sources they
  // point at, both are dead weight — a debugger opens nothing and "go to
  // definition" lands in generated JavaScript. The TypeScript is smaller than
  // the maps themselves, so shipping it costs less than shipping broken maps.
  // The negation keeps the tests out: they are useless to a consumer and would
  // land in every install and every registry search index.
  manifest.files = ['dist', 'src', '!src/**/*.test.ts'];

  // Keep workspace dependencies pinned to the version being released.
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      if (dependency.startsWith('@rgaa-source/')) manifest[field][dependency] = `^${VERSION}`;
    }
  }

  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await copyFile(join(root, 'LICENSE'), join(root, 'packages', name, 'LICENSE'));
  console.log(`${manifest.name.padEnd(18)} ${VERSION}`);
}

console.log(`\nrepository: ${REPOSITORY}`);
