import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { TooManyAuthAttemptsException } from '../users-and-auth/rate-limiting/exceptions';
import { DeviceEnrollmentService, EnrollmentConnection } from './device-enrollment.service';

const principal = { userId: 1, authenticationMethod: 'session' as const };

function plain(code: string) {
  return code.replace('-', '');
}

function makeConnection(id: string, address = '10.0.0.1', overrides: Partial<EnrollmentConnection> = {}) {
  const codes: string[] = [];
  const rejections: string[] = [];
  const rollback = jest.fn().mockResolvedValue(undefined);
  const deliver = jest.fn().mockResolvedValue(true);
  const connection: EnrollmentConnection = {
    id,
    address,
    sendCode: (code) => codes.push(code),
    sendRejected: (reason) => rejections.push(reason),
    provision: jest.fn().mockResolvedValue({ kind: 'reader', id: 5, name: 'Reader', deliver, rollback }),
    close: jest.fn(),
    ...overrides,
  };
  return { connection, codes, rejections, deliver, rollback };
}

describe('DeviceEnrollmentService', () => {
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

  it('audits the approval with the approver', async () => {
    const device = makeConnection('a');
    service.request(device.connection);
    await service.approve(device.codes[0].toLowerCase(), {
      userId: 4,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });

    expect(audit.recordAttractap).toHaveBeenCalledWith({
      action: 'reader.enrolled',
      actorId: 4,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 5,
      details: { source: 'reader-enrollment' },
    });
  });

  it('removes the record and closes the connection when delivery fails', async () => {
    const device = makeConnection('a');
    device.deliver.mockResolvedValue(false);
    service.request(device.connection);

    await expect(service.approve(device.codes[0], principal)).rejects.toBeInstanceOf(BadGatewayException);

    expect(device.rollback).toHaveBeenCalled();
    expect(device.connection.close).toHaveBeenCalled();
    expect(audit.recordAttractap).not.toHaveBeenCalled();
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

  it('keeps codes unique among pending requests', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const device = makeConnection(`c${i}`, `10.${Math.floor(i / 10)}.0.${i % 10}`);
      service.request(device.connection);
      expect(seen.has(device.codes[0])).toBe(false);
      seen.add(device.codes[0]);
    }
  });

  it('ends a request after 10 minutes and closes the socket', () => {
    const device = makeConnection('a');
    service.request(device.connection);

    jest.advanceTimersByTime(10 * 60_000);

    expect(device.connection.close).toHaveBeenCalled();
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

  it('limits a connection to 3 attempts per minute', () => {
    const device = makeConnection('a');
    expect([1, 2, 3, 4].map(() => service.request(device.connection))).toEqual([true, true, true, false]);
    expect(device.rejections).toEqual(['RATE_LIMITED']);

    jest.advanceTimersByTime(60_001);
    expect(service.request(device.connection)).toBe(true);
  });

  it('limits an address to 10 attempts per 10 minutes', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) results.push(service.request(makeConnection(`c${i}`, '10.9.9.9').connection));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
  });

  it('limits an address to 20 pending requests', () => {
    for (let i = 0; i < 20; i++) {
      jest.advanceTimersByTime(60_000 * 10);
      service.request(makeConnection(`c${i}`, '10.8.8.8').connection);
    }
    expect(service.pendingCount).toBeLessThanOrEqual(20);
  });

  it('limits the total number of pending requests to 200', () => {
    let accepted = 0;
    for (let i = 0; i < 210; i++) {
      if (service.request(makeConnection(`c${i}`, `10.${Math.floor(i / 10)}.0.${i % 10}`).connection)) accepted++;
    }
    expect(accepted).toBe(200);
    expect(service.pendingCount).toBe(200);
  });

  it('answers 429 after 5 wrong codes per approver per minute', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(TooManyAuthAttemptsException);

    // other approvers are unaffected, and the window ends
    await expect(service.approve('AAAAAA', { ...principal, userId: 2 })).rejects.toBeInstanceOf(NotFoundException);
    jest.advanceTimersByTime(60_001);
    await expect(service.approve('AAAAAA', principal)).rejects.toBeInstanceOf(NotFoundException);
  });
});
