import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILENAME, loadConfig, pick } from './config.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rgaa-config-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (content: string, name = CONFIG_FILENAME): void => {
  writeFileSync(join(dir, name), content, 'utf8');
};

describe('loadConfig', () => {
  it('treats a missing file as the normal case', () => {
    const loaded = loadConfig(dir);

    expect(loaded.config).toEqual({});
    expect(loaded.path).toBeNull();
    expect(loaded.warnings).toEqual([]);
  });

  it('reads the settings a project repeats', () => {
    write('{"project":".","routes":["/","/contact"],"minScore":80}');

    expect(loadConfig(dir).config).toEqual({
      project: '.',
      routes: ['/', '/contact'],
      minScore: 80,
    });
  });

  it('warns about a key it does not know instead of ignoring it silently', () => {
    // A mistyped key quietly dropped is how someone spends an afternoon
    // wondering why their setting does nothing.
    write('{"projet":"."}');
    const loaded = loadConfig(dir);

    expect(loaded.config).toEqual({});
    expect(loaded.warnings[0]).toContain('projet');
  });

  it('warns about a value of the wrong shape', () => {
    write('{"minScore":"quatre-vingts","routes":"/"}');
    const loaded = loadConfig(dir);

    expect(loaded.config).toEqual({});
    expect(loaded.warnings).toHaveLength(2);
  });

  it('refuses a score outside 0..100', () => {
    write('{"minScore":140}');
    expect(loadConfig(dir).warnings[0]).toContain('minScore');
  });

  it('accepts the conventional comment keys', () => {
    write('{"$schema":"...","//":"une note","project":"."}');
    const loaded = loadConfig(dir);

    expect(loaded.config).toEqual({ project: '.' });
    expect(loaded.warnings).toEqual([]);
  });

  it('refuses to run on a file it cannot parse', () => {
    // Unlike a missing file, a broken one is a mistake its author wants to hear
    // about rather than have quietly ignored.
    write('{ not json');
    expect(() => loadConfig(dir)).toThrow(/JSON valide/);
  });

  it('refuses anything that is not an object', () => {
    write('["a"]');
    expect(() => loadConfig(dir)).toThrow(/objet JSON/);
  });

  it('reads a file named explicitly, and says so when it is absent', () => {
    write('{"project":"ailleurs"}', 'autre.json');

    expect(loadConfig(dir, 'autre.json').config.project).toBe('ailleurs');
    expect(() => loadConfig(dir, 'absent.json')).toThrow(/introuvable/);
  });
});

describe('pick', () => {
  it('lets a flag win over the file, and the file over the default', () => {
    expect(pick(true, false, false)).toBe(true);
    expect(pick(undefined, true, false)).toBe(true);
    expect(pick(undefined, undefined, false)).toBe(false);
  });

  it('honours an explicit false from a flag', () => {
    // The reason no parser default may exist: with one, `false` and "absent"
    // are indistinguishable and the file could never be overridden downwards.
    expect(pick(false, true, true)).toBe(false);
  });
});
