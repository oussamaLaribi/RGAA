/**
 * End-to-end proof of the bridge: instrument the fixture's templates, run a real
 * Angular AOT build, and check the source locations survived compilation.
 *
 * Template-level unit tests cannot answer this. Angular compiles templates into
 * generated JavaScript, and a compiler free to drop attributes it does not
 * recognise would silently break the product's whole premise.
 */
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { instrumentTemplates } from '../../packages/angular/dist/index.js';
import { SOURCE_ATTRIBUTE, parseSourceLocation } from '../../packages/core/dist/index.js';

const run = promisify(execFile);
const appRoot = dirname(fileURLToPath(import.meta.url));
const template = join(appRoot, 'src/app/app.html');

async function readAllBundles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    out.push(await readFile(join(entry.parentPath ?? entry.path, entry.name), 'utf8'));
  }
  return out.join('\n');
}

const before = await readFile(template, 'utf8');
const session = await instrumentTemplates([template], appRoot);

try {
  console.log(`instrumented ${session.files[0]?.injected} elements in ${session.files[0]?.relativePath}`);
  console.log('running ng build ...');
  await run('npx', ['ng', 'build', '--configuration', 'development'], {
    cwd: appRoot,
    shell: true,
    maxBuffer: 1024 * 1024 * 64,
  });
} finally {
  await session.restore();
}

const restored = await readFile(template, 'utf8');
console.log(`templates restored byte-for-byte: ${restored === before}`);

const bundle = await readAllBundles(join(appRoot, 'dist'));
const found = [...bundle.matchAll(/data-a11y-src["',\s]+([^"']+\.html:\d+:\d+)/g)].map((m) => m[1]);
const unique = [...new Set(found)].sort();

console.log(`\nlocations surviving AOT compilation: ${unique.length}`);
for (const value of unique) {
  const parsed = parseSourceLocation(value);
  const line = before.split('\n')[parsed.line - 1] ?? '';
  console.log(`  ${value.padEnd(34)} -> ${line.trim().slice(0, 52)}`);
}

if (unique.length === 0) {
  console.error(`\nFAIL: no ${SOURCE_ATTRIBUTE} survived the build.`);
  process.exit(1);
}
