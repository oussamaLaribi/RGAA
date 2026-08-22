/**
 * The founding claim, checked against a real rendered DOM.
 *
 * The bundle carrying `data-a11y-src` only proves it survived compilation. What
 * the product actually promises is that a violation found in the live page can
 * read its own source address off the element — so that has to be observed in a
 * browser, on the rendered tree, not inferred from the build output.
 */
import { chromium } from 'playwright';
import { parseSourceLocation } from '../../packages/core/dist/index.js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));
const templateLines = (await readFile(join(appRoot, 'src/app/app.html'), 'utf8')).split('\n');

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });

const report = await page.evaluate(() => ({
  rendered: document.querySelectorAll('app-root *').length,
  located: [...document.querySelectorAll('[data-a11y-src]')].map((el) => ({
    tag: el.tagName.toLowerCase(),
    at: el.getAttribute('data-a11y-src'),
  })),
  // What a real rule would ask, phrased exactly as the product will.
  imagesWithoutAlt: [...document.querySelectorAll('img:not([alt])')].map((el) => ({
    src: el.getAttribute('src'),
    at: el.getAttribute('data-a11y-src'),
  })),
  buttonsWithoutName: [...document.querySelectorAll('button')]
    .filter((el) => !el.textContent.trim() && !el.getAttribute('aria-label'))
    .map((el) => ({ at: el.getAttribute('data-a11y-src') })),
}));

await browser.close();

console.log(`elements rendered: ${report.rendered}`);
console.log(`elements carrying a source location: ${report.located.length}\n`);

let wrong = 0;
for (const { tag, at } of report.located) {
  const location = parseSourceLocation(at);
  const text = templateLines[location.line - 1]?.slice(location.column - 1) ?? '';
  const ok = text.startsWith(`<${tag}`);
  if (!ok) wrong++;
  console.log(`  ${ok ? 'OK  ' : 'WRONG'} <${tag}>`.padEnd(20), at);
}

console.log('\n--- what the developer would actually be told ---');
for (const image of report.imagesWithoutAlt) {
  console.log(`  image without alt      ${image.src.padEnd(16)} ${image.at}`);
}
for (const button of report.buttonsWithoutName) {
  console.log(`  button without a name  ${''.padEnd(16)} ${button.at}`);
}

if (wrong > 0 || report.located.length === 0) {
  console.error(`\nFAIL: ${wrong} wrong, ${report.located.length} located.`);
  process.exit(1);
}
console.log('\nPASS: every rendered element resolves to the line it was written at.');
