import { describe, expect, it } from 'vitest';
import { assertionMessage, renderErrorReason } from './openscad.worker';
import { createSerialQueue } from './serialQueue';
import { NO_OUTPUT_ERROR } from './errors';

describe('createSerialQueue', () => {
  /** A task that reports when it starts and finishes, and only resolves when told to. */
  function controllable(log: string[], name: string) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = async () => {
      log.push(`start:${name}`);
      await gate;
      log.push(`end:${name}`);
    };
    return { task, release };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('runs one task at a time instead of overlapping them', async () => {
    const log: string[] = [];
    const submit = createSerialQueue();
    const first = controllable(log, 'first');
    const second = controllable(log, 'second');

    submit(1, first.task);
    await flush();
    expect(log).toEqual(['start:first']);

    // Submitted while the first is still in flight: it must wait rather than run concurrently.
    submit(2, second.task);
    await flush();
    expect(log).toEqual(['start:first']);

    first.release();
    await flush();
    expect(log).toEqual(['start:first', 'end:first', 'start:second']);

    second.release();
    await flush();
    expect(log).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  it('drops a queued task that was superseded before its turn came', async () => {
    const log: string[] = [];
    const submit = createSerialQueue();
    const running = controllable(log, 'running');
    const superseded = controllable(log, 'superseded');
    const latest = controllable(log, 'latest');

    submit(1, running.task);
    await flush();

    // Two more arrive while id 1 is rendering; only the newest is still worth running.
    submit(2, superseded.task);
    submit(3, latest.task);

    running.release();
    latest.release();
    await flush();

    expect(log).not.toContain('start:superseded');
    expect(log).toEqual(['start:running', 'end:running', 'start:latest', 'end:latest']);
  });

  it('keeps processing later tasks after one rejects', async () => {
    const log: string[] = [];
    const submit = createSerialQueue();

    submit(1, async () => {
      log.push('boom');
      throw new Error('render failed');
    });
    await flush();
    expect(log).toEqual(['boom']);

    submit(2, async () => {
      log.push('after');
    });
    await flush();
    expect(log).toEqual(['boom', 'after']);
  });
});

describe('assertionMessage', () => {
  it('extracts a clean message from a real OpenSCAD assert() failure, despite embedded quotes', () => {
    // Genuine stderr line for a label that doesn't fit: the message (built with `str(...)` in
    // nfc-keychain-card.scad) itself quotes the label, so it contains two embedded, unescaped
    // quote characters in addition to the pair OpenSCAD wraps around the whole message.
    const line =
      'ERROR: Assertion \'(!HAS_LABEL || (LABEL_SIZE >= (LABEL_CAP_MIN / CAP_RATIO)))\' failed: ' +
      '"Label too long: "THIS LABEL IS ... LONG" does not fit in 54 mm at the minimum 3 mm cap height." ' +
      'in file /card.scad, line 69';

    expect(assertionMessage([line])).toBe(
      'Label too long: "THIS LABEL IS ... LONG" does not fit in 54 mm at the minimum 3 mm cap height.'
    );
  });

  it('returns null when no stderr line reports an assertion failure', () => {
    expect(assertionMessage(['ECHO: some unrelated diagnostic'])).toBeNull();
  });
});

describe('renderErrorReason', () => {
  it('surfaces the assert() message as-is when OpenSCAD reports one', () => {
    const line =
      'ERROR: Assertion \'(!HAS_LABEL || (LABEL_SIZE >= (LABEL_CAP_MIN / CAP_RATIO)))\' failed: ' +
      '"Label too long: "X" does not fit in 54 mm at the minimum 3 mm cap height." in file /card.scad, line 69';

    expect(renderErrorReason([line])).toBe(
      'Label too long: "X" does not fit in 54 mm at the minimum 3 mm cap height.'
    );
  });

  it('falls back to a stable, translatable reason code when there is no assert() failure', () => {
    // e.g. a label made entirely of glyphs missing from the vendored font: OpenSCAD writes no
    // /out.stl and stderr has nothing that looks like an assertion.
    const reason = renderErrorReason(['ECHO: some unrelated diagnostic']);
    expect(reason).toBe(NO_OUTPUT_ERROR);
  });

  it('never leaks the internal OpenSCAD part name ("body"/"letters") into the reason', () => {
    // Regression guard: the old message was `OpenSCAD produced no output for part "${part}".` —
    // make sure neither part name can appear regardless of which part failed to render.
    for (const errors of [[], ['ECHO: unrelated']]) {
      const reason = renderErrorReason(errors);
      expect(reason).not.toMatch(/body|letters/);
    }
  });
});
