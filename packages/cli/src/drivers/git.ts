import { runCommand } from './run-command.js';

/**
 * Refuse to touch files whose current contents git could not give back.
 *
 * Checked per file rather than per tree. A scan is run in the middle of working,
 * when the tree is dirty by definition, and a guard that trips on an unrelated
 * file is one a developer disables once and never re-enables — leaving them
 * unprotected for the case that actually matters.
 */
export async function assertRecoverable(
  projectRoot: string,
  files: readonly string[],
  force: boolean,
  reason: string,
  /** Wording, so this guard names no language of its own. */
  wording: { dirty: (count: number) => string; how: string },
): Promise<void> {
  if (force || files.length === 0) return;

  let dirty: string[];
  try {
    const { stdout } = await runCommand(
      'git',
      ['status', '--porcelain', '--', ...files],
      projectRoot,
    );

    dirty = stdout.split('\n').filter((line) => {
      // Porcelain v1 puts the index status in column 1 and the working tree
      // status in column 2, so the line must not be trimmed first: doing that
      // makes a staged-and-clean "M " indistinguishable from an unstaged " M".
      if (line.length < 4) return false;

      const index = line[0];
      const worktree = line[1];

      // Untracked: nothing in git to compare against, and refusing here would
      // make the tool unusable on a fresh checkout or a project without commits.
      if (index === '?') return false;

      // Only the working tree copy can be lost. When it matches the index, the
      // content is already stored and `git checkout --` brings it back, so a
      // staged change is not a reason to refuse.
      return worktree !== ' ';
    });
  } catch {
    // Not a git repository, or git is unavailable: nothing to check against.
    return;
  }

  if (dirty.length > 0) {
    throw new Error(
      `${wording.dirty(dirty.length)}\n` +
        // Trimmed only for display; the status columns were needed above.
        dirty.map((line) => `  ${line.trim()}`).join('\n') +
        `\n\n${reason} ${wording.how}`,
    );
  }
}
