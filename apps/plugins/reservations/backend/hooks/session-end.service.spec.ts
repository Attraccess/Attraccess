import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { Part2, createPart2 } from '../testing/part2.test-utils';
import { READER_UI_LIMITS, type SessionEndContext } from '@attraccess/plugins-backend-sdk';

describe('SessionEndService', () => {
  let h: Harness;
  let p: Part2;

  const ctx = (userId: number, patch: Partial<SessionEndContext> = {}): SessionEndContext => ({
    resourceId: 1,
    userId,
    sessionId: 7,
    origin: 'web',
    language: 'en',
    now: h.clock(),
    ...patch,
  });

  beforeEach(async () => {
    h = await createHarness();
    p = createPart2(h);
    await h.enable(1);
    await h.settings.warmUp();
    await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow('2026-06-01T12:30:00Z');
  });
  afterEach(() => h.close());

  const reservation = () => h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ userId: 10 });

  it('offers keep/free with default keep to the holder during their own booking', async () => {
    const result = await p.sessionEnd.evaluate(ctx(10));
    expect(result).toMatchObject({
      decision: 'choose',
      choice: {
        title: 'Keep your booking?',
        body: 'Your booking runs until 16:00. Keep it or free the rest?',
        choices: [
          { id: 'keep', label: 'Keep' },
          { id: 'free', label: 'Free rest' },
        ],
        defaultOnTimeout: 'keep',
      },
    });
  });

  it('uses a step key the host accepts', async () => {
    const result = await p.sessionEnd.evaluate(ctx(10));
    if (result.decision !== 'choose') throw new Error('expected a choice');
    expect(result.choice.stepKey).toMatch(READER_UI_LIMITS.idPattern);
  });

  it('answers nothing for other users, outside the booking and for disabled resources', async () => {
    expect(await p.sessionEnd.evaluate(ctx(11))).toEqual({ decision: 'none' });
    expect(await p.sessionEnd.evaluate(ctx(10, { resourceId: 2 }))).toEqual({ decision: 'none' });
    h.setNow('2026-06-01T11:00:00Z');
    expect(await p.sessionEnd.evaluate(ctx(10))).toEqual({ decision: 'none' });
  });

  it('"free" ends the booking early and frees the slot', async () => {
    const result = await p.sessionEnd.evaluate(ctx(10));
    if (result.decision !== 'choose') throw new Error('expected a choice');
    await result.choice.onAnswer('free');
    expect(await reservation()).toMatchObject({ status: 'completed', endedEarlyAt: expect.any(Date) });
  });

  it('"keep" marks the booking as kept and leaves it running', async () => {
    const result = await p.sessionEnd.evaluate(ctx(10));
    if (result.decision !== 'choose') throw new Error('expected a choice');
    await result.choice.onAnswer('keep');
    expect(await reservation()).toMatchObject({ status: 'confirmed', keptAt: expect.any(Date) });
  });

  it('survives an answer for a booking that ended in the meantime', async () => {
    const result = await p.sessionEnd.evaluate(ctx(10));
    if (result.decision !== 'choose') throw new Error('expected a choice');
    h.setNow('2026-06-01T15:00:00Z');
    await expect(result.choice.onAnswer('free')).resolves.toBeUndefined();
  });

  it('keeps the pending web question after the default keep, but a reader answer is final', async () => {
    p.decisions.record(10, 1, 1, h.clock().getTime());
    const web = await p.sessionEnd.evaluate(ctx(10, { origin: 'web' }));
    if (web.decision !== 'choose') throw new Error('expected a choice');
    await web.choice.onAnswer('keep');
    expect(p.decisions.get(10, 1, h.clock().getTime())).toBe(1);

    const reader = await p.sessionEnd.evaluate(ctx(10, { origin: 'reader' }));
    if (reader.decision !== 'choose') throw new Error('expected a choice');
    await reader.choice.onAnswer('keep');
    expect(p.decisions.get(10, 1, h.clock().getTime())).toBeNull();
    p.decisions.record(10, 1, 1, h.clock().getTime()); // a late SESSION_ENDED event
    expect(p.decisions.get(10, 1, h.clock().getTime())).toBeNull();
  });
});
