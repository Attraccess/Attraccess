/* eslint-disable @typescript-eslint/no-explicit-any */
import { crc32 } from 'zlib';
import { AttractapCrashReportHandler } from './crash-report.handler';
import { COREDUMP_CHUNK_BYTES, COREDUMP_MAX_ASSEMBLIES, COREDUMP_MAX_BYTES } from './coredump-assembly';
import { AttractapEventType } from '../../websocket.types';

/** Chunked coredump upload (ATT-1144) through the handler, with an in-memory report store. */
describe('AttractapCrashReportHandler chunked coredump upload', () => {
  interface StoredReport {
    id: number;
    attractapId: number;
    resetReason: string;
    coredumpStatus: 'awaiting' | 'stored' | null;
    coredumpExpectedSize: number | null;
    coredumpExpectedCrc32: number | null;
    coredumpSize: number | null;
    coredump: Buffer | null;
    symbolicationStatus: string | null;
  }

  let handler: AttractapCrashReportHandler;
  let reports: Map<number, StoredReport>;
  let service: Record<string, jest.Mock>;
  let audit: { record: jest.Mock };
  let metrics: { attractapCrashReportsTotal: { inc: jest.Mock } };

  const reader = (readerId = 42, id = `sock-${readerId}`) => ({
    id,
    readerId,
    state: {},
    sendMessage: jest.fn().mockResolvedValue(true),
    sendRaw: jest.fn().mockReturnValue(true),
  });
  type Reader = ReturnType<typeof reader>;

  const lastRaw = (socket: Reader) => socket.sendRaw.mock.calls.at(-1)?.[0].data;
  const lastAck = (socket: Reader) => socket.sendMessage.mock.calls.at(-1)?.[0].data.payload;

  const dumpOf = (size: number, seed = 1) => {
    const dump = Buffer.alloc(size);
    let x = seed;
    for (let i = 0; i < size; i++) {
      x = (x * 1103515245 + 12345) >>> 0;
      dump[i] = x >>> 24;
    }
    return dump;
  };

  const report = (socket: Reader, payload: Record<string, unknown>) =>
    handler.handleCrashReport(socket as any, { payload } as any);
  const begin = (socket: Reader, reportId: number, dump: Buffer, crc = crc32(dump)) =>
    handler.handleCoredumpBegin(socket as any, { payload: { reportId, size: dump.length, crc32: crc } } as any);
  const chunk = (socket: Reader, reportId: number, offset: number, data: Buffer | string) =>
    handler.handleCoredumpChunk(
      socket as any,
      {
        payload: { reportId, offset, data: typeof data === 'string' ? data : data.toString('base64') },
      } as any,
    );
  const complete = (socket: Reader, reportId: number, dump: Buffer, crc = crc32(dump)) =>
    handler.handleCoredumpComplete(socket as any, { payload: { reportId, totalSize: dump.length, crc32: crc } } as any);

  /** What new firmware does after a crash: metadata, then the dump in chunks. */
  async function announce(socket: Reader, dump: Buffer): Promise<number> {
    await report(socket, { resetReason: 'PANIC', coredumpSize: dump.length, coredumpCrc32: crc32(dump) });
    return lastAck(socket).id;
  }
  async function upload(socket: Reader, reportId: number, dump: Buffer, from = 0) {
    await begin(socket, reportId, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId, chunkSize: COREDUMP_CHUNK_BYTES, nextOffset: 0 });
    for (let offset = from; offset < dump.length; offset += COREDUMP_CHUNK_BYTES) {
      chunk(socket, reportId, offset, dump.subarray(offset, offset + COREDUMP_CHUNK_BYTES));
      expect(lastRaw(socket).payload).toEqual({
        reportId,
        nextOffset: Math.min(offset + COREDUMP_CHUNK_BYTES, dump.length),
      });
    }
    await complete(socket, reportId, dump);
  }

  beforeEach(() => {
    reports = new Map();
    let nextId = 1;
    service = {
      createCrashReport: jest.fn(async (readerId: number, payload: any, expected: any) => {
        const inline = payload.coredumpBase64 ? Buffer.from(payload.coredumpBase64, 'base64') : null;
        const stored: StoredReport = {
          id: nextId++,
          attractapId: readerId,
          resetReason: payload.resetReason,
          coredumpStatus: inline ? 'stored' : expected ? 'awaiting' : null,
          coredumpExpectedSize: !inline && expected ? expected.size : null,
          coredumpExpectedCrc32: !inline && expected ? expected.crc32 : null,
          coredumpSize: inline?.length ?? null,
          coredump: inline,
          symbolicationStatus: inline ? 'success' : null,
        };
        reports.set(stored.id, stored);
        return { ...stored, coredump: null };
      }),
      findCrashReportOfReader: jest.fn(async (id: number, readerId: number) => {
        const found = reports.get(id);
        return found && found.attractapId === readerId ? { ...found } : null;
      }),
      storeUploadedCoredump: jest.fn(async (found: StoredReport, coredump: Buffer) => {
        const stored = reports.get(found.id);
        if (!stored || stored.coredumpStatus !== 'awaiting') return false;
        Object.assign(stored, { coredump, coredumpSize: coredump.length, coredumpStatus: 'stored' });
        stored.symbolicationStatus = 'success';
        found.symbolicationStatus = 'success';
        return true;
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    metrics = { attractapCrashReportsTotal: { inc: jest.fn() } };
    handler = new AttractapCrashReportHandler();
    Object.assign(handler as any, {
      attractapService: service,
      audit,
      metricsService: metrics,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    });
  });

  it.each([
    ['32 KiB - 1', 32 * 1024 - 1],
    ['exactly 32 KiB', 32 * 1024],
    ['32 KiB + 1', 32 * 1024 + 1],
    ['the observed 43,776 bytes', 43776],
    ['the 128 KiB partition', COREDUMP_MAX_BYTES],
  ])('stores %s byte-identical and confirms only after storing it', async (_label, size) => {
    const socket = reader();
    const dump = dumpOf(size);
    const id = await announce(socket, dump);
    expect(lastAck(socket)).toEqual({
      received: true,
      id,
      coredumpUpload: { reportId: id, chunkSize: COREDUMP_CHUNK_BYTES },
    });
    expect(reports.get(id)?.coredumpStatus).toBe('awaiting');

    await upload(socket, id, dump);

    expect(lastRaw(socket)).toEqual({
      type: AttractapEventType.READER_COREDUMP_COMPLETE,
      payload: { reportId: id, coredumpStored: true },
    });
    expect(reports.get(id)?.coredump?.equals(dump)).toBe(true);
    expect(reports.get(id)?.coredumpStatus).toBe('stored');
    // The report is audited and counted once, when it is created, not per chunk.
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0].details.hasCoredump).toBe(true);
    expect(metrics.attractapCrashReportsTotal.inc).toHaveBeenCalledTimes(1);
    // Replies never wait for an ACK and stay far below the 64 KiB session frame.
    for (const [message] of socket.sendRaw.mock.calls) {
      expect(Buffer.byteLength(JSON.stringify(message))).toBeLessThan(1024);
    }
  });

  it('keeps metadata but refuses an announced dump larger than the partition', async () => {
    const socket = reader();
    await report(socket, { resetReason: 'PANIC', coredumpSize: COREDUMP_MAX_BYTES + 1, coredumpCrc32: 1 });
    expect(service.createCrashReport).toHaveBeenCalledWith(42, expect.anything(), null, {
      size: COREDUMP_MAX_BYTES + 1,
    });
    const ack = lastAck(socket);
    expect(ack).toEqual({ received: true, id: ack.id, coredumpRejected: 'COREDUMP_TOO_LARGE' });

    await handler.handleCoredumpBegin(
      socket as any,
      {
        payload: { reportId: ack.id, size: COREDUMP_MAX_BYTES + 1, crc32: 1 },
      } as any,
    );
    expect(lastRaw(socket).payload).toEqual({ reportId: ack.id, error: 'COREDUMP_TOO_LARGE' });
  });

  it('refuses a malformed announcement but keeps the report', async () => {
    const socket = reader();
    await report(socket, { resetReason: 'PANIC', coredumpSize: 'big', coredumpCrc32: 1 });
    expect(lastAck(socket)).toMatchObject({ received: true, coredumpRejected: 'INVALID_COREDUMP' });
    expect(lastAck(socket).coredumpUpload).toBeUndefined();
    expect(service.createCrashReport).toHaveBeenCalledWith(42, expect.anything(), null, { size: null });
  });

  it('keeps the announced size of a dump refused for an invalid checksum', async () => {
    const socket = reader();
    await report(socket, { resetReason: 'PANIC', coredumpSize: 1000, coredumpCrc32: -1 });
    expect(lastAck(socket)).toMatchObject({ received: true, coredumpRejected: 'INVALID_COREDUMP' });
    expect(service.createCrashReport).toHaveBeenCalledWith(42, expect.anything(), null, { size: 1000 });
  });

  it('keeps the legacy inline coredump path for firmware before ATT-1144', async () => {
    const socket = reader();
    const dump = dumpOf(20000);
    await report(socket, { resetReason: 'PANIC', coredumpBase64: dump.toString('base64') });
    const ack = lastAck(socket);
    expect(ack).toEqual({ received: true, id: ack.id });
    expect(reports.get(ack.id)?.coredump?.equals(dump)).toBe(true);
    expect(service.createCrashReport).toHaveBeenCalledWith(42, expect.anything(), null, null);
  });

  it("refuses an upload to another reader's report like a missing one", async () => {
    const owner = reader(42);
    const dump = dumpOf(9000);
    const id = await announce(owner, dump);
    const intruder = reader(43);
    await begin(intruder, id, dump);
    expect(lastRaw(intruder).payload).toEqual({ reportId: id, error: 'COREDUMP_REPORT_NOT_FOUND' });
    chunk(intruder, id, 0, dump.subarray(0, 4096));
    expect(lastRaw(intruder).payload).toEqual({ reportId: id, error: 'COREDUMP_NO_UPLOAD' });
  });

  it('confirms the same dump again but refuses a different one once a dump is stored', async () => {
    const socket = reader();
    const dump = dumpOf(9000);
    const id = await announce(socket, dump);
    await upload(socket, id, dump);

    await begin(socket, id, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, coredumpStored: true });
    await begin(socket, id, dumpOf(9000, 2));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_ALREADY_STORED' });
    expect(reports.get(id)?.coredump?.equals(dump)).toBe(true);
  });

  it('refuses a dump that differs from the announced one, and reports that expect none', async () => {
    const socket = reader();
    const dump = dumpOf(9000);
    const id = await announce(socket, dump);
    await begin(socket, id, dumpOf(9001));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_MISMATCH' });

    await report(socket, { resetReason: 'POWERON' });
    const plain = lastAck(socket).id;
    await begin(socket, plain, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: plain, error: 'COREDUMP_NOT_EXPECTED' });
  });

  it('re-acks a duplicate chunk and resyncs an out-of-order chunk', async () => {
    const socket = reader();
    const dump = dumpOf(12000);
    const id = await announce(socket, dump);
    await begin(socket, id, dump);
    chunk(socket, id, 0, dump.subarray(0, 4096));
    chunk(socket, id, 0, dump.subarray(0, 4096));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, nextOffset: 4096 });
    chunk(socket, id, 8192, dump.subarray(8192, 12000));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_OUT_OF_ORDER', expectedOffset: 4096 });
    chunk(socket, id, 4096, dump.subarray(4096, 8192));
    chunk(socket, id, 8192, dump.subarray(8192, 12000));
    await complete(socket, id, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, coredumpStored: true });
    expect(reports.get(id)?.coredump?.equals(dump)).toBe(true);
  });

  it.each([
    ['not base64', '!!!!'],
    ['an empty chunk', ''],
    ['a chunk above the chunk size', Buffer.alloc(COREDUMP_CHUNK_BYTES + 3).toString('base64')],
  ])('refuses %s', async (_label, data) => {
    const socket = reader();
    const dump = dumpOf(12000);
    const id = await announce(socket, dump);
    await begin(socket, id, dump);
    chunk(socket, id, 0, data);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_INVALID_CHUNK' });
  });

  it('discards the upload on a size overrun or a checksum mismatch, and the reader can start again', async () => {
    const socket = reader();
    const dump = dumpOf(5000);
    const id = await announce(socket, dump);
    await begin(socket, id, dump);
    chunk(socket, id, 0, dump.subarray(0, 4096));
    chunk(socket, id, 4096, dumpOf(4096));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_SIZE_MISMATCH' });
    chunk(socket, id, 0, dump.subarray(0, 4096));
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_NO_UPLOAD' });

    // Same size, corrupted bytes: the checksum catches it and nothing is stored.
    await begin(socket, id, dump);
    const corrupted = Buffer.from(dump);
    corrupted[100] ^= 0xff;
    chunk(socket, id, 0, corrupted.subarray(0, 4096));
    chunk(socket, id, 4096, corrupted.subarray(4096));
    await complete(socket, id, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_CHECKSUM_MISMATCH' });
    expect(reports.get(id)?.coredumpStatus).toBe('awaiting');

    await upload(socket, id, dump);
    expect(reports.get(id)?.coredump?.equals(dump)).toBe(true);
  });

  it('refuses to complete an upload that is still missing chunks', async () => {
    const socket = reader();
    const dump = dumpOf(9000);
    const id = await announce(socket, dump);
    await begin(socket, id, dump);
    chunk(socket, id, 0, dump.subarray(0, 4096));
    await complete(socket, id, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'COREDUMP_SIZE_MISMATCH' });
    expect(service.storeUploadedCoredump).not.toHaveBeenCalled();
  });

  it('drops a partial upload when the connection closes; the reconnected reader restarts it', async () => {
    const first = reader(42, 'sock-a');
    const dump = dumpOf(43776);
    const id = await announce(first, dump);
    await begin(first, id, dump);
    chunk(first, id, 0, dump.subarray(0, 4096));
    handler.discardCoredumpUpload('sock-a');

    const second = reader(42, 'sock-b');
    chunk(second, id, 4096, dump.subarray(4096, 8192));
    expect(lastRaw(second).payload).toEqual({ reportId: id, error: 'COREDUMP_NO_UPLOAD' });
    await upload(second, id, dump);
    expect(reports.get(id)?.coredump?.equals(dump)).toBe(true);
    expect(service.createCrashReport).toHaveBeenCalledTimes(1);
  });

  it('allows one upload per reader and a bounded number overall', async () => {
    const dump = dumpOf(5000);
    const sockets = Array.from({ length: COREDUMP_MAX_ASSEMBLIES }, (_, i) => reader(100 + i));
    for (const socket of sockets) {
      const id = await announce(socket, dump);
      await begin(socket, id, dump);
      expect(lastRaw(socket).payload.error).toBeUndefined();
    }
    const late = reader(999);
    const lateId = await announce(late, dump);
    await begin(late, lateId, dump);
    expect(lastRaw(late).payload).toEqual({ reportId: lateId, error: 'COREDUMP_BUSY' });

    // A reader restarting its own upload replaces it instead of taking a second slot.
    const again = await announce(sockets[0], dump);
    await begin(sockets[0], again, dump);
    expect(lastRaw(sockets[0]).payload).toEqual({ reportId: again, chunkSize: COREDUMP_CHUNK_BYTES, nextOffset: 0 });
  });

  it('answers a store failure with an error the reader retries', async () => {
    const socket = reader();
    const dump = dumpOf(5000);
    const id = await announce(socket, dump);
    service.storeUploadedCoredump.mockRejectedValueOnce(new Error('disk full'));
    await upload(socket, id, dump);
    expect(lastRaw(socket).payload).toEqual({ reportId: id, error: 'CRASH_REPORT_STORE_FAILED' });
    expect(reports.get(id)?.coredumpStatus).toBe('awaiting');
  });
});
