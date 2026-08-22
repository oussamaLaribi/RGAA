import { describe, expect, it, vi } from 'vitest';
import { createProgress } from './progress.js';

function fakeStream(): { written: string[]; stream: NodeJS.WriteStream } {
  const written: string[] = [];
  const stream = {
    isTTY: true,
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  return { written, stream };
}

const text = (written: string[]): string =>
  // Strip the escape sequences; what matters is what a reader ends up seeing.
  written.join('').replace(/\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

describe('plain output, for CI logs and pipes', () => {
  it('announces a step when it starts, not when it ends', () => {
    // A log that only names a step once it is over cannot tell you what a hung
    // job was doing — which is the whole reason someone reads it.
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: true });

    progress.step('building');
    expect(text(written)).toContain('building…');
  });

  it('reports how long each step took', () => {
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: true });

    progress.step('building');
    progress.done();

    expect(text(written)).toMatch(/building — \d+s/);
  });

  it('writes no escape sequences at all', () => {
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: true });

    progress.step('building');
    progress.note('located 3 elements');
    progress.done();

    expect(written.join('')).not.toContain('');
  });
});

describe('interactive output', () => {
  it('keeps redrawing while a step runs', () => {
    // The build takes twenty seconds on a small app and minutes on a large one.
    // Nothing moving on screen reads as a hang, and a tool that looks hung gets
    // killed before it finishes.
    vi.useFakeTimers();
    try {
      const { written, stream } = fakeStream();
      const progress = createProgress(stream, { plain: false });

      progress.step('building');
      const initial = written.length;
      vi.advanceTimersByTime(1000);

      expect(written.length).toBeGreaterThan(initial);
      progress.done();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a finished step and keeps its duration', () => {
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: false });

    progress.step('building');
    progress.done();

    expect(text(written)).toMatch(/✔ building \d+s/);
  });

  it('lets a note scroll past without losing the running step', () => {
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: false });

    progress.step('building');
    progress.note('located 346 elements');

    const rendered = text(written);
    expect(rendered).toContain('located 346 elements');
    // The step is redrawn after the note, so it stays on the last line.
    expect(rendered.lastIndexOf('building')).toBeGreaterThan(
      rendered.indexOf('located 346 elements'),
    );
    progress.done();
  });

  it('survives being finished twice', () => {
    const { written, stream } = fakeStream();
    const progress = createProgress(stream, { plain: false });

    progress.step('building');
    progress.done();
    const after = written.length;
    progress.done();

    expect(written.length).toBe(after);
  });

  it('does nothing when finished without a step', () => {
    const { written, stream } = fakeStream();
    createProgress(stream, { plain: false }).done();

    expect(written).toEqual([]);
  });
});
