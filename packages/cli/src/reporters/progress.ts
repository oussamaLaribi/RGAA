const ESC = String.fromCharCode(27);
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Live feedback for the long steps.
 *
 * Building someone's project takes twenty seconds on a small app and minutes on
 * a large one. Printing "building" and then nothing reads as a hang, and a tool
 * that looks hung gets killed before it finishes — so the elapsed time has to
 * keep moving even when there is nothing new to say.
 */
export interface Progress {
  /** Close the running step and open a new one. */
  step(message: string): void;
  /** A line that scrolls past without becoming the running step. */
  note(message: string): void;
  /** Close the last step. Safe to call twice. */
  done(): void;
}

interface Options {
  /** Set for CI and pipes: plain lines, no timer, no cursor tricks. */
  plain?: boolean;
}

/**
 * Progress goes to stderr so stdout stays a clean, pipeable report.
 */
export function createProgress(
  stream: NodeJS.WriteStream,
  options: Options = {},
): Progress {
  const plain = options.plain ?? !stream.isTTY;

  let current: string | null = null;
  let startedAt = 0;
  let frame = 0;
  let timer: NodeJS.Timeout | null = null;

  const elapsed = (): string => `${Math.round((Date.now() - startedAt) / 1000)}s`;

  const clearLine = (): void => {
    if (!plain) stream.write(`\r${ESC}[2K`);
  };

  const render = (): void => {
    if (plain || current === null) return;
    frame = (frame + 1) % FRAMES.length;
    clearLine();
    stream.write(`${FRAMES[frame]} ${current} ${ESC}[2m${elapsed()}${ESC}[0m`);
  };

  const closeCurrent = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (current === null) return;

    // Plain mode already announced the step when it started; all that is left
    // to add is how long it took.
    if (plain) stream.write(`  ${current} — ${elapsed()}\n`);
    else {
      clearLine();
      // Keep the finished step and its duration: on a slow project, knowing the
      // build took ninety seconds is the answer to "why is this slow".
      stream.write(`${ESC}[32m✔${ESC}[0m ${current} ${ESC}[2m${elapsed()}${ESC}[0m\n`);
    }
    current = null;
  };

  return {
    step(message: string): void {
      closeCurrent();
      current = message;
      startedAt = Date.now();
      frame = 0;

      // Announced on start, not on completion: a CI log that only names a step
      // once it is over cannot tell you what a hung job was doing.
      if (plain) stream.write(`${message}…\n`);
      else {
        render();
        timer = setInterval(render, 120);
        // Never hold the process open just to animate a spinner.
        timer.unref?.();
      }
    },
    note(message: string): void {
      clearLine();
      stream.write(`${message}\n`);
      render();
    },
    done(): void {
      closeCurrent();
    },
  };
}
