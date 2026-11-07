import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';
import { READER_UI_CAPABILITIES_NONE, READER_UI_LIMITS, type SessionEndContext } from '@attraccess/plugins-backend-sdk';

describe('SessionEndService', () => {
  let h: Harness;
  let p: BackgroundServices;

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
    p = createBackgroundServices(h);
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

  describe('stopping on a reader', () => {
    it('asks keep/free with the 15 s default keep, within the host limits', async () => {
      const result = await p.sessionEnd.evaluate(ctx(10, { origin: 'reader', language: 'de' }));
      if (result.decision !== 'choose') throw new Error('expected a choice');
      expect(result.choice).toMatchObject({
        title: 'Reservierung behalten?',
        defaultOnTimeout: 'keep',
        expiresInSec: 15,
        choices: [
          { id: 'keep', label: 'Behalten' },
          { id: 'free', label: 'Rest freigeben' },
        ],
      });
      expect(result.choice.expiresInSec).toBeLessThanOrEqual(30);
      for (const choice of result.choice.choices) expect(choice.label.length).toBeLessThanOrEqual(31);
    });

    it('"free" ends the booking early and refreshes the reader slots', async () => {
      const result = await p.sessionEnd.evaluate(ctx(10, { origin: 'reader' }));
      if (result.decision !== 'choose') throw new Error('expected a choice');
      h.invalidateReaderUi.mockClear();
      await result.choice.onAnswer('free');
      expect(await reservation()).toMatchObject({ status: 'completed', endedEarlyAt: expect.any(Date) });
      expect(h.invalidateReaderUi).toHaveBeenCalledWith({ resourceId: 1 });
      expect(
        await p.readerUi.getSlotContributions({
          readerId: 1,
          resourceId: 1,
          capabilities: READER_UI_CAPABILITIES_NONE,
          language: 'en',
        }),
      ).toEqual([]);
    });

    it('the default "keep" leaves the booking running', async () => {
      const result = await p.sessionEnd.evaluate(ctx(10, { origin: 'reader' }));
      if (result.decision !== 'choose') throw new Error('expected a choice');
      h.invalidateReaderUi.mockClear();
      await result.choice.onAnswer(result.choice.defaultOnTimeout);
      expect(await reservation()).toMatchObject({ status: 'confirmed', keptAt: expect.any(Date) });
      expect(h.invalidateReaderUi).toHaveBeenCalledWith({ resourceId: 1 });
    });

    it('offers nothing to a user without a running booking of their own', async () => {
      expect(await p.sessionEnd.evaluate(ctx(11, { origin: 'reader' }))).toEqual({ decision: 'none' });
    });
  });
});
