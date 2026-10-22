import { DeviceEnrollmentService } from './device-enrollment.service';
import { ENROLLMENT_LIMITS, EnrollmentLimiter } from './enrollment-limits';

describe('connection-bound device enrollment', () => {
  const audit = { recordAdministration: jest.fn().mockResolvedValue(undefined) };
  let service: DeviceEnrollmentService;
  const account = { id: 7, authenticationMethod: 'session' as const };
  function socket() {
    return { readyState: 1, close: jest.fn() };
  }
  function pending(code = 'ABC-123', ip = '127.0.0.1', type: 'reader' | 'companion' = 'reader') {
    const connection = socket();
    service.admit(connection, type, ip);
    const deliver = jest.fn().mockResolvedValue(undefined),
      discard = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue({ id: 12, deliver, discard });
    const notify = jest.fn();
    service.announce(connection, type, code, {}, create, notify);
    return { connection, create, deliver, discard, notify };
  }
  beforeEach(() => {
    jest.useFakeTimers();
    audit.recordAdministration.mockClear();
    service = new DeviceEnrollmentService(audit as never);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('keeps the agreed total pending bound across connection-rate windows', () => {
    for (let index = 0; index < 100; index++) pending(`A${String(index).padStart(2, '0')}-123`, `peer-${index}`);
    jest.advanceTimersByTime(60_000);
    for (let index = 100; index < 128; index++)
      pending(`B${String(index - 100).padStart(2, '0')}-123`, `peer-${index}`);
    expect(() => service.admit(socket(), 'reader', 'another-peer')).toThrow('Too many pending');
  });

  it('creates no registration until approval, consumes it once and audits without secrets', async () => {
    const p = pending();
    expect(p.create).not.toHaveBeenCalled();
    expect(p.notify).toHaveBeenCalledWith('PENDING_APPROVAL');
    expect(await service.approve('reader', 'ABC-123', account, 'admin')).toEqual({ id: 12 });
    expect(p.create).toHaveBeenCalledTimes(1);
    expect(p.deliver).toHaveBeenCalledTimes(1);
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
    expect(JSON.stringify(audit.recordAdministration.mock.calls)).not.toContain('ABC-123');
    expect(audit.recordAdministration).toHaveBeenCalledTimes(2);
  });
  it.each([29_999, 30_000, 30_001])('expires at 30 seconds (%i ms)', async (elapsed) => {
    pending();
    jest.advanceTimersByTime(elapsed);
    if (elapsed < 30_000)
      await expect(service.approve('reader', 'ABC-123', account, 'admin')).resolves.toEqual({ id: 12 });
    else await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
  });
  it('does not extend expiry by repeating a code and rejects replay after rotation', async () => {
    const p = pending();
    jest.advanceTimersByTime(20_000);
    service.announce(p.connection, 'reader', 'ABC-123', {}, p.create, p.notify);
    jest.advanceTimersByTime(10_000);
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
    service.announce(p.connection, 'reader', 'DEF-456', {}, p.create, p.notify);
    expect(() => service.announce(p.connection, 'reader', 'ABC-123', {}, p.create, p.notify)).toThrow('expired');
  });
  it('rejects collisions without allowing either connection to receive approval', async () => {
    const first = pending();
    expect(() => pending()).toThrow('collision');
    expect(first.notify).toHaveBeenCalledWith('CODE_COLLISION');
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
    expect(first.create).not.toHaveBeenCalled();
  });
  it('binds approval to the device type and live socket', async () => {
    const p = pending();
    await expect(service.approve('companion', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
    service.disconnect(p.connection);
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
    expect(p.create).not.toHaveBeenCalled();
  });
  it.each(['disconnect', 'rotation', 'expiry'] as const)(
    'discards a newly created unclaimed row after a %s race',
    async (change) => {
      const p = pending();
      let finish!: (value: { id: number; deliver: typeof p.deliver; discard: typeof p.discard }) => void;
      p.create.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const approval = service.approve('reader', 'ABC-123', account, 'admin');
      if (change === 'disconnect') service.disconnect(p.connection);
      if (change === 'rotation') service.announce(p.connection, 'reader', 'DEF-456', {}, p.create, p.notify);
      if (change === 'expiry') jest.advanceTimersByTime(30_000);
      finish({ id: 12, deliver: p.deliver, discard: p.discard });
      await expect(approval).rejects.toThrow('changed');
      expect(p.discard).toHaveBeenCalledTimes(1);
      expect(p.deliver).not.toHaveBeenCalled();
    },
  );
  it('serializes concurrent approvals and never repeats credentials after send failure', async () => {
    const p = pending();
    let finish!: () => void;
    p.deliver.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.approve('reader', 'ABC-123', account, 'admin');
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('progress');
    await jest.advanceTimersByTimeAsync(0);
    finish();
    await first;
    expect(p.create).toHaveBeenCalledTimes(1);
    const second = pending('DEF-456');
    second.deliver.mockRejectedValue(new Error('Send failed'));
    await expect(service.approve('reader', 'DEF-456', account, 'admin')).rejects.toThrow('Send failed');
    await expect(service.approve('reader', 'DEF-456', account, 'admin')).rejects.toThrow('expired');
    expect(second.deliver).toHaveBeenCalledTimes(1);
    expect(second.discard).toHaveBeenCalledTimes(1);
  });
  it('requires a fresh code after creation failure', async () => {
    const p = pending();
    p.create.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('Database unavailable');
    await expect(service.approve('reader', 'ABC-123', account, 'admin')).rejects.toThrow('expired');
  });
  it('enforces initial and absolute deadlines and releases timers on authentication', () => {
    const idle = socket();
    service.admit(idle, 'reader', 'idle');
    jest.advanceTimersByTime(10_000);
    expect(idle.close).toHaveBeenCalled();
    const p = pending();
    jest.advanceTimersByTime(299_999);
    expect(p.connection.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(p.connection.close).toHaveBeenCalled();
    const registered = socket();
    service.admit(registered, 'reader', 'known');
    service.authenticated(registered);
    jest.advanceTimersByTime(300_000);
    expect(service.isPending(registered)).toBe(false);
    expect(registered.close).not.toHaveBeenCalled();
  });
  it('bounds IP slots, metadata and announcements', () => {
    for (let i = 0; i < 8; i++) service.admit(socket(), 'companion', 'same');
    expect(() => service.admit(socket(), 'reader', 'same')).toThrow('pending');
    const p = pending('DEF-456', 'other');
    expect(() =>
      service.announce(p.connection, 'reader', 'GHI-789', { extra: 'x'.repeat(1024) }, p.create, p.notify),
    ).toThrow('metadata');
    service.announce(p.connection, 'reader', 'DEF-456', {}, p.create, p.notify);
    service.announce(p.connection, 'reader', 'DEF-456', {}, p.create, p.notify);
    expect(() => service.announce(p.connection, 'reader', 'DEF-456', {}, p.create, p.notify)).toThrow('announcements');
  });
  it('retains connection counters across reconnects', () => {
    for (let i = 0; i < 10; i++) {
      const c = socket();
      service.admit(c, 'reader', 'same');
      service.disconnect(c);
    }
    expect(() => service.admit(socket(), 'reader', 'same')).toThrow('rate limit');
    jest.advanceTimersByTime(60_000);
    expect(() => service.admit(socket(), 'reader', 'same')).not.toThrow();
  });
  it('limits unsuccessful approval guesses per account', async () => {
    for (let i = 0; i < 5; i++)
      await expect(service.approve('reader', 'BAD-123', account, 'admin')).rejects.toThrow('expired');
    await expect(service.approve('reader', 'BAD-123', account, 'admin')).rejects.toThrow('rate limit');
  });
  it('rejects new counter keys at capacity instead of resetting old ones', () => {
    const limiter = new EnrollmentLimiter();
    for (let i = 0; i < ENROLLMENT_LIMITS.counterEntries; i++) limiter.take(String(i), 1, 0);
    expect(() => limiter.take('new', 1, 0)).toThrow('rate limit');
    expect(() => limiter.take('0', 1, 0)).toThrow('rate limit');
    expect(() => limiter.take('new', 1, 60_000)).not.toThrow();
  });
});
