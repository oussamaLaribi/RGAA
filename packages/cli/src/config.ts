import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Lang, Messages } from './i18n.js';

/** Looked for in the working directory unless `--config` names another file. */
export const CONFIG_FILENAME = 'rgaa.config.json';

/**
 * Everything a project can settle once instead of retyping.
 *
 * JSON rather than JavaScript: a configuration file that executes code is a
 * file a CI runner executes, and nothing here needs that power.
 */
export interface Config {
  project?: string;
  routes?: string[];
  minScore?: number;
  json?: string;
  html?: string;
  grid?: string;
  baseline?: string;
  browser?: string;
  lang?: Lang;
  fail?: boolean;
  verbose?: boolean;
  violationsOnly?: boolean;
  reuseBuild?: boolean;
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the file that was read, or null when there was none. */
  path: string | null;
  /**
   * Problems that do not justify refusing to run.
   *
   * Reported rather than swallowed: a mistyped key silently ignored is how
   * someone spends an afternoon wondering why their setting does nothing.
   */
  warnings: string[];
}

type Validator = (value: unknown) => boolean;

const isString: Validator = (v) => typeof v === 'string';
const isBoolean: Validator = (v) => typeof v === 'boolean';

const SHAPE: Record<keyof Config, Validator> = {
  project: isString,
  routes: (v) => Array.isArray(v) && v.every(isString),
  minScore: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100,
  json: isString,
  html: isString,
  grid: isString,
  baseline: isString,
  browser: isString,
  lang: (v) => v === 'fr' || v === 'en',
  fail: isBoolean,
  verbose: isBoolean,
  violationsOnly: isBoolean,
  reuseBuild: isBoolean,
};

/**
 * Read and validate a configuration file.
 *
 * Never throws for a missing file: not having one is the normal case. A file
 * that exists but cannot be parsed does throw, because that is a mistake the
 * author wants to hear about rather than have quietly ignored.
 */
export function loadConfig(cwd: string, t: Messages, explicitPath?: string): LoadedConfig {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath)
    : resolve(cwd, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    if (explicitPath) throw new Error(t.configMissing(path));
    return { config: {}, path: null, warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(t.configNotJson(path, (error as Error).message));
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t.configNotObject(path));
  }

  const config: Config = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    // A comment key is a common convention in JSON config; it is not a mistake.
    if (key.startsWith('$') || key === '//') continue;

    const validate = SHAPE[key as keyof Config];
    if (!validate) {
      warnings.push(t.configUnknownKey(key));
      continue;
    }
    if (!validate(value)) {
      warnings.push(t.configBadValue(key));
      continue;
    }
    (config as Record<string, unknown>)[key] = value;
  }

  return { config, path, warnings };
}

/**
 * A flag wins over the file; the file wins over the built-in default.
 *
 * The flag has to be `undefined` when absent for this to work, which is why the
 * parser declares no defaults of its own — with `default: false` there is no way
 * to tell "not passed" from "passed as false", and the file could never be
 * overridden in one direction.
 */
export function pick<T>(flag: T | undefined, fromFile: T | undefined, fallback: T): T {
  return flag ?? fromFile ?? fallback;
}
