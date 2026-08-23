import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

/**
 * Locate a package's executable script inside the target project.
 *
 * Deliberately avoids `npx` and the platform shims around it. On Windows those
 * shims are `.cmd` files, which Node 24 refuses to spawn without a shell, and
 * `shell: true` is worse than the problem: it concatenates arguments into a
 * command line without escaping them, which is why Node deprecated it (DEP0190).
 *
 * Running the script with `process.execPath` sidesteps both, and has the further
 * benefit of using the version of the tool the project itself depends on rather
 * than whatever `npx` decides to fetch.
 */
export function resolveProjectBin(
  projectRoot: string,
  specifier: string,
  /** Wording, so this resolver names no language of its own. */
  notFound?: (name: string, path: string) => string,
): string {
  const fromProject = createRequire(join(projectRoot, 'package.json'));

  try {
    return fromProject.resolve(specifier);
  } catch {
    throw new Error(
      notFound?.(specifier, projectRoot) ??
        `could not find ${specifier} in ${projectRoot}. Are the project's dependencies installed?`,
    );
  }
}

export interface RunOptions {
  /**
   * Echo the child's output as it arrives, on top of collecting it.
   *
   * The build is the longest step by far and says plenty while it works; being
   * able to watch it is the difference between diagnosing a slow project and
   * guessing at one.
   */
  onOutput?: (chunk: string) => void;
}

/** Run a Node script with the current Node binary, arguments passed as an array. */
export async function runNodeScript(
  scriptPath: string,
  args: readonly string[],
  cwd: string,
  options: RunOptions = {},
): Promise<CommandResult> {
  if (!options.onOutput) return runCommand(process.execPath, [scriptPath, ...args], cwd);

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd, windowsHide: true });

    let stdout = '';
    let stderr = '';

    const collect = (target: 'out' | 'err') => (data: Buffer): void => {
      const text = data.toString();
      if (target === 'out') stdout += text;
      else stderr += text;
      options.onOutput?.(text);
    };

    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        // Same shape as execFile's rejection, so the caller's error handling
        // does not have to know which path was taken.
        reject(Object.assign(new Error(`exited with code ${code}`), { stdout, stderr }));
      }
    });
  });
}

export async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return execFileAsync(command, [...args], {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}
