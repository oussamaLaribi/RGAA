import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { injectSourceAttributes } from './inject-source.js';

export interface InstrumentedFile {
  /** Absolute path on disk. */
  path: string;
  /** Path recorded in the attribute, relative to the project root. */
  relativePath: string;
  injected: number;
}

export interface InstrumentationSession {
  files: InstrumentedFile[];
  /** Files that could not be parsed, with their errors. Left untouched. */
  skipped: { path: string; errors: string[] }[];
  /** Files put back from a previous run that was killed before it could finish. */
  recovered: string[];
  /**
   * Puts every rewritten file back exactly as it was.
   *
   * Always call this from a `finally`. Templates are rewritten in place, so an
   * interrupted run that skips restore leaves the developer's working tree
   * modified — the single worst thing this tool could do to someone.
   */
  restore(): Promise<void>;
}

/**
 * Where originals are parked while their instrumented copies are on disk.
 *
 * Inside `node_modules` so it is already ignored by every project's VCS and
 * cannot end up in a commit or a diff.
 */
function backupDirectory(projectRoot: string): string {
  return join(projectRoot, 'node_modules', '.cache', 'rgaa-restore');
}

interface BackupEntry {
  path: string;
  backup: string;
}

/**
 * Put back anything a previous run left rewritten.
 *
 * The originals are parked on disk rather than held only in memory precisely so
 * that a process killed mid-run is recoverable. Without this the tool would have
 * to refuse to run whenever a template had uncommitted changes — and a scan is
 * run in the middle of working, so that guard would fire constantly and be
 * turned off, leaving nobody protected.
 */
async function recoverPreviousRun(directory: string): Promise<string[]> {
  let manifest: BackupEntry[];
  try {
    manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as BackupEntry[];
  } catch {
    return [];
  }

  const recovered: string[] = [];
  for (const entry of manifest) {
    try {
      await writeFile(entry.path, await readFile(entry.backup, 'utf8'), 'utf8');
      recovered.push(entry.path);
    } catch {
      // The template or its backup is gone; nothing to put back.
    }
  }

  await rm(directory, { recursive: true, force: true });
  return recovered;
}

/**
 * Rewrite templates in place so every element carries its source location.
 *
 * Paths are recorded relative to `projectRoot` so that a location means the same
 * thing on a developer's machine and in CI, where the checkout lives elsewhere.
 */
export async function instrumentTemplates(
  templatePaths: readonly string[],
  projectRoot: string,
): Promise<InstrumentationSession> {
  const root = resolve(projectRoot);
  const directory = backupDirectory(root);

  const recovered = await recoverPreviousRun(directory);

  const backups: BackupEntry[] = [];
  const files: InstrumentedFile[] = [];
  const skipped: { path: string; errors: string[] }[] = [];

  const restore = async (): Promise<void> => {
    await Promise.all(
      backups.map(async (entry) => {
        await writeFile(entry.path, await readFile(entry.backup, 'utf8'), 'utf8');
      }),
    );
    backups.length = 0;
    await rm(directory, { recursive: true, force: true });
  };

  try {
    await mkdir(directory, { recursive: true });

    for (const templatePath of templatePaths) {
      const path = resolve(templatePath);
      const source = await readFile(path, 'utf8');
      const relativePath = relative(root, path).split('\\').join('/');

      const result = injectSourceAttributes(source, relativePath);
      if (result.errors.length > 0) {
        // A template we cannot parse is one the Angular build would reject too.
        // Leave it alone and report it rather than failing the whole run.
        skipped.push({ path, errors: result.errors });
        continue;
      }
      if (result.injected === 0) continue;

      // Park the original before the rewrite, and record it before writing, so
      // the manifest never describes less than what is actually modified.
      const backup = join(directory, `${createHash('sha256').update(path).digest('hex')}.bak`);
      await writeFile(backup, source, 'utf8');
      backups.push({ path, backup });
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(backups), 'utf8');

      await writeFile(path, result.code, 'utf8');
      files.push({ path, relativePath, injected: result.injected });
    }
  } catch (error) {
    // Never leave a partially rewritten tree behind.
    await restore();
    throw error;
  }

  return { files, skipped, recovered, restore };
}

/** True when a previous run left templates rewritten on disk. */
export async function hasPendingRestore(projectRoot: string): Promise<boolean> {
  try {
    const entries = await readdir(backupDirectory(resolve(projectRoot)));
    return entries.includes('manifest.json');
  } catch {
    return false;
  }
}
