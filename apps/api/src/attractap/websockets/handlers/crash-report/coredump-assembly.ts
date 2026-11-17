import { crc32 } from 'zlib';

/** The reader's coredump partition (firmware partitions.csv, 0x20000): no valid dump is larger. */
export const COREDUMP_MAX_BYTES = 128 * 1024;
/** Raw bytes per chunk the server offers; ~5.5 KB as JSON, far below the 64 KiB session frame limit. */
export const COREDUMP_CHUNK_BYTES = 4096;
/** An upload that makes no progress for this long is dropped (the reader restarts it). */
export const COREDUMP_ASSEMBLY_IDLE_MS = 120_000;
/** Uploads in progress across all readers: at most 2 MiB of assembly buffers. */
export const COREDUMP_MAX_ASSEMBLIES = 16;

/**
 * Every error a crash report or coredump upload reply carries. The firmware (coredump-upload.cpp) gives
 * up the upload for good on REPORT_NOT_FOUND, MISMATCH, ALREADY_STORED, NOT_EXPECTED and INVALID_COREDUMP,
 * gives up the dump on TOO_LARGE, retries BUSY later and retries the others (restarting the upload where
 * needed). INVALID_CRASH_REPORT refuses the metadata itself. A new code must be placed in one of these
 * groups on both sides.
 */
export const COREDUMP_ERRORS = {
  INVALID_CRASH_REPORT: 'INVALID_CRASH_REPORT',
  INVALID_COREDUMP: 'INVALID_COREDUMP',
  COREDUMP_TOO_LARGE: 'COREDUMP_TOO_LARGE',
  COREDUMP_REPORT_NOT_FOUND: 'COREDUMP_REPORT_NOT_FOUND',
  COREDUMP_ALREADY_STORED: 'COREDUMP_ALREADY_STORED',
  COREDUMP_NOT_EXPECTED: 'COREDUMP_NOT_EXPECTED',
  COREDUMP_MISMATCH: 'COREDUMP_MISMATCH',
  COREDUMP_BUSY: 'COREDUMP_BUSY',
  CRASH_REPORT_STORE_FAILED: 'CRASH_REPORT_STORE_FAILED',
  COREDUMP_NO_UPLOAD: 'COREDUMP_NO_UPLOAD',
  COREDUMP_OUT_OF_ORDER: 'COREDUMP_OUT_OF_ORDER',
  COREDUMP_INVALID_CHUNK: 'COREDUMP_INVALID_CHUNK',
  COREDUMP_SIZE_MISMATCH: 'COREDUMP_SIZE_MISMATCH',
  COREDUMP_CHECKSUM_MISMATCH: 'COREDUMP_CHECKSUM_MISMATCH',
} as const;
export type CoredumpError = (typeof COREDUMP_ERRORS)[keyof typeof COREDUMP_ERRORS];

/** The errors of the in-memory assembly itself. */
export type CoredumpUploadError = Extract<
  CoredumpError,
  | 'COREDUMP_NO_UPLOAD'
  | 'COREDUMP_OUT_OF_ORDER'
  | 'COREDUMP_INVALID_CHUNK'
  | 'COREDUMP_SIZE_MISMATCH'
  | 'COREDUMP_CHECKSUM_MISMATCH'
>;

/** A coredump upload reply body (the handler adds the reportId). */
export type CoredumpReply =
  | { error: CoredumpError; expectedOffset?: number }
  | { chunkSize: number; nextOffset: number }
  | { nextOffset: number }
  | { coredumpStored: true };

export interface DeclaredCoredump {
  size: number;
  crc32: number;
}

interface Assembly extends DeclaredCoredump {
  readerId: number;
  socketId: string;
  reportId: number;
  buffer: Buffer;
  received: number;
  timer: NodeJS.Timeout;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function isUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/** A dump size and checksum as a reader declares them; null when they are not usable. */
export function declaredCoredump(size: unknown, checksum: unknown): DeclaredCoredump | null {
  return isUint32(size) && size > 0 && isUint32(checksum) ? { size, crc32: checksum } : null;
}

/**
 * Coredumps being uploaded in chunks (ATT-1144), kept in memory until the whole dump is verified.
 * One upload per reader (a new one replaces it), a fixed buffer of the declared size, a global cap
 * and an idle timeout bound the memory; nothing is persisted from here.
 */
export class CoredumpAssemblies {
  private readonly byReader = new Map<number, Assembly>();

  public constructor(
    private readonly onExpired: (readerId: number, reportId: number, received: number) => void = () => undefined,
    private readonly idleMs = COREDUMP_ASSEMBLY_IDLE_MS,
  ) {}

  public get size(): number {
    return this.byReader.size;
  }

  /** Bytes received so far by the reader's upload in progress, or null without one. */
  public received(readerId: number): number | null {
    return this.byReader.get(readerId)?.received ?? null;
  }

  /** Starts (or restarts) the reader's upload. False when too many other uploads are in progress. */
  public begin(socketId: string, readerId: number, reportId: number, declared: DeclaredCoredump): boolean {
    this.discard(readerId);
    if (declared.size > COREDUMP_MAX_BYTES) throw new RangeError('coredump larger than the partition');
    if (this.byReader.size >= COREDUMP_MAX_ASSEMBLIES) return false;
    const assembly: Assembly = {
      ...declared,
      readerId,
      socketId,
      reportId,
      buffer: Buffer.alloc(declared.size),
      received: 0,
      timer: this.startTimer(readerId),
    };
    this.byReader.set(readerId, assembly);
    return true;
  }

  /**
   * Appends the chunk at `offset`. A chunk that was already received is acknowledged again; a gap
   * returns the offset the upload continues from.
   */
  public append(
    readerId: number,
    reportId: number,
    offset: unknown,
    data: unknown,
  ): { nextOffset: number } | { error: CoredumpUploadError; expectedOffset?: number } {
    const assembly = this.byReader.get(readerId);
    if (!assembly || assembly.reportId !== reportId) return { error: 'COREDUMP_NO_UPLOAD' };
    if (!isUint32(offset) || typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0) {
      return { error: 'COREDUMP_INVALID_CHUNK' };
    }
    if (data.length > Math.ceil(COREDUMP_CHUNK_BYTES / 3) * 4 || !BASE64.test(data)) {
      return { error: 'COREDUMP_INVALID_CHUNK' };
    }
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length === 0 || bytes.length > COREDUMP_CHUNK_BYTES) return { error: 'COREDUMP_INVALID_CHUNK' };

    if (offset < assembly.received && offset + bytes.length <= assembly.received) {
      return { nextOffset: assembly.received };
    }
    if (offset !== assembly.received) {
      return { error: 'COREDUMP_OUT_OF_ORDER', expectedOffset: assembly.received };
    }
    if (offset + bytes.length > assembly.size) {
      this.discard(readerId);
      return { error: 'COREDUMP_SIZE_MISMATCH' };
    }
    bytes.copy(assembly.buffer, offset);
    assembly.received += bytes.length;
    clearTimeout(assembly.timer);
    assembly.timer = this.startTimer(readerId);
    return { nextOffset: assembly.received };
  }

  /**
   * Ends the reader's upload. Returns the dump when it is complete and matches both the size and checksum
   * declared at the start and those of the completion; any mismatch discards it.
   */
  public finish(
    readerId: number,
    reportId: number,
    completion: { totalSize: unknown; crc32: unknown },
  ): { coredump: Buffer; declared: DeclaredCoredump } | { error: CoredumpUploadError } {
    const assembly = this.byReader.get(readerId);
    if (!assembly || assembly.reportId !== reportId) return { error: 'COREDUMP_NO_UPLOAD' };
    this.discard(readerId);
    if (assembly.received !== assembly.size || completion.totalSize !== assembly.size) {
      return { error: 'COREDUMP_SIZE_MISMATCH' };
    }
    const checksum = crc32(assembly.buffer);
    if (checksum !== assembly.crc32 || completion.crc32 !== assembly.crc32) {
      return { error: 'COREDUMP_CHECKSUM_MISMATCH' };
    }
    return { coredump: assembly.buffer, declared: { size: assembly.size, crc32: assembly.crc32 } };
  }

  public discard(readerId: number): boolean {
    const assembly = this.byReader.get(readerId);
    if (!assembly) return false;
    clearTimeout(assembly.timer);
    this.byReader.delete(readerId);
    return true;
  }

  /** Drops the upload of a closed connection; returns what was discarded for logging. */
  public discardSocket(socketId: string): { readerId: number; reportId: number; received: number } | null {
    for (const assembly of this.byReader.values()) {
      if (assembly.socketId === socketId) {
        this.discard(assembly.readerId);
        return { readerId: assembly.readerId, reportId: assembly.reportId, received: assembly.received };
      }
    }
    return null;
  }

  private startTimer(readerId: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      const assembly = this.byReader.get(readerId);
      if (!assembly) return;
      this.byReader.delete(readerId);
      this.onExpired(readerId, assembly.reportId, assembly.received);
    }, this.idleMs);
    timer.unref?.();
    return timer;
  }
}
