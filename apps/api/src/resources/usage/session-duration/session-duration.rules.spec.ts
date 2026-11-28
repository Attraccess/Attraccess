import { ResourceType } from '@attraccess/application-models';
import {
  addMinutes,
  autoEndReason,
  computeExtension,
  computeStartDeadline,
  extensionCap,
  initialWarnedOffset,
  normalizeSessionDurationSettings,
  sessionDurationSettingsProblem,
  validReaderEstimate,
} from './session-duration.rules';
import { SessionDurationErrorCode } from './session-duration.errors';

const start = new Date('2030-01-01T10:00:00Z');
const machine = (settings: Record<string, unknown> = {}) => ({ type: ResourceType.Machine, ...settings });
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
};

describe('computeStartDeadline', () => {
  it('leaves a session without limits alone', () => {
    expect(computeStartDeadline(machine(), start, undefined, true)).toEqual({
      autoEndAt: null,
      maxAutoEndAt: null,
      estimatedDurationMinutes: null,
      autoEndWarnedOffsetMinutes: null,
    });
  });

  it('ends a max-only session at start + max, which is also its cap', () => {
    const deadline = computeStartDeadline(machine({ maxSessionDurationMinutes: 120 }), start, undefined, true);
    expect(deadline.autoEndAt).toEqual(addMinutes(start, 120));
    expect(deadline.maxAutoEndAt).toEqual(addMinutes(start, 120));
    expect(deadline.estimatedDurationMinutes).toBeNull();
  });

  it('ignores a supplied estimate where none is required, the max still applies', () => {
    const deadline = computeStartDeadline(machine({ maxSessionDurationMinutes: 120 }), start, 30, true);
    expect(deadline.autoEndAt).toEqual(addMinutes(start, 120));
    expect(deadline.estimatedDurationMinutes).toBeNull();
  });

  it('requires an estimate from a client that can ask, and names the maximum', () => {
    expect(
      codeOf(() => computeStartDeadline(machine({ requireSessionDurationEstimate: true }), start, undefined, true)),
    ).toBe(SessionDurationErrorCode.ESTIMATE_REQUIRED);
    try {
      computeStartDeadline(
        machine({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 90 }),
        start,
        undefined,
        true,
      );
      fail('expected a refusal');
    } catch (error) {
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({ maxSessionDurationMinutes: 90 });
    }
  });

  it('treats a null estimate as a missing one, so it cannot lift the limits', () => {
    const both = machine({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 120 });
    expect(codeOf(() => computeStartDeadline(both, start, null, true))).toBe(
      SessionDurationErrorCode.ESTIMATE_REQUIRED,
    );
    expect(computeStartDeadline(both, start, null, false).autoEndAt).toEqual(addMinutes(start, 120));
  });

  it('ends an estimate-only session at start + estimate with no cap', () => {
    const deadline = computeStartDeadline(machine({ requireSessionDurationEstimate: true }), start, 45, true);
    expect(deadline).toMatchObject({
      autoEndAt: addMinutes(start, 45),
      maxAutoEndAt: null,
      estimatedDurationMinutes: 45,
    });
  });

  it('refuses an estimate above the maximum', () => {
    expect(
      codeOf(() =>
        computeStartDeadline(
          machine({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 60 }),
          start,
          61,
          true,
        ),
      ),
    ).toBe(SessionDurationErrorCode.ESTIMATE_EXCEEDS_MAXIMUM);
  });

  it('with both set ends at the estimate and caps at the maximum', () => {
    const deadline = computeStartDeadline(
      machine({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 240 }),
      start,
      60,
      true,
    );
    expect(deadline.autoEndAt).toEqual(addMinutes(start, 60));
    expect(deadline.maxAutoEndAt).toEqual(addMinutes(start, 240));
  });

  describe('a client that cannot ask is never refused', () => {
    const require = { requireSessionDurationEstimate: true };
    it('uses the maximum', () => {
      expect(
        computeStartDeadline(machine({ ...require, maxSessionDurationMinutes: 90 }), start, undefined, false),
      ).toMatchObject({ autoEndAt: addMinutes(start, 90), estimatedDurationMinutes: 90 });
    });
    it('uses the default estimate without a maximum', () => {
      expect(
        computeStartDeadline(
          machine({ ...require, defaultSessionDurationEstimateMinutes: 30 }),
          start,
          undefined,
          false,
        ).autoEndAt,
      ).toEqual(addMinutes(start, 30));
    });
    it('falls back to 60 minutes', () => {
      expect(computeStartDeadline(machine(require), start, undefined, false).autoEndAt).toEqual(addMinutes(start, 60));
    });
  });

  it('ignores every setting of a door', () => {
    expect(
      computeStartDeadline(
        { type: ResourceType.Door, maxSessionDurationMinutes: 10, requireSessionDurationEstimate: true },
        start,
        undefined,
        true,
      ).autoEndAt,
    ).toBeNull();
  });

  it('skips the warnings whose time had passed at the start', () => {
    const at = (minutes: number) =>
      computeStartDeadline(machine({ maxSessionDurationMinutes: minutes }), start, undefined, true)
        .autoEndWarnedOffsetMinutes;
    expect(at(120)).toBeNull();
    expect(at(10)).toBe(15);
    expect(at(3)).toBe(5);
  });
});

describe('initialWarnedOffset', () => {
  it.each([
    [20, null],
    [15, 15],
    [10, 15],
    [5, 5],
    [1, 5],
  ])('a deadline %d minutes away records %p', (minutes, expected) => {
    expect(initialWarnedOffset(minutes)).toBe(expected);
  });
});

describe('computeExtension', () => {
  const now = addMinutes(start, 10);
  const session = (over: Record<string, unknown> = {}) => ({
    startTime: start,
    autoEndAt: addMinutes(start, 60),
    maxAutoEndAt: addMinutes(start, 240),
    ...over,
  });

  it('adds a permitted step to the current deadline', () => {
    expect(computeExtension(session(), { extendByMinutes: 120 }, now)).toEqual(addMinutes(start, 180));
  });

  it('refuses a step past the cap instead of clipping it', () => {
    expect(codeOf(() => computeExtension(session(), { extendByMinutes: 240 }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
    );
  });

  it('allows reaching exactly the cap', () => {
    expect(computeExtension(session({ autoEndAt: addMinutes(start, 180) }), { extendByMinutes: 60 }, now)).toEqual(
      addMinutes(start, 240),
    );
  });

  it('extends to the maximum exactly', () => {
    expect(computeExtension(session(), { toMax: true }, now)).toEqual(addMinutes(start, 240));
  });

  it('refuses toMax without a maximum or room', () => {
    expect(codeOf(() => computeExtension(session({ maxAutoEndAt: null }), { toMax: true }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_NOT_POSSIBLE,
    );
    expect(codeOf(() => computeExtension(session({ autoEndAt: addMinutes(start, 240) }), { toMax: true }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
    );
  });

  it('limits a machine without maximum to 30 days in total', () => {
    const open = session({ maxAutoEndAt: null, autoEndAt: addMinutes(start, 43_200 - 60) });
    expect(computeExtension(open, { extendByMinutes: 60 }, now)).toEqual(addMinutes(start, 43_200));
    expect(codeOf(() => computeExtension(open, { extendByMinutes: 120 }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
    );
  });

  it('counts the 30 days of a continuation from the start of the session that was switched, not of the part', () => {
    const switchedAt = addMinutes(start, 600);
    const continuation = session({
      startTime: switchedAt,
      sessionStartTime: start,
      maxAutoEndAt: null,
      autoEndAt: addMinutes(start, 43_200 - 60),
    });
    expect(extensionCap(continuation)).toEqual(addMinutes(start, 43_200));
    expect(computeExtension(continuation, { extendByMinutes: 60 }, switchedAt)).toEqual(addMinutes(start, 43_200));
    expect(codeOf(() => computeExtension(continuation, { extendByMinutes: 120 }, switchedAt))).toBe(
      SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
    );
    // A record without a chain start (from before switching existed) counts from its own start.
    expect(extensionCap({ startTime: switchedAt, sessionStartTime: null, maxAutoEndAt: null })).toEqual(
      addMinutes(switchedAt, 43_200),
    );
    // A machine maximum is already absolute; the chain start does not move it.
    expect(
      extensionCap({ startTime: switchedAt, sessionStartTime: start, maxAutoEndAt: addMinutes(start, 240) }),
    ).toEqual(addMinutes(start, 240));
  });

  it('refuses a session without deadline, a passed deadline and a step that is not offered', () => {
    expect(codeOf(() => computeExtension(session({ autoEndAt: null }), { extendByMinutes: 60 }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_NOT_POSSIBLE,
    );
    expect(codeOf(() => computeExtension(session({ autoEndAt: start }), { extendByMinutes: 60 }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_NOT_POSSIBLE,
    );
    expect(codeOf(() => computeExtension(session(), { extendByMinutes: 45 }, now))).toBe(
      SessionDurationErrorCode.EXTENSION_INVALID,
    );
    expect(codeOf(() => computeExtension(session(), {}, now))).toBe(SessionDurationErrorCode.EXTENSION_INVALID);
  });
});

describe('autoEndReason', () => {
  it('is the maximum once the deadline reached the cap, otherwise the estimate', () => {
    expect(autoEndReason({ autoEndAt: addMinutes(start, 60), maxAutoEndAt: addMinutes(start, 60) })).toBe('maximum');
    expect(autoEndReason({ autoEndAt: addMinutes(start, 30), maxAutoEndAt: addMinutes(start, 60) })).toBe('estimate');
    expect(autoEndReason({ autoEndAt: addMinutes(start, 30), maxAutoEndAt: null })).toBe('estimate');
  });
});

describe('resource settings', () => {
  it('rejects a default estimate above the maximum', () => {
    expect(
      sessionDurationSettingsProblem(
        machine({ maxSessionDurationMinutes: 30, defaultSessionDurationEstimateMinutes: 60 }),
      ),
    ).toMatch(/default estimate/);
    expect(
      sessionDurationSettingsProblem(
        machine({ maxSessionDurationMinutes: 60, defaultSessionDurationEstimateMinutes: 60 }),
      ),
    ).toBeNull();
  });

  it('clears the settings of a door', () => {
    expect(
      normalizeSessionDurationSettings({
        type: ResourceType.Door,
        maxSessionDurationMinutes: 5,
        requireSessionDurationEstimate: true,
        defaultSessionDurationEstimateMinutes: 5,
      }),
    ).toEqual({
      type: ResourceType.Door,
      maxSessionDurationMinutes: null,
      requireSessionDurationEstimate: false,
      defaultSessionDurationEstimateMinutes: null,
    });
  });
});

describe('validReaderEstimate', () => {
  it.each([[0], [-5], [43_201], [1.5], ['60'], [null], [undefined]])('counts %p as no estimate', (value) => {
    expect(validReaderEstimate(value)).toEqual({});
  });

  it.each([[1], [60], [43_200]])('keeps the whole number %p', (value) => {
    expect(validReaderEstimate(value)).toEqual({ estimatedDurationMinutes: value });
  });
});
