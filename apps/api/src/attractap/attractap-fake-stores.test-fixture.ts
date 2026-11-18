import type {
  AttractapCardOwner,
  AttractapCrashReportRecord,
  AttractapCrashSymbolication,
  AttractapCredentialEventRecord,
  AttractapFirmwareInfo,
  AttractapLinkedResource,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  AttractapPairingState,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderSecurityPatch,
  AttractapReaderWithResources,
  AttractapSecureBootKeyRecord,
  AttractapSecureBootKeyRole,
  NewAttractapCrashReport,
  NewAttractapNfcCard,
  NewAttractapNfcCardPendingChange,
  NewAttractapSecureBootKey,
} from '@attraccess/application-models';
import type { TransactionScope, UnitOfWork } from '../database/unit-of-work';
import type { AttractapCardStore } from './card-store.port';
import type { AttractapCrashReportStore } from './crash-report-store.port';
import type { AttractapReaderStore } from './reader-store.port';
import type { AttractapSecureBootKeyStore } from './secure-boot/secure-boot-key-store.port';
import type {
  AttractapCredentialStore,
  CredentialEventInput,
  CredentialPatch,
  ReaderCredentialRow,
} from './security/credential-store.port';

export const FIRMWARE: AttractapFirmwareInfo = {
  name: 'Reader',
  variant: 'standard',
  version: '1.0',
  capabilities: {
    resourceSelection: true,
    resourceActionSelection: false,
    cardEnrollment: true,
    hasLeds: false,
    cardRelay: true,
    ui: null,
    resetReason: null,
  },
};

export function makeReader(overrides: Partial<AttractapReader> = {}): AttractapReader {
  return {
    id: 1,
    name: 'Reader',
    apiTokenHash: 'hash',
    pairingState: 'paired',
    credentialFingerprint: null,
    secureBootDigest0: null,
    secureBootDigest1: null,
    secureBootSignerDigest: null,
    pairedAt: null,
    certificateNotAfter: null,
    certificateSerial: null,
    secured: false,
    securedAt: null,
    firmwareProfile: null,
    secureVersion: null,
    efuseSecureVersion: null,
    securityReportCheckedAt: null,
    securityReportProblems: null,
    lastConnection: new Date(0),
    firstConnection: new Date(0),
    ledBrightness: 255,
    allowPluginBle: false,
    firmware: structuredClone(FIRMWARE),
    ...overrides,
  };
}

export function makeResource(id: number): AttractapLinkedResource {
  return { id, name: `Resource ${id}` } as AttractapLinkedResource;
}

/** In-memory reader store with the same behaviour contract as the TypeORM adapter. */
export class FakeReaderStore implements AttractapReaderStore {
  readers = new Map<number, AttractapReader>();
  resources = new Map<number, AttractapLinkedResource>();
  edits: Array<{ id: number; edit: AttractapReaderEdit }> = [];
  private nextId = 1;

  add(reader: AttractapReader): AttractapReader {
    this.readers.set(reader.id, reader);
    return reader;
  }

  async findById(id: number): Promise<AttractapReaderWithResources | undefined> {
    const reader = this.readers.get(id);
    return reader ? ({ ...reader, resources: reader.resources ?? [] } as AttractapReaderWithResources) : undefined;
  }

  async list(filter: AttractapReaderFilter = {}): Promise<AttractapReader[]> {
    return [...this.readers.values()]
      .filter((reader) => filter.paired === undefined || (reader.pairingState === 'paired') === filter.paired)
      .filter((reader) => filter.resourceId === undefined || reader.resources?.some((r) => r.id === filter.resourceId))
      .map((reader) => (filter.withResources ? reader : { ...reader, resources: undefined }));
  }

  async listUnpaired(): Promise<AttractapReader[]> {
    return [...this.readers.values()].filter((reader) => reader.pairingState !== 'paired');
  }

  async create(input: { apiTokenHash: string; name: string; firmware?: AttractapFirmwareInfo }) {
    const reader = makeReader({ id: this.nextId++, ...input, pairingState: 'unpaired', firmware: input.firmware });
    this.readers.set(reader.id, reader);
    return reader;
  }

  async findResourcesByIds(ids: number[]): Promise<AttractapLinkedResource[]> {
    return ids.flatMap((id) => (this.resources.has(id) ? [this.resources.get(id)] : []));
  }

  async applyEdit(id: number, edit: AttractapReaderEdit): Promise<void> {
    this.edits.push({ id, edit });
    const reader = this.readers.get(id);
    if (!reader) return;
    if (edit.name !== undefined) reader.name = edit.name;
    if (edit.ledBrightness !== undefined) reader.ledBrightness = edit.ledBrightness;
    if (edit.allowPluginBle !== undefined) reader.allowPluginBle = edit.allowPluginBle;
    if (edit.firmware) reader.firmware = edit.firmware;
    if (edit.resourceIds)
      reader.resources = edit.resourceIds.map((rid) => this.resources.get(rid) ?? makeResource(rid));
  }

  async applySecurity(id: number, patch: AttractapReaderSecurityPatch, whenCredential?: string): Promise<boolean> {
    const reader = this.readers.get(id);
    if (!reader) return false;
    if (whenCredential !== undefined && (reader.pairingState !== 'paired' || reader.credentialFingerprint !== whenCredential)) {
      return false;
    }
    Object.assign(reader, patch);
    return true;
  }

  async recordConnection(id: number, at: Date): Promise<void> {
    const reader = this.readers.get(id);
    if (reader) reader.lastConnection = at;
  }

  async delete(id: number): Promise<boolean> {
    return this.readers.delete(id);
  }
}

export class FakeCardStore implements AttractapCardStore {
  cards: AttractapNfcCard[] = [];
  pending: AttractapNfcCardPendingChange[] = [];
  private nextId = 1;

  async findById(id: number) {
    return this.cards.find((card) => card.id === id);
  }
  async findByUid(uid: string) {
    return this.cards.find((card) => card.uid === uid);
  }
  async listForUser(userId: number) {
    return this.cards.filter((card) => card.user?.id === userId).map(({ user, ...card }) => ({ ...card, user }));
  }
  async listAll() {
    return [...this.cards];
  }
  async userHasActiveCard(userId: number) {
    return this.cards.some((card) => card.user?.id === userId && card.isActive);
  }
  async create(owner: AttractapCardOwner, card: NewAttractapNfcCard, activate: boolean): Promise<AttractapNfcCard> {
    if (activate) for (const other of this.cards) if (other.user?.id === owner.id) other.isActive = false;
    const created = {
      id: this.nextId++,
      ...card,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      lastSeen: new Date(0),
      isActive: activate,
      user: owner,
    };
    this.cards.push(created);
    return created;
  }
  async activateExclusively(id: number) {
    const card = this.cards.find((c) => c.id === id);
    if (!card) throw new Error(`Card with ID ${id} not found`);
    for (const other of this.cards) if (other.user?.id === card.user?.id) other.isActive = false;
    card.isActive = true;
    return card;
  }
  async deactivate(id: number) {
    const card = this.cards.find((c) => c.id === id);
    if (card) card.isActive = false;
  }
  async delete(id: number) {
    const index = this.cards.findIndex((card) => card.id === id);
    if (index >= 0) this.cards.splice(index, 1);
    return index >= 0;
  }
  async recordSeen(id: number, at: Date) {
    const card = this.cards.find((c) => c.id === id);
    if (card) card.lastSeen = at;
  }
  async findPendingEnroll(uid: string) {
    return this.pending.find((change) => change.uid === uid && change.kind === 'enroll') ?? null;
  }
  async listPendingEnrolls(uid: string) {
    return this.pending.filter((change) => change.uid === uid && change.kind === 'enroll');
  }
  async listPendingResets(uid: string) {
    return this.pending.filter((change) => change.uid === uid && change.kind === 'reset');
  }
  async savePending(change: NewAttractapNfcCardPendingChange) {
    const saved = { id: this.nextId++, createdAt: new Date(0), ...change };
    this.pending.push(saved);
    return saved;
  }
  async deletePendingById(ids: number | number[]) {
    const list = Array.isArray(ids) ? ids : [ids];
    this.pending = this.pending.filter((change) => !list.includes(change.id));
  }
  async deletePendingByUid(uid: string, kind: 'enroll' | 'reset') {
    this.pending = this.pending.filter((change) => !(change.uid === uid && change.kind === kind));
  }
}

export class FakeCrashReportStore implements AttractapCrashReportStore {
  reports: AttractapCrashReportRecord[] = [];
  symbolications: Array<{ id: number; result: AttractapCrashSymbolication }> = [];

  async create(report: NewAttractapCrashReport & { attractapId: number }) {
    const stored = {
      id: 7,
      createdAt: new Date(0),
      coredumpBuildId: null,
      symbolizedBacktrace: null,
      ...report,
    } as AttractapCrashReportRecord;
    this.reports.push(stored);
    return { ...stored };
  }
  async findOfReader(reportId: number, readerId: number) {
    const found = this.reports.find((r) => r.id === reportId && r.attractapId === readerId);
    return found ? { ...found, coredump: null } : null;
  }
  async findAwaiting(readerId: number, expected: { size: number; crc32: number }) {
    const found = [...this.reports]
      .reverse()
      .find(
        (r) =>
          r.attractapId === readerId &&
          r.coredumpStatus === 'awaiting' &&
          r.coredumpExpectedSize === expected.size &&
          r.coredumpExpectedCrc32 === expected.crc32,
      );
    return found ? { ...found, coredump: null } : null;
  }
  storedCoredumps: Array<{ id: number; attractapId: number; coredump: Uint8Array }> = [];
  /** What storeAwaitedCoredump answers; the real store answers false once the report no longer awaits. */
  storeAwaitedResult = true;
  async storeAwaitedCoredump(report: { id: number; attractapId: number }, coredump: Uint8Array) {
    if (!this.storeAwaitedResult) return false;
    this.storedCoredumps.push({ id: report.id, attractapId: report.attractapId, coredump });
    return true;
  }
  async updateSymbolication(reportId: number, result: AttractapCrashSymbolication) {
    this.symbolications.push({ id: reportId, result });
  }
  async listForReader(readerId: number) {
    return this.reports.filter((report) => report.attractapId === readerId).map((r) => ({ ...r, coredump: null }));
  }
  async findCoredump(readerId: number, reportId: number) {
    return this.reports.find((r) => r.id === reportId && r.attractapId === readerId)?.coredump ?? null;
  }
}

/** A unit of work that runs the work once and rolls the fake credential store back when it throws. */
export class FakeUnitOfWork implements UnitOfWork {
  rollbacks = 0;
  constructor(private readonly onRollback: () => void = () => undefined) {}
  current(): TransactionScope | undefined {
    return undefined;
  }
  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    const scope: TransactionScope = { isOpen: true, afterCommit: () => undefined };
    try {
      return await work(scope);
    } catch (error) {
      this.rollbacks++;
      this.onRollback();
      throw error;
    }
  }
}

export class FakeCredentialStore implements AttractapCredentialStore {
  rows = new Map<number, ReaderCredentialRow>();
  events: AttractapCredentialEventRecord[] = [];
  reads = 0;
  private nextEventId = 1;

  addReader(row: Partial<ReaderCredentialRow> & { id: number }) {
    this.rows.set(row.id, {
      name: 'Reader',
      pairingState: 'unpaired',
      credentialFingerprint: null,
      pairedAt: null,
      certificateNotAfter: null,
      certificateSerial: null,
      apiTokenHash: 'token-hash',
      ...row,
    });
  }

  /** Snapshot for a rollback: the fake store restores it when the unit of work fails. */
  snapshot(): () => void {
    const rows = new Map([...this.rows].map(([id, row]) => [id, { ...row }]));
    const events = [...this.events];
    return () => {
      this.rows = rows;
      this.events = events;
    };
  }

  async findState(readerId: number): Promise<{ state: AttractapPairingState; fingerprint: string | null } | null> {
    this.reads++;
    const row = this.rows.get(readerId);
    return row ? { state: row.pairingState, fingerprint: row.credentialFingerprint } : null;
  }
  async findPairedReaderIdByFingerprint(fingerprint: string) {
    return (
      [...this.rows.values()].find((row) => row.pairingState === 'paired' && row.credentialFingerprint === fingerprint)
        ?.id ?? null
    );
  }
  async readCredential(_scope: TransactionScope, readerId: number) {
    const row = this.rows.get(readerId);
    return row ? { ...row } : null;
  }
  async updateCredential(_scope: TransactionScope, readerId: number, patch: CredentialPatch) {
    Object.assign(this.rows.get(readerId), patch);
  }
  async appendEvent(_scope: TransactionScope, event: CredentialEventInput) {
    this.events.push({ id: this.nextEventId++, createdAt: new Date(), ...event });
  }
  async updateCertificateIfActive(
    readerId: number,
    fingerprint: string,
    certificate: { serial: string; notAfter: Date },
  ) {
    const row = this.rows.get(readerId);
    if (row?.pairingState === 'paired' && row.credentialFingerprint === fingerprint) {
      row.certificateSerial = certificate.serial;
      row.certificateNotAfter = certificate.notAfter;
    }
  }
  async history(readerId: number) {
    return this.events.filter((event) => event.readerId === readerId).reverse();
  }
}

export class FakeSecureBootKeyStore implements AttractapSecureBootKeyStore {
  keys: AttractapSecureBootKeyRecord[] = [];
  burned: string[] = [];
  private nextId = 1;

  async latest(role: AttractapSecureBootKeyRole) {
    return [...this.keys].reverse().find((key) => key.role === role) ?? null;
  }
  async count() {
    return this.keys.length;
  }
  async findByDigest(digest: string) {
    return this.keys.find((key) => key.digest === digest) ?? null;
  }
  async listWithPrivateKey() {
    return [...this.keys].reverse().filter((key) => key.privateKeyEncrypted !== null);
  }
  async countReadersWithBurnedDigest(digest?: string) {
    return digest ? this.burned.filter((d) => d.toLowerCase() === digest.toLowerCase()).length : this.burned.length;
  }
  async remove(_scope: TransactionScope, role?: AttractapSecureBootKeyRole) {
    this.keys = role ? this.keys.filter((key) => key.role !== role) : [];
  }
  async insert(_scope: TransactionScope, key: NewAttractapSecureBootKey) {
    const stored = { id: this.nextId++, createdAt: new Date(0), ...key };
    this.keys.push(stored);
    return stored;
  }
  async markRecoveryVerified(id: number, verifiedAt: Date) {
    const key = this.keys.find((k) => k.id === id);
    if (key) Object.assign(key, { privateKeyEncrypted: null, verifiedAt });
  }
}
