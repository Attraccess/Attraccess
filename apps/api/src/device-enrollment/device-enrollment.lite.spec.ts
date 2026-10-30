import { NotFoundException } from '@nestjs/common';
import { TooManyAuthAttemptsException } from '../users-and-auth/rate-limiting/exceptions';
import { DeviceEnrollmentService, EnrollmentConnection } from './device-enrollment.service';
import { LED_PATTERN_COUNT, LedPattern, canonicalLedPattern, isValidLedPattern } from './led-pattern';

const principal = { userId: 1, authenticationMethod: 'session' as const };

let nextAddress = 1;

function makeLite(id: string, overrides: Partial<EnrollmentConnection> = {}) {
  const sent: { code: string; pattern?: LedPattern | null }[] = [];
  const deliver = jest.fn().mockResolvedValue(true);
  const rollback = jest.fn().mockResolvedValue(undefined);
  const connection: EnrollmentConnection = {
    id,
    address: `10.0.0.${nextAddress++}`,
    hasScreen: false,
    firmware: { name: 'Attractap', variant: 'attractap-lite-ethernet', version: '1.8.1' },
    sendCode: (code, _r, _e, pattern) => sent.push({ code, pattern }),
    sendRejected: jest.fn(),
    provision: jest.fn().mockResolvedValue({ kind: 'reader', id: 7, name: 'Lite', deliver, rollback }),
    close: jest.fn(),
    ...overrides,
  };
  return { connection, sent, deliver, rollback, last: () => sent[sent.length - 1] };
}

describe('DeviceEnrollmentService (readers without a screen)', () => {
  let audit: { recordAttractap: jest.Mock };
  let service: DeviceEnrollmentService;

  beforeEach(() => {
    jest.useFakeTimers();
    audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
    service = new DeviceEnrollmentService(audit as never);
  });

  afterEach(() => {
    service.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('sends a valid pattern with the code, and none to readers with a screen', () => {
    const lite = makeLite('lite');
    const screen = makeLite('screen', { hasScreen: true });
    const legacy = makeLite('legacy', { hasScreen: undefined });
    service.request(lite.connection);
    service.request(screen.connection);
    service.request(legacy.connection);

    expect(lite.last().code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(isValidLedPattern(lite.last().pattern)).toBe(true);
    expect(screen.last().pattern).toBeUndefined();
    expect(legacy.last().pattern).toBeUndefined();
    expect(service.listLitePending().map((entry) => entry.clientAddress)).toEqual([lite.connection.address]);
  });

  it('never shows two waiting readers the same pattern, even rotated or mirrored', () => {
    const readers = Array.from({ length: 40 }, (_, i) => makeLite(`reader-${i}`));
    readers.forEach((reader) => service.request(reader.connection));
    const keys = readers.map((reader) => canonicalLedPattern(reader.last().pattern as LedPattern));
    expect(new Set(keys).size).toBe(readers.length);

    jest.advanceTimersByTime(30_000);
    const current = readers.map((reader) => canonicalLedPattern(reader.last().pattern as LedPattern));
    const previous = keys;
    expect(new Set([...current, ...previous]).size).toBe(readers.length * 2);
  });

  it('rotates the pattern with the code and keeps the previous one valid until the next rotation', async () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    const first = lite.last();
    jest.advanceTimersByTime(30_000);
    const second = lite.last();
    expect(second.code).not.toBe(first.code);
    expect(canonicalLedPattern(second.pattern as LedPattern)).not.toBe(
      canonicalLedPattern(first.pattern as LedPattern),
    );

    const { pendingId } = service.listLitePending()[0];
    jest.advanceTimersByTime(30_000);
    // two rotations later the first pattern is gone
    await expect(service.approveLite(pendingId, first.pattern as LedPattern, principal)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(lite.connection.provision).not.toHaveBeenCalled();
  });

  it('accepts the previous pattern right after a rotation', async () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    const first = lite.last().pattern as LedPattern;
    const { pendingId } = service.listLitePending()[0];
    jest.advanceTimersByTime(30_000);

    await expect(service.approveLite(pendingId, first, principal, { name: 'Bench' })).resolves.toEqual({
      kind: 'reader',
      id: 7,
      name: 'Lite',
    });
    expect(lite.connection.provision).toHaveBeenCalledWith({ name: 'Bench' });
    expect(lite.deliver).toHaveBeenCalledTimes(1);
    expect(service.pendingCount).toBe(0);
    expect(service.listLitePending()).toEqual([]);
  });

  it('sends null once all patterns are taken and keeps the reader out of the list', () => {
    const readers = Array.from({ length: LED_PATTERN_COUNT + 1 }, (_, i) => makeLite(`r-${i}`));
    readers.forEach((reader) => service.request(reader.connection));

    expect(readers.slice(0, LED_PATTERN_COUNT).every((reader) => reader.last().pattern)).toBe(true);
    const last = readers[LED_PATTERN_COUNT];
    expect(last.last()).toEqual({ code: expect.any(String), pattern: null });
    expect(service.listLitePending()).toHaveLength(LED_PATTERN_COUNT);
  });

  it('answers unknown, non-Lite and wrong patterns identically and counts them as failures', async () => {
    const lite = makeLite('lite');
    const screen = makeLite('screen', { hasScreen: true });
    service.request(lite.connection);
    service.request(screen.connection);
    const { pendingId } = service.listLitePending()[0];
    const shown = lite.last().pattern as LedPattern;
    const wrong: LedPattern = shown[0] === 'red' ? ['blue', 'red', 'blue', 'red'] : ['red', 'blue', 'red', 'blue'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenPendingId: string = (service as any).pending.get('screen').pendingId;

    const failures = await Promise.all(
      [
        service.approveLite('00000000-0000-4000-8000-000000000000', shown, principal),
        service.approveLite(screenPendingId, shown, principal),
        service.approveLite(pendingId, wrong, principal),
        service.approveLite(pendingId, ['red', 'red', 'red', 'red'], principal),
        service.approveLite(pendingId, [...shown].reverse(), principal),
      ].map((promise) => promise.catch((error) => error)),
    );
    for (const error of failures) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('EnrollmentCodeNotFound');
    }
    expect(lite.connection.provision).not.toHaveBeenCalled();
    expect(screen.connection.provision).not.toHaveBeenCalled();

    // the five failures used up the approver's budget, even the right pattern is refused now
    await expect(service.approveLite(pendingId, shown, principal)).rejects.toBeInstanceOf(TooManyAuthAttemptsException);
  });

  it('lists each waiting Lite reader with its countdown, firmware and waiting time, oldest first', () => {
    jest.setSystemTime(new Date('2026-10-30T10:00:00.000Z'));
    const first = makeLite('first');
    const second = makeLite('second', { firmware: undefined });
    service.request(first.connection);
    jest.advanceTimersByTime(5_000);
    service.request(second.connection);
    jest.advanceTimersByTime(7_000);

    const [a, b] = service.listLitePending();
    expect(a).toEqual({
      pendingId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      pattern: first.last().pattern,
      rotatesInSeconds: 18,
      firmware: { name: 'Attractap', variant: 'attractap-lite-ethernet', version: '1.8.1' },
      waitingSince: '2026-10-30T10:00:00.000Z',
      clientAddress: first.connection.address,
    });
    expect(b).toMatchObject({ rotatesInSeconds: 23, firmware: null, waitingSince: '2026-10-30T10:00:05.000Z' });
    expect(a.pendingId).not.toBe(b.pendingId);
    expect(a.pendingId).not.toBe('first');
  });

  it('frees the patterns of rotated readers, so nobody runs out over time', () => {
    const readers = Array.from({ length: 50 }, (_, i) => makeLite(`reader-${i}`));
    readers.forEach((reader) => service.request(reader.connection));
    for (let rotation = 0; rotation < 4; rotation++) {
      jest.advanceTimersByTime(30_000);
      const current = readers.map((reader) => reader.last().pattern);
      expect(current.every(Boolean)).toBe(true);
      expect(new Set(current.map((pattern) => canonicalLedPattern(pattern as LedPattern))).size).toBe(50);
    }
  });

  it('never gives a reader the pattern it showed two rotations ago', () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    for (let rotation = 0; rotation < 20; rotation++) {
      jest.advanceTimersByTime(30_000);
      if (lite.sent.length >= 3) {
        const [twoBack, , current] = lite.sent.slice(-3);
        expect(canonicalLedPattern(current.pattern as LedPattern)).not.toBe(
          canonicalLedPattern(twoBack.pattern as LedPattern),
        );
      }
    }
  });

  it('limits wrong attempts per approver, shared with wrong codes', async () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    const { pendingId, pattern } = service.listLitePending()[0];

    for (let i = 0; i < 3; i++) {
      await expect(
        service.approveLite('00000000-0000-4000-8000-000000000000', pattern, principal),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    for (let i = 0; i < 2; i++) {
      await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(service.approveLite(pendingId, pattern, principal)).rejects.toBeInstanceOf(
      TooManyAuthAttemptsException,
    );
    // another approver is not affected
    await expect(service.approveLite(pendingId, pattern, { ...principal, userId: 2 })).resolves.toMatchObject({
      id: 7,
    });
  });

  it('removes the reader again and closes the connection when delivery fails', async () => {
    const lite = makeLite('lite');
    lite.deliver.mockResolvedValue(false);
    service.request(lite.connection);
    const { pendingId, pattern } = service.listLitePending()[0];

    await expect(service.approveLite(pendingId, pattern, principal)).rejects.toMatchObject({
      message: 'EnrollmentDeliveryFailed',
    });
    expect(lite.rollback).toHaveBeenCalledTimes(1);
    expect(lite.connection.close).toHaveBeenCalled();
    expect(audit.recordAttractap).not.toHaveBeenCalled();
  });

  it('audits the approval with the led-pattern method', async () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    const { pendingId, pattern } = service.listLitePending()[0];
    await service.approveLite(pendingId, pattern, { userId: 4, authenticationMethod: 'api-token', apiTokenId: 9 });

    expect(audit.recordAttractap).toHaveBeenCalledWith({
      action: 'reader.enrolled',
      actorId: 4,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 7,
      details: { source: 'reader-enrollment', method: 'led-pattern' },
    });
  });

  it('keeps the patterns of a reader that left reserved while its ring may still show them', () => {
    const gone = makeLite('gone');
    service.request(gone.connection);
    const key = canonicalLedPattern(gone.last().pattern as LedPattern);
    service.release('gone');
    expect(service.listLitePending()).toEqual([]);

    const readers = Array.from({ length: LED_PATTERN_COUNT }, (_, i) => makeLite(`r-${i}`));
    readers.forEach((reader) => service.request(reader.connection));
    const patterns = readers.map((reader) => reader.last().pattern);
    expect(patterns.slice(0, LED_PATTERN_COUNT - 1).every(Boolean)).toBe(true);
    expect(patterns.filter(Boolean).map((pattern) => canonicalLedPattern(pattern as LedPattern))).not.toContain(key);
    expect(patterns[LED_PATTERN_COUNT - 1]).toBeNull();
  });

  it('hands the patterns of a reader that left out again after the cool-down', () => {
    const gone = makeLite('gone');
    service.request(gone.connection);
    service.release('gone');
    jest.advanceTimersByTime(40_000);

    const readers = Array.from({ length: LED_PATTERN_COUNT }, (_, i) => makeLite(`r-${i}`));
    readers.forEach((reader) => service.request(reader.connection));
    expect(readers.every((reader) => reader.last().pattern)).toBe(true);
  });

  it('frees the patterns when a Lite reader is approved by its code instead', async () => {
    const lite = makeLite('lite');
    service.request(lite.connection);
    await service.approve(lite.last().code, principal);
    jest.advanceTimersByTime(40_000);

    const readers = Array.from({ length: LED_PATTERN_COUNT }, (_, i) => makeLite(`r-${i}`));
    readers.forEach((reader) => service.request(reader.connection));
    expect(readers.every((reader) => reader.last().pattern)).toBe(true);
  });
});
