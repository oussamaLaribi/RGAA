import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasPendingRestore, instrumentTemplates } from './project.js';

let root: string;
let template: string;

const ORIGINAL = '<div>\n  <img src="a.png">\n</div>\n';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rgaa-'));
  // The backup lives under node_modules, so the directory has to exist.
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });

  template = join(root, 'src', 'app.html');
  await writeFile(template, ORIGINAL, 'utf8');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('instrumentTemplates', () => {
  it('rewrites the template and puts it back byte for byte', async () => {
    const session = await instrumentTemplates([template], root);

    expect(session.files[0]?.injected).toBe(2);
    expect(await readFile(template, 'utf8')).toContain('data-a11y-src');

    await session.restore();
    expect(await readFile(template, 'utf8')).toBe(ORIGINAL);
  });

  it('records paths relative to the project root', async () => {
    const session = await instrumentTemplates([template], root);
    try {
      // A location has to mean the same thing on a developer's machine and in
      // CI, where the checkout lives somewhere else entirely.
      expect(session.files[0]?.relativePath).toBe('src/app.html');
    } finally {
      await session.restore();
    }
  });

  it('leaves nothing behind once restored', async () => {
    const session = await instrumentTemplates([template], root);
    expect(await hasPendingRestore(root)).toBe(true);

    await session.restore();
    expect(await hasPendingRestore(root)).toBe(false);
  });

  /**
   * The reason originals are parked on disk rather than only held in memory.
   *
   * Without recovery, the tool would have to refuse to run whenever a template
   * had uncommitted changes — and a scan is run in the middle of working, so
   * that guard fires constantly, gets turned off, and protects nobody.
   */
  it('puts back templates a killed run left rewritten', async () => {
    // Simulate a process killed between the rewrite and the restore.
    const abandoned = await instrumentTemplates([template], root);
    expect(await readFile(template, 'utf8')).toContain('data-a11y-src');
    void abandoned;

    const next = await instrumentTemplates([template], root);
    try {
      expect(next.recovered).toEqual([template]);
      // Recovered first, then instrumented afresh — not doubly instrumented.
      expect(next.files[0]?.injected).toBe(2);
    } finally {
      await next.restore();
    }

    expect(await readFile(template, 'utf8')).toBe(ORIGINAL);
  });

  it('reports an unparsable template instead of failing the whole run', async () => {
    const broken = join(root, 'src', 'broken.html');
    await writeFile(broken, '<div><span></div>', 'utf8');

    const session = await instrumentTemplates([template, broken], root);
    try {
      expect(session.skipped).toHaveLength(1);
      expect(session.files).toHaveLength(1);
      // The one that could be parsed is still instrumented.
      expect(await readFile(template, 'utf8')).toContain('data-a11y-src');
      expect(await readFile(broken, 'utf8')).toBe('<div><span></div>');
    } finally {
      await session.restore();
    }
  });

  it('restores everything when one file fails mid-run', async () => {
    const missing = join(root, 'src', 'does-not-exist.html');

    await expect(instrumentTemplates([template, missing], root)).rejects.toThrow();
    // A partially rewritten tree is the worst outcome; there must be none.
    expect(await readFile(template, 'utf8')).toBe(ORIGINAL);
    expect(await hasPendingRestore(root)).toBe(false);
  });
});
