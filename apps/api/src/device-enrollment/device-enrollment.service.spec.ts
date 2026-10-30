import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { ENROLLMENT_CODE_ROTATION_MS, ENROLLMENT_REQUEST_TTL_MS } from './device-enrollment.constants';
import { DeviceEnrollmentService, EnrollmentConnection } from './device-enrollment.service';
import { EnrollmentRateLimitedException } from './enrollment-rate-limited.exception';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, randomInt: jest.fn((...args: unknown[]) => actual.randomInt(...args)) };
});

/** Makes the next code draws return these alphabet indices, one per character. */
function drawCodes(...indices: number[]) {
  for (const index of indices) {
    for (let i = 0; i < 6; i++) (randomInt as unknown as jest.Mock).mockImplementationOnce(() => index);
  }
}

const principal = { userId: 1, authenticationMethod: 'session' as const };

function plain(code: string) {
  return code.replace('-', '');
}

function makeConnection(id: string, address = '10.0.0.1', overrides: Partial<EnrollmentConnection> = {}) {
  const codes: string[] = [];
  const rejections: string[] = [];
  const retryAfters: number[] = [];
  const rollback = jest.fn().mockResolvedValue(undefined);
  const deliver = jest.fn().mockResolvedValue(true);
  const recordEnrolled = jest.fn().mockResolvedValue(undefined);
  const connection: EnrollmentConnection = {
    id,
    address,
    sendCode: (code) => codes.push(code),
    sendRejected: (reason, retryAfterMs) => {
      rejections.push(reason);
      retryAfters.push(retryAfterMs);
    },
    provision: jest
      .fn()
      .mockResolvedValue({ kind: 'reader', id: 5, name: 'Reader', deliver, rollback, recordEnrolled }),
    close: jest.fn(),
    ...overrides,
  };
  return { connection, codes, rejections, retryAfters, deliver, rollback, recordEnrolled };
}

/** Distinct IPv4 addresses, 10 per /24 so no address limit is hit. */
function spread(i: number) {
  return `10.${Math.floor(i / 10)}.0.${i % 10}`;
}

describe('DeviceEnrollmentService', () => {
  let service: DeviceEnrollmentService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new DeviceEnrollmentService();
  });

  afterEach(() => {
    service.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('creates nothing before approval and provisions exactly once afterwards', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    expect(device.connection.provision).not.toHaveBeenCalled();

    const result = await service.approve(plain(device.codes[0]), principal, { name: 'Door' });

    expect(result).toEqual({ kind: 'reader', id: 5, name: 'Reader' });
    expect(device.connection.provision).toHaveBeenCalledWith({ name: 'Door' });
    expect(device.deliver).toHaveBeenCalledTimes(1);
    await expect(service.approve(plain(device.codes[0]), principal)).rejects.toBeInstanceOf(NotFoundException);
    expect(device.connection.provision).toHaveBeenCalledTimes(1);
    expect(service.pendingCount).toBe(0);
  });

  it('lets the device audit the approval with the approver', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    const approver = { userId: 4, authenticationMethod: 'api-token' as const, apiTokenId: 9 };
    await service.approve(device.codes[0].toLowerCase(), approver);

    expect(device.recordEnrolled).toHaveBeenCalledWith(approver);
  });

  it('still approves when auditing fails', async () => {
    const device = makeConnection('a');
    device.recordEnrolled.mockRejectedValue(new Error('audit store down'));
    service.request(device.connection);

    await expect(service.approve(device.codes[0], principal)).resolves.toEqual({
      kind: 'reader',
      id: 5,
      name: 'Reader',
    });
    expect(device.rollback).not.toHaveBeenCalled();
    expect(device.connection.close).not.toHaveBeenCalled();
  });

  it('removes the record and closes the connection when delivery fails', async () => {
    const device = makeConnection('a');
    device.deliver.mockResolvedValue(false);
    service.request(device.connection);

    await expect(service.approve(device.codes[0], principal)).rejects.toBeInstanceOf(BadGatewayException);

    expect(device.rollback).toHaveBeenCalled();
    expect(device.connection.close).toHaveBeenCalled();
    expect(device.recordEnrolled).not.toHaveBeenCalled();
  });

  it('removes the record and answers 502 when delivery throws', async () => {
    const device = makeConnection('a');
    device.deliver.mockRejectedValue(new Error('socket gone'));
    service.request(device.connection);

    await expect(service.approve(device.codes[0], principal)).rejects.toThrow('EnrollmentDeliveryFailed');

    expect(device.rollback).toHaveBeenCalledTimes(1);
    expect(device.connection.close).toHaveBeenCalled();
    expect(device.recordEnrolled).not.toHaveBeenCalled();
    await expect(service.approve(device.codes[0], principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rotates every 30 s and accepts the previous code only until the next rotation', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    const first = device.codes[0];

    jest.advanceTimersByTime(30_000);
    expect(device.codes).toHaveLength(2);
    expect(device.codes[1]).not.toBe(first);

    jest.advanceTimersByTime(30_000);
    await expect(service.approve(first, principal)).rejects.toBeInstanceOf(NotFoundException);

    const second = device.codes[1];
    await expect(service.approve(second, principal)).resolves.toBeDefined();
  });

  it('accepts the previous code right after a rotation', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    const first = device.codes[0];
    jest.advanceTimersByTime(30_000);

    await expect(service.approve(first, principal)).resolves.toBeDefined();
  });

  it('draws again when a code is already the current or previous code of another request', async () => {
    const first = makeConnection('a', '10.0.0.1');
    drawCodes(0); // 222222
    service.request(first.connection);
    drawCodes(1); // the rotation: 333333, while 222222 stays valid as the previous code
    jest.advanceTimersByTime(ENROLLMENT_CODE_ROTATION_MS);
    expect(first.codes).toEqual(['222-222', '333-333']);

    const second = makeConnection('b', '10.0.0.2');
    drawCodes(0, 1, 2); // collides with the previous code, then with the current one
    service.request(second.connection);

    expect(second.codes).toEqual(['444-444']);
    await expect(service.approve('222222', principal)).resolves.toBeDefined();
    expect(first.connection.provision).toHaveBeenCalled();
    expect(second.connection.provision).not.toHaveBeenCalled();
  });

  it('ends a request after 10 minutes and closes the socket', () => {
    const device = makeConnection('a');
    service.request(device.connection);

    jest.advanceTimersByTime(ENROLLMENT_REQUEST_TTL_MS - 1);
    expect(device.connection.close).not.toHaveBeenCalled();
    expect(service.pendingCount).toBe(1);

    jest.advanceTimersByTime(1);
    expect(device.connection.close).toHaveBeenCalledTimes(1);
    expect(service.pendingCount).toBe(0);
  });

  it('forgets the request when the connection closes', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    service.release('a');

    await expect(service.approve(device.codes[0], principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows one pending request per connection and re-announces the same code', () => {
    const device = makeConnection('a');
    service.request(device.connection);
    service.request(device.connection);

    expect(service.pendingCount).toBe(1);
    expect(device.codes[1]).toBe(device.codes[0]);
  });

  it('never rejects a re-sent REGISTER of a waiting connection and keeps its code', async () => {
    const device = makeConnection('a', '10.7.7.7');
    expect([1, 2, 3, 4, 5].map(() => service.request(device.connection))).toEqual([true, true, true, true, true]);

    expect(device.rejections).toEqual([]);
    // Over the per-connection limit the re-announcement is skipped silently.
    expect(device.codes).toHaveLength(3);
    expect(new Set(device.codes).size).toBe(1);
    expect(service.pendingCount).toBe(1);

    // Re-sends do not use up the address budget: 9 more devices from the same address still get a code.
    const others = Array.from({ length: 10 }, (_, i) =>
      service.request(makeConnection(`o${i}`, '10.7.7.7').connection),
    );
    expect(others).toEqual([...Array(9).fill(true), false]);

    await expect(service.approve(device.codes[0], principal)).resolves.toBeDefined();
  });

  it('limits a connection that keeps getting refused to 3 attempts per minute', () => {
    for (let i = 0; i < 200; i++) service.request(makeConnection(`c${i}`, spread(i)).connection);
    const device = makeConnection('a', '192.168.5.5');

    expect([1, 2, 3, 4].map(() => service.request(device.connection))).toEqual([false, false, false, false]);
    expect(device.rejections).toEqual(['BUSY', 'BUSY', 'BUSY', 'RATE_LIMITED']);
    // Only the connection limit refused, so the wait is its minute and not the address window.
    expect(device.retryAfters[3]).toBe(60_000);

    service.release('c0');
    jest.advanceTimersByTime(60_001);
    expect(service.request(device.connection)).toBe(true);
  });

  it('limits an address to 10 attempts per 10 minutes', () => {
    const devices = Array.from({ length: 11 }, (_, i) => makeConnection(`c${i}`, '10.9.9.9'));
    const results = devices.map((device) => service.request(device.connection));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
    expect(devices[10].rejections).toEqual(['RATE_LIMITED']);
    expect(devices[10].retryAfters).toEqual([10 * 60_000]);
  });

  it('shares the address limits within one IPv6 /64', () => {
    const results = Array.from({ length: 11 }, (_, i) =>
      service.request(makeConnection(`c${i}`, `2001:db8:1:2::${(i + 1).toString(16)}`).connection),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
    expect(service.request(makeConnection('other', '2001:db8:1:3::1').connection)).toBe(true);
  });

  it('limits an address to 20 pending requests', () => {
    // With timers on time an address can hold at most 19 (its attempt window and the request TTL are both
    // 10 minutes), so the cap is a backstop for when expiry runs late. setSystemTime moves the clock
    // without firing the expiry timers, which is exactly that.
    for (let i = 0; i < 10; i++) expect(service.request(makeConnection(`a${i}`, '10.8.8.8').connection)).toBe(true);
    jest.setSystemTime(Date.now() + 10 * 60_000 + 1);
    for (let i = 0; i < 10; i++) expect(service.request(makeConnection(`b${i}`, '10.8.8.8').connection)).toBe(true);
    expect(service.pendingCount).toBe(20);

    // A third attempt window opens, so only the pending cap can refuse the 21st request.
    jest.setSystemTime(Date.now() + 10 * 60_000 + 1);
    const refused = makeConnection('c', '10.8.8.8');
    expect(service.request(refused.connection)).toBe(false);
    expect(refused.rejections).toEqual(['BUSY']);
    expect(service.request(makeConnection('d', '10.8.8.9').connection)).toBe(true);
    expect(service.pendingCount).toBe(21);
  });

  it('limits the total number of pending requests to 200', () => {
    let accepted = 0;
    for (let i = 0; i < 210; i++) {
      if (service.request(makeConnection(`c${i}`, spread(i)).connection)) accepted++;
    }
    expect(accepted).toBe(200);
    expect(service.pendingCount).toBe(200);
  });

  it('answers 429 after 5 wrong codes per approver per minute', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(NotFoundException);
    }
    const limited = await service.approve('AAAAAA', principal).catch((error) => error);
    expect(limited).toBeInstanceOf(EnrollmentRateLimitedException);
    expect(limited.getStatus()).toBe(429);
    expect(limited.getResponse()).toEqual({ statusCode: 429, message: 'EnrollmentRateLimited', retryAfterSeconds: 60 });

    // other approvers are unaffected, and the window ends
    await expect(service.approve('AAAAAA', { ...principal, userId: 2 })).rejects.toBeInstanceOf(NotFoundException);
    jest.advanceTimersByTime(60_001);
    await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(NotFoundException);
  });
});
