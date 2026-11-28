import { decodeRaw, readPdu, writePdu } from '../protocol/protocol';

import { ModbusProtocolFixture, format } from './routing.test-utils';

// Fragments the response in real time while the transport's own timers are faked.
const realDelay = setTimeout;

describe('Modbus protocol fixtures (no hardware)', () => {
  let fixture: ModbusProtocolFixture;
  beforeEach(() => {
    // The transport's 100 ms deadline and reconnect delay expire only when a test advances them.
    // On real timers a loaded host can spend longer than that on one loopback exchange.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fixture = new ModbusProtocolFixture();
    fixture.setup();
  });
  afterEach(async () => {
    // Let the transport release its bus, which can wait for the reconnect delay.
    await jest.runOnlyPendingTimersAsync();
    jest.useRealTimers();
    await fixture.cleanup();
  });
  it('reads fragmented FC03/04 responses with transaction and multiple unit routing', async () => {
    const units: number[] = [];
    const transport = await fixture.fixture((request, socket) => {
      units.push(request[6]);
      const r = fixture.response(request, Buffer.from([request[7], 4, 0, 0, 0, request[6]]));
      socket.write(r.subarray(0, 5));
      realDelay(() => socket.end(r.subarray(5)), 2);
    });
    const values = await Promise.all([
      transport.request(1, readPdu(3, format)),
      transport.request(7, readPdu(4, format)),
    ]);
    expect(values.map((b) => decodeRaw(b, format))).toEqual([1, 7]);
    expect(units).toEqual([1, 7]);
  });

  it.each(['transaction', 'protocol', 'unit', 'function', 'count', 'length'])(
    'rejects corrupt TCP %s',
    async (field) => {
      const transport = await fixture.fixture((request, socket) => {
        const r = fixture.response(request, Buffer.from([3, 4, 0, 0, 0, 1]));
        if (field === 'transaction') r[1] ^= 1;
        if (field === 'protocol') r[3] = 1;
        if (field === 'unit') r[6] = 9;
        if (field === 'function') r[7] = 4;
        if (field === 'count') r[8] = 2;
        if (field === 'length') r.writeUInt16BE(255, 4);
        socket.end(r);
      });
      await expect(transport.request(1, readPdu(3, format))).rejects.toThrow();
    },
  );

  it('reports protocol exceptions then reconnects for next request', async () => {
    let calls = 0;
    const transport = await fixture.fixture((request, socket) =>
      socket.end(fixture.response(request, ++calls === 1 ? Buffer.from([0x83, 2]) : Buffer.from([3, 4, 0, 0, 0, 9]))),
    );
    await expect(transport.request(1, readPdu(3, format))).rejects.toThrow('exception 2');
    const next = expect(transport.request(1, readPdu(3, format))).resolves.toEqual(Buffer.from([0, 0, 0, 9]));
    await jest.advanceTimersByTimeAsync(5);
    await next;
  });

  it('bounds a stalled queue and reconnects after timeout without replay', async () => {
    let calls = 0;
    let stalled!: () => void;
    const received = new Promise<void>((resolve) => {
      stalled = resolve;
    });
    const transport = await fixture.fixture((request, socket) => {
      if (++calls > 1) socket.end(fixture.response(request, Buffer.from([3, 4, 0, 0, 0, 1])));
      else stalled();
    });
    const first = expect(transport.request(1, readPdu(3, format))).rejects.toThrow('timeout');
    const second = expect(transport.request(2, readPdu(3, format))).resolves.toBeDefined();
    await expect(transport.request(3, readPdu(3, format))).rejects.toThrow('queue full');
    await received;
    await jest.advanceTimersByTimeAsync(100);
    await first;
    await jest.advanceTimersByTimeAsync(5);
    await second;
    expect(calls).toBe(2);
  });

  it.each([5, 6, 16] as const)('validates FC%s write echo', async (fc) => {
    let corrupt = false;
    const transport = await fixture.fixture((request, socket) => {
      const echo = Buffer.from(request.subarray(7, 12));
      if (corrupt) echo[4] ^= 1;
      socket.end(fixture.response(request, echo));
    });
    const f = { ...format, dataType: fc === 16 ? ('uint32' as const) : ('uint16' as const) };
    const pdu = writePdu(fc, f, 1);
    await expect(transport.request(1, pdu)).resolves.toBeDefined();
    corrupt = true;
    await expect(transport.request(1, pdu)).rejects.toThrow('echo');
  });
});
