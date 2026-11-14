// An in-memory stand-in for the sidecar's fabric and backup behaviour (ATT-998), shared by the HTTP `FakeSidecar` and
// the in-process connection the service tests use. It mirrors the contract: fabric.create, snapshots, and the
// two-phase restore (stage -> commit -> finalize | rollback, or abort), with fault injection.
import { COMPATIBILITY_TABLE, STORAGE_SCHEMA_VERSION, type OperationId } from '@attraccess/matter-contract';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SidecarRequestError, SidecarTimeoutError, SidecarUnavailableError } from '../client/errors';

export class FakeSidecarError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Storage = {
  fabricId: string;
  rootCertFingerprint: string;
  storageInstanceId: string;
  generation: number;
  /** Stands for the fabric's keys: opaque, and visible only inside payloads. */
  secret: string;
};

export type FabricFaults = {
  /** Commit fails and the sidecar swaps back itself (409 restore_failed). */
  commitRestoreFailed?: boolean;
  /** Commit takes effect, but the answer never arrives (timeout): the outcome is unknown to the plugin. */
  commitTimeoutAfterSwap?: boolean;
  /** Commit never takes effect and times out. */
  commitTimeout?: boolean;
  /**
   * Commit swaps the staged storage in, it does not verify, and putting the previous storage back fails too: the
   * sidecar needs recovery and answers 409 `recovery_required` (not `restore_failed`).
   */
  commitEndsInRecovery?: boolean;
  rollbackFails?: boolean;
  /** Rollback cannot put the previous storage back: the sidecar needs recovery and answers 409 `recovery_required`. */
  rollbackEndsInRecovery?: boolean;
  finalizeFails?: boolean;
  /** The next stage call refuses the payload (422 invalid_backup). */
  stageRejects?: boolean;
  snapshotFails?: boolean;
  /** Added to every snapshot's generation: a snapshot that does not match what the plugin recorded. */
  snapshotGenerationSkew?: number;
};

const entry = COMPATIBILITY_TABLE[0];
const hex = (bytes: number) => randomBytes(bytes).toString('hex');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

type Input = Record<string, unknown> & { header?: Record<string, unknown> };

export class FakeFabricBackend {
  state: 'uninitialized' | 'initialized' | 'recovery_required' = 'uninitialized';
  reason: string | null = null;
  storage: Storage | null = null;
  /** Generation survives an empty fabric, like a counter in the metadata file. */
  generationCounter = 0;
  insecure = false;
  busy = false;
  faults: FabricFaults = {};
  readonly calls: string[] = [];
  emit: ((type: 'fabric.changed', payload: Record<string, unknown>) => void) | null = null;
  /** Like the real sidecar: one stage at a time, and a new one discards the previous. */
  private staged: { stageId: string; storage: Storage } | null = null;
  private rollbackCopy: Storage | null = null;
  private previousState: { state: FakeFabricBackend['state']; reason: string | null } | null = null;
  /** The committed restore that can still be rolled back or finalized. */
  private pendingStageId: string | null = null;
  private fabricsCreated = 0;

  /** Puts the sidecar into the state of one that holds a fabric. */
  seedFabric(fabricId = '1234567890123', generation = 1): Storage {
    this.storage = {
      fabricId,
      rootCertFingerprint: hex(32),
      storageInstanceId: randomUUID(),
      generation,
      secret: `secret-${hex(8)}`,
    };
    this.generationCounter = generation;
    this.state = 'initialized';
    this.reason = null;
    return this.storage;
  }

  enterRecovery(reason = 'storage_corrupt'): void {
    this.state = 'recovery_required';
    this.reason = reason;
  }

  clear(): void {
    this.storage = null;
    this.state = 'uninitialized';
    this.reason = null;
  }

  fabric() {
    const s = this.state === 'initialized' ? this.storage : null;
    return {
      state: this.state,
      reason: this.state === 'recovery_required' ? this.reason : null,
      fabricId: s?.fabricId ?? null,
      // The real sidecar reports 0 while it has no healthy fabric.
      fabricGeneration: s ? this.generationCounter : 0,
      rootCertFingerprint: s?.rootCertFingerprint ?? null,
      storageInstanceId: s?.storageInstanceId ?? null,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    };
  }

  private changed(): void {
    this.emit?.('fabric.changed', {
      fabricGeneration: this.fabric().fabricGeneration,
      fabricId: this.storage?.fabricId ?? null,
      state: this.state,
    });
  }

  /** Every backup operation: refused over insecure transport, and one at a time like the real sidecar's gate. */
  private gate(): void {
    if (this.insecure) {
      throw new FakeSidecarError(403, 'insecure_transport', 'Secrets are not sent over plain HTTP to another machine.');
    }
    if (this.busy) throw new FakeSidecarError(409, 'busy', 'Busy.');
  }

  /** The generation the live storage holds: 0 without a healthy fabric, like the real metadata. */
  private liveGeneration(): number {
    return this.state === 'initialized' && this.storage ? this.generationCounter : 0;
  }

  /** A restore that could put neither storage in place: the sidecar keeps both and needs recovery. */
  private failIntoRecovery(): never {
    this.state = 'recovery_required';
    this.reason = 'restore_interrupted';
    this.rollbackCopy = this.previousState = this.pendingStageId = null;
    this.changed();
    throw new FakeSidecarError(409, 'recovery_required', 'The restore could not be completed or undone.', {
      reason: 'restore_interrupted',
    });
  }

  handle(operation: OperationId, body: unknown): unknown {
    this.calls.push(operation);
    const input = (body ?? {}) as Input;
    const handler = this.operations()[operation];
    if (!handler) throw new FakeSidecarError(404, 'not_found', 'Unknown operation.');
    return handler(input);
  }

  /** One small function per operation, so no single function grows past what a reader can hold. */
  private operations(): Partial<Record<OperationId, (input: Input) => unknown>> {
    return {
      'fabric.get': () => this.fabric(),
      'fabric.create': () => {
        if (this.state === 'recovery_required')
          throw new FakeSidecarError(409, 'recovery_required', 'Recovery required.');
        if (this.busy) throw new FakeSidecarError(409, 'busy', 'Busy.');
        if (this.state === 'initialized') throw new FakeSidecarError(409, 'fabric_exists', 'A fabric exists.');
        // Fresh storage starts at generation 1, like the real sidecar's new metadata file.
        this.generationCounter = 1;
        this.fabricsCreated += 1;
        this.storage = {
          fabricId: String(1_000_000 + this.fabricsCreated * 7),
          rootCertFingerprint: hex(32),
          storageInstanceId: randomUUID(),
          generation: this.generationCounter,
          secret: `secret-${hex(8)}`,
        };
        this.state = 'initialized';
        this.changed();
        return this.fabric();
      },
      'backup.snapshot': () => {
        this.gate();
        if (this.state === 'recovery_required') {
          throw new FakeSidecarError(409, 'recovery_required', 'The storage needs recovery.');
        }
        if (this.state !== 'initialized' || !this.storage) {
          throw new FakeSidecarError(409, 'fabric_absent', 'There is no fabric to back up.');
        }
        if (this.faults.snapshotFails) throw new FakeSidecarError(500, 'internal_error', 'Snapshot failed.');
        const payload = Buffer.from(JSON.stringify({ ...this.storage }), 'utf8');
        return {
          header: {
            storageSchemaVersion: STORAGE_SCHEMA_VERSION,
            sidecarVersion: entry.sidecar,
            matterJsVersion: entry.matterJs,
            fabricId: this.storage.fabricId,
            rootCertFingerprint: this.storage.rootCertFingerprint,
            fabricGeneration: this.generationCounter + (this.faults.snapshotGenerationSkew ?? 0),
            storageInstanceId: this.storage.storageInstanceId,
            payloadSha256: sha256(payload),
            payloadBytes: payload.length,
            createdAt: new Date().toISOString(),
          },
          payload: payload.toString('base64'),
        };
      },
      'backup.restore.stage': (input) => {
        this.gate();
        this.staged = null;
        const payload = Buffer.from(String(input.payload ?? ''), 'base64');
        const header = input.header ?? {};
        let parsed: Storage;
        try {
          if (this.faults.stageRejects) throw new Error('rejected');
          if (header.payloadSha256 !== sha256(payload) || header.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
            throw new Error('mismatch');
          }
          parsed = JSON.parse(payload.toString('utf8')) as Storage;
          if (!parsed.fabricId) throw new Error('shape');
        } catch {
          throw new FakeSidecarError(422, 'invalid_backup', 'The snapshot is not valid.');
        }
        const stageId = randomUUID();
        this.staged = { stageId, storage: { ...parsed, generation: Number(header.fabricGeneration) } };
        return {
          stageId,
          fabricId: parsed.fabricId,
          rootCertFingerprint: parsed.rootCertFingerprint,
          fabricGeneration: header.fabricGeneration,
          storageInstanceId: parsed.storageInstanceId,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      },
      'backup.restore.commit': (input) => {
        this.gate();
        if (this.staged?.stageId !== String(input.stageId)) {
          throw new FakeSidecarError(404, 'not_found', 'Unknown stage.');
        }
        const staged = this.staged.storage;
        if (this.faults.commitRestoreFailed) {
          throw new FakeSidecarError(409, 'restore_failed', 'The restored storage did not verify; swapped back.');
        }
        if (this.faults.commitTimeout)
          throw new SidecarTimeoutError('The request timed out.', { outcome: 'uncertain' });
        this.rollbackCopy = this.storage ? { ...this.storage, generation: this.generationCounter } : null;
        this.previousState = { state: this.state, reason: this.reason };
        this.generationCounter = Math.max(staged.generation, this.liveGeneration()) + 1;
        this.storage = { ...staged, generation: this.generationCounter };
        this.state = 'initialized';
        this.reason = null;
        this.pendingStageId = this.staged.stageId;
        this.staged = null;
        this.changed();
        if (this.faults.commitEndsInRecovery) this.failIntoRecovery();
        if (this.faults.commitTimeoutAfterSwap) {
          throw new SidecarTimeoutError('The request timed out.', { outcome: 'uncertain' });
        }
        return { state: 'committed', fabric: this.fabric() };
      },
      'backup.restore.rollback': (input) => {
        this.gate();
        if (this.faults.rollbackFails) throw new FakeSidecarError(500, 'internal_error', 'Rollback failed.');
        if (!this.previousState || this.pendingStageId !== String(input.stageId)) {
          throw new FakeSidecarError(404, 'not_found', 'There is no restore to roll back.');
        }
        if (this.faults.rollbackEndsInRecovery) this.failIntoRecovery();
        // A plugin-driven rollback moves the generation past the committed one, so it never looks like going back.
        const committed = this.generationCounter;
        this.storage = this.rollbackCopy;
        this.state = this.previousState.state;
        this.reason = this.previousState.reason;
        this.generationCounter = committed + 1;
        this.rollbackCopy = this.previousState = this.pendingStageId = null;
        this.changed();
        return { state: 'rolled_back', fabric: this.fabric() };
      },
      'backup.restore.finalize': (input) => {
        this.gate();
        if (this.faults.finalizeFails) throw new FakeSidecarError(500, 'internal_error', 'Finalize failed.');
        if (this.pendingStageId !== String(input.stageId)) {
          throw new FakeSidecarError(404, 'not_found', 'There is no restore to finalize.');
        }
        this.rollbackCopy = this.previousState = this.pendingStageId = null;
        return { state: 'finalized', fabric: this.fabric() };
      },
      'backup.restore.abort': (input) => {
        this.gate();
        if (this.staged?.stageId === String(input.stageId)) this.staged = null;
        return { state: 'aborted', fabric: this.fabric() };
      },
    };
  }
}

type Handler<T> = (value: T) => void;

/**
 * The in-process connection the services are tested against: the part of `SidecarConnection` they use, backed by a
 * `FakeFabricBackend`. Failures arrive as the same typed client errors the real client throws.
 */
export class FakeFabricConnection {
  state: 'connected' | 'degraded' | 'connecting' = 'connected';
  insecureTransport = false;
  readonly requests: string[] = [];
  /** The last body of each operation, for assertions on what was sent. */
  readonly bodies: Record<string, unknown> = {};
  private readonly stateHandlers = new Set<Handler<unknown>>();
  private readonly eventHandlers = new Set<Handler<{ event: { type: string; payload: unknown } }>>();

  constructor(readonly backend: FakeFabricBackend) {
    backend.emit = (type, payload) => this.emitEvent(type, payload);
  }

  status() {
    return {
      state: this.state,
      reason: this.state === 'connected' ? null : 'unavailable',
      insecureTransport: this.insecureTransport,
      capabilities: null,
    };
  }

  /** What `inventory.list` answers, so a reconciliation can run against this sidecar. */
  nodes: unknown[] = [];

  async request(operation: OperationId, options: { body?: unknown } = {}): Promise<unknown> {
    this.requests.push(operation);
    this.bodies[operation] = options.body;
    if (this.state !== 'connected') throw new SidecarUnavailableError('The Matter sidecar is not connected.');
    if (operation === 'inventory.list') {
      return {
        authoritative: true,
        fabricId: this.backend.state === 'initialized' ? (this.backend.storage?.fabricId ?? null) : null,
        nodes: this.nodes,
      };
    }
    try {
      return this.backend.handle(operation, options.body);
    } catch (error) {
      if (error instanceof FakeSidecarError) {
        throw new SidecarRequestError(error.message, {
          code: error.code as never,
          status: error.status,
          details: error.details,
        });
      }
      throw error;
    }
  }

  onStateChange(handler: Handler<unknown>): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onEvent(handler: Handler<{ event: { type: string; payload: unknown } }>): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onReconciliationRequired = () => () => undefined;

  setState(state: FakeFabricConnection['state']): void {
    this.state = state;
    for (const handler of this.stateHandlers) handler(this.status());
  }

  emitEvent(type: string, payload: unknown): void {
    for (const handler of this.eventHandlers) handler({ event: { type, payload } });
  }
}
