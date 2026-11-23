import { EventEmitter } from 'events';
import { NotFoundException } from '@nestjs/common';
import { mkdtempSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ATTRACTAP_CONVERSION_TERMINAL_STATES,
  type AttractapConversionState,
  type AttractapSecureConversionPatch,
  type AttractapSecureConversionRecord,
  type NewAttractapSecureConversion,
} from '@attraccess/application-models';
import type { AuditActor, AuditRecorder } from '../../audit/recorder/audit-event';
import { FIRMWARE, FakeReaderStore, makeReader } from '../attractap-fake-stores.test-fixture';
import type { AttractapFirmwareService } from '../firmware.service';
import type { SecureBootKeyService } from '../secure-boot/secure-boot-key.service';
import type { SecureImageService } from '../secure-boot/secure-image.service';
import type { EfuseReportService } from '../security/efuse-report.service';
import { ReaderControlService } from '../security/reader-control.service';
import type { SessionConnection } from '../security/session-connection';
import { FrameType } from '../security/session-framing';
import { SessionSecurityState } from '../security/session-security-state';
import { EmulatedConversionDevice, type ConversionFaults } from '../security/testing/emulated-conversion';
import { ConversionAudit } from './conversion-audit';
import { ConversionImages } from './conversion-images';
import { ConversionProtocolService } from './conversion-protocol.service';
import { ConversionSessionRegistry } from './conversion-session-registry';
import { ConversionTransferService } from './conversion-transfer.service';
import { PreflightExpectations } from './preflight-expectations';
import { SecureConversionService } from './secure-conversion.service';
import type { AttractapSecureConversionStore } from './secure-conversion-store.port';

/** In-memory conversion store with the one-active rule and compare-and-set updates; logs every write. */
export class FakeConversionStore implements AttractapSecureConversionStore {
  rows: AttractapSecureConversionRecord[] = [];
  /** Write log shared with other fakes to assert ordering. */
  constructor(private readonly log: string[] = []) {}

  async findById(id: number) {
    return structuredClone(this.rows.find((row) => row.id === id) ?? null);
  }
  async findActive() {
    const row = this.rows.find((r) => !ATTRACTAP_CONVERSION_TERMINAL_STATES.includes(r.state));
    return structuredClone(row ?? null);
  }
  async findLatestForReader(readerId: number) {
    const row = [...this.rows].reverse().find((r) => r.readerId === readerId);
    return structuredClone(row ?? null);
  }
  async listActiveFor(readerIds: number[]) {
    const active = await this.findActive();
    return active && readerIds.includes(active.readerId) ? [active] : [];
  }
  async insert(conversion: NewAttractapSecureConversion, at: Date) {
    if (await this.findActive()) return null;
    const row: AttractapSecureConversionRecord = {
      ...structuredClone(conversion),
      id: this.rows.length + 1,
      state: 'preflight',
      failedInState: null,
      failureReason: null,
      verified: false,
      bytesDone: 0,
      bytesTotal: 0,
      burnReport: null,
      startedAt: at,
      stateChangedAt: at,
      lastSeenAt: null,
      endedAt: null,
    };
    this.rows.push(row);
    this.log.push(`conversion:insert`);
    return structuredClone(row);
  }
  async update(id: number, patch: AttractapSecureConversionPatch, whenStates: readonly AttractapConversionState[]) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || !whenStates.includes(row.state)) return null;
    Object.assign(row, structuredClone(patch));
    // One write: the burn report is logged first, as it is what must be on disk before the next command.
    if (patch.burnReport) this.log.push('conversion:burnReport');
    if (patch.state) this.log.push(`conversion:${patch.state}`);
    return structuredClone(row);
  }
}

export const PARTITION_SHA = 'e'.repeat(64);
export const DIGESTS = { digest0: '1'.repeat(64), digest1: '2'.repeat(64) };
export const ADMIN: AuditActor = { id: 9, authenticationMethod: 'session' } as AuditActor;
const FINGERPRINT = 'f'.repeat(64);

/** A fake SESSION connection: what the server sends is collected, `control()` plays the reader. */
class FakeConnection extends EventEmitter {
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  sendFrame(type: FrameType, payload: Buffer) {
    if (this.closed) return false;
    if (type === FrameType.CONTROL) this.sent.push(JSON.parse(payload.toString('utf8')));
    return true;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('closed');
  }
}

export interface HarnessOptions {
  faults?: ConversionFaults;
  keysStatus?: 'ready' | 'recovery-check-pending' | 'none';
  hardwareTested?: boolean;
  build?: { profile: 'plain' | 'secure' | 'secure-lab'; release: boolean; variant: string };
  secureConversion?: boolean;
  /** The firmware reports `conversionStopBeforeBurn` (lab/HIL builds). */
  stopBeforeBurnBuild?: boolean;
}

/**
 * Real conversion services (protocol, admin, transfer, images, control channel) with in-memory stores, stubbed key
 * and image services, and an EmulatedConversionDevice playing the reader. `connect()` opens a session, `pump()`
 * exchanges messages until nothing moves.
 */
export function createConversionHarness(options: HarnessOptions = {}) {
  const log: string[] = [];
  const conversions = new FakeConversionStore(log);
  const readers = new FakeReaderStore();
  readers.add(
    makeReader({
      id: 1,
      name: 'Lab door',
      credentialFingerprint: FINGERPRINT,
      firmware: { ...structuredClone(FIRMWARE), name: 'attractap', variant: 'touch-v2', version: '2.14.0' },
    }),
  );
  const originalApply = readers.applySecurity.bind(readers);
  readers.applySecurity = async (id, patch, when) => {
    if (patch.secureBootDigest0) log.push('reader:digests');
    return await originalApply(id, patch, when);
  };
  const audit: AuditRecorder & { events: Array<{ action: string; details: unknown }> } = {
    events: [],
    async record(event) {
      this.events.push({ action: event.action, details: event.details });
    },
  } as never;

  const dir = mkdtempSync(join(tmpdir(), 'conversion-'));
  const files = { app: join(dir, 'app.bin'), bootloader: join(dir, 'bootloader.bin') };
  writeFileSync(files.app, Buffer.alloc(3 * 4096 + 100, 0xa5));
  writeFileSync(files.bootloader, Buffer.alloc(2 * 4096, 0x5a));
  const secureImages = {
    getSignedImage: jest.fn(
      async (_n: string, _v: string, kind: 'app' | 'bootloader', reader: { secureBootDigest0: string | null }) => {
        if (reader.secureBootDigest0 !== DIGESTS.digest0) throw new NotFoundException('No signing key for this reader');
        const path = files[kind];
        const size = statSync(path).size;
        return {
          path,
          size,
          keyDigest: DIGESTS.digest0,
          secureVersion: 1,
          profileMarker: 'attractap-secure-profile-v1',
        };
      },
    ),
  } as unknown as SecureImageService;
  const catalog = {
    name: 'attractap',
    variant: 'touch-v2',
    version: '2.14.0',
    chip: 'esp32s3',
    secureProfileHardwareTested: options.hardwareTested ?? true,
    secureImage: { partitionTableSha256: PARTITION_SHA },
  };
  const firmware = {
    getFirmwareDefinition: jest.fn(() => catalog),
    getSecureImageSource: jest.fn(() => ({ firmware: catalog, secureImage: catalog.secureImage })),
  } as unknown as AttractapFirmwareService;
  const keysState = {
    status: options.keysStatus ?? 'ready',
    signingKey: { digest: DIGESTS.digest0, fingerprint: '3'.repeat(64) },
    recoveryKey: { digest: DIGESTS.digest1, fingerprint: '4'.repeat(64) },
  };
  const keys = {
    getState: jest.fn(async () => keysState),
    signingKeyForReader: jest.fn(async (r: { secureBootDigest0: string | null }) =>
      r.secureBootDigest0 === DIGESTS.digest0 ? ({} as never) : null,
    ),
  } as unknown as SecureBootKeyService;

  const registry = new ConversionSessionRegistry();
  const conversionAudit = new ConversionAudit(audit);
  const images = new ConversionImages(secureImages);
  const expectations = new PreflightExpectations(firmware);
  const protocol = new ConversionProtocolService(conversions, readers, registry, expectations, conversionAudit);
  const transfer = new ConversionTransferService(conversions, images);
  const service = new SecureConversionService(
    conversions,
    readers,
    firmware,
    keys,
    registry,
    protocol,
    images,
    expectations,
    conversionAudit,
  );
  const efuse = { handle: jest.fn(async () => 'recorded') } as unknown as EfuseReportService;
  const control = new ReaderControlService(efuse, registry, protocol);
  const device = new EmulatedConversionDevice({ partitionTableSha256: PARTITION_SHA, faults: options.faults });

  let connection: FakeConnection | null = null;
  let state: SessionSecurityState | null = null;
  let pendingChunks: Array<Record<string, unknown>> = [];

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  };

  /** Opens a session: firmware info (build, capability) first, then the reader's conversion status. */
  async function connect(sendStatus = true) {
    connection = new FakeConnection();
    state = new SessionSecurityState(1, FINGERPRINT);
    state.secureConversion = options.secureConversion ?? true;
    state.conversionStopBeforeBurn = options.stopBeforeBurnBuild ?? false;
    state.setBuild({
      secureVersion: null,
      ...(options.build ?? { profile: device.profile, release: true, variant: 'touch-v2' }),
    });
    control.attach(connection as unknown as SessionConnection, state);
    device.reconnect();
    if (sendStatus) await fromReader([device.status()]);
  }

  async function fromReader(messages: Array<Record<string, unknown>>) {
    for (const message of messages) connection?.emit('control', Buffer.from(JSON.stringify(message)));
    await settle();
  }

  /** Exchanges messages and chunks until nothing moves. */
  async function pump(maxRounds = 200) {
    for (let round = 0; round < maxRounds; round++) {
      const sent = connection?.sent.splice(0) ?? [];
      const chunks = pendingChunks.splice(0);
      if (!sent.length && !chunks.length) return;
      for (const message of sent) {
        const out = device.onControl(message);
        pendingChunks.push(...out.chunkRequests);
        await fromReader(out.control);
      }
      for (const request of chunks) {
        const data = await transfer.chunk(state as SessionSecurityState, request as never);
        if (!data) continue;
        const out = device.onChunk(data);
        pendingChunks.push(...out.chunkRequests);
        await fromReader(out.control);
      }
    }
    throw new Error('conversion did not settle');
  }

  async function disconnect() {
    connection?.close();
    pendingChunks = [];
    await settle();
  }

  return {
    log,
    conversions,
    readers,
    audit,
    keysState,
    catalog,
    registry,
    protocol,
    service,
    device,
    connect,
    fromReader,
    pump,
    disconnect,
    settle,
    sentToReader: () => connection?.sent ?? [],
    efuse,
  };
}
