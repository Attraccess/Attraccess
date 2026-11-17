import type { AuditEntry, AuditEntryDraft } from '@attraccess/application-models';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Registry } from 'prom-client';
import { createAuditMetrics } from '../metrics/definitions/audit.metrics';
import type { SettingsStoreService } from '../settings/settings-store.service';
import {
  AuditAppendResult,
  AuditStore,
  AuditStoreOpenResult,
  AuditTransaction,
  AuditTransactionAbortedError,
  DurableAppendControl,
} from './audit-persistence.port';
import { AuditService } from './audit.service';
import { MAX_PENDING_AUDIT_WRITES } from './persistence/audit-storage';
import type { AuditEvent } from './recorder/audit-event';

/** An in-memory AuditStore: it records what the application asked for and answers with scripted results. */
class FakeAuditStore implements AuditStore {
  isOpen = false;
  openResult: AuditStoreOpenResult = { status: 'ready' };
  durable: AuditEntryDraft[] = [];
  transactional: Array<{ transaction: AuditTransaction; entry: AuditEntryDraft }> = [];
  durableResult: (control: DurableAppendControl) => AuditAppendResult | Promise<AuditAppendResult> = () => ({
    status: 'stored',
  });
  transactionalResult: () => AuditAppendResult = () => ({ status: 'stored' });
  deleteBatches: number[] = [];
  entries: AuditEntry[] = [];
  closed = false;
  readonly transaction: AuditTransaction = { settingsHandle: undefined };
  activeFor = new WeakSet<object>();

  async open() {
    if (this.openResult.status === 'ready') this.isOpen = true;
    return this.openResult;
  }
  async close() {
    this.isOpen = false;
    this.closed = true;
  }
  activeTransaction(ref: object | undefined) {
    return ref && this.activeFor.has(ref) ? this.transaction : undefined;
  }
  async appendInTransaction(transaction: AuditTransaction, entry: AuditEntryDraft) {
    this.transactional.push({ transaction, entry });
    return this.transactionalResult();
  }
  async appendDurably(entry: AuditEntryDraft, control: DurableAppendControl) {
    const result = await this.durableResult(control);
    if (result.status === 'stored') this.durable.push(entry);
    return result;
  }
  async deleteExpired() {
    return this.deleteBatches.shift() ?? 0;
  }
  async findEntries() {
    return { entries: this.entries, hasMore: false };
  }
  async findCurrentNames() {
    return new Map<number, string>();
  }
}

const event: AuditEvent = {
  domain: 'resource',
  action: 'resource.deleted',
  actor: { id: 1, authenticationMethod: 'session' },
  subject: { type: 'resource', id: 7 },
  details: { 'before.name': 'Lathe', 'before.type': 'machine' },
};

function setup(settings: Record<string, string> = {}) {
  const store = new FakeAuditStore();
  const getPlainSetting = jest.fn(async (_parent: string, key: string) => settings[key] ?? null);
  const metrics = createAuditMetrics(new Registry());
  const service = new AuditService(store, { getPlainSetting } as unknown as SettingsStoreService, metrics);
  return { store, service, metrics, getPlainSetting };
}

const dropped = async (metrics: ReturnType<typeof setup>['metrics']) =>
  Object.fromEntries(
    (await metrics.recordsDropped.get()).values
      .filter(({ value }) => value > 0)
      .map(({ labels, value }) => [`${labels.domain}:${labels.reason}`, value]),
  );

describe('AuditService on a fake audit store', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens the store on init and closes it on destroy', async () => {
    const { store, service } = setup();
    await service.onModuleInit();
    expect(store.isOpen).toBe(true);
    await service.onModuleDestroy();
    expect(store.closed).toBe(true);
  });

  it('reports an unsupported or failed store without throwing and keeps recording as storage_unavailable', async () => {
    const { store, service, metrics } = setup();
    store.openResult = { status: 'failed', code: 'SQLITE_CANTOPEN' };
    store.durableResult = () => ({ status: 'refused', reason: 'storage_unavailable' });
    await service.onModuleInit();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Audit storage initialization failed: SQLITE_CANTOPEN');
    expect(await service.record(event)).toEqual({ status: 'unavailable' });
    expect(await dropped(metrics)).toEqual({ 'resource:storage_unavailable': 1 });
  });

  it('writes an event without a caller transaction durably and reports it recorded', async () => {
    const { store, service } = setup();
    await service.onModuleInit();
    expect(await service.record(event)).toEqual({ status: 'recorded' });
    expect(store.durable).toHaveLength(1);
    expect(store.durable[0]).toMatchObject({ domain: 'resource', action: 'resource.deleted', subjectId: 7 });
    expect(store.transactional).toEqual([]);
  });

  it('writes inside the caller transaction when the store reports it active, and reads settings through it', async () => {
    const { store, service, getPlainSetting } = setup();
    const scope = {};
    store.activeFor.add(scope);
    expect(await service.record(event, scope)).toEqual({ status: 'recorded' });
    expect(store.transactional).toHaveLength(1);
    expect(store.durable).toEqual([]);
    expect(getPlainSetting).toHaveBeenCalledWith('audit', 'enabled', store.transaction.settingsHandle);
  });

  it('writes durably when the handed transaction is not active', async () => {
    const { store, service } = setup();
    expect(await service.record(event, {})).toEqual({ status: 'recorded' });
    expect(store.durable).toHaveLength(1);
  });

  it('does not write when the domain is switched off, and does not count that as a drop', async () => {
    const { store, service, metrics } = setup({ domains: '["project"]' });
    expect(await service.record(event)).toEqual({ status: 'unavailable' });
    expect(store.durable).toEqual([]);
    expect(await dropped(metrics)).toEqual({});
  });

  it('drops an invalid event without touching the store', async () => {
    const { store, service, metrics } = setup();
    expect(await service.record({ ...event, action: 'resource.nonsense' } as never)).toEqual({ status: 'unavailable' });
    expect(store.durable).toEqual([]);
    expect(await dropped(metrics)).toEqual({ 'resource:invalid_event': 1 });
  });

  it('counts and logs a failed durable write with the driver code only', async () => {
    const { store, service, metrics } = setup();
    store.durableResult = () => ({
      status: 'failed',
      error: new Error('secret path /data/x.sqlite'),
      code: 'SQLITE_IOERR',
    });
    expect(await service.record(event)).toEqual({ status: 'unavailable' });
    expect(await dropped(metrics)).toEqual({ 'resource:storage_error': 1 });
    const line = String((Logger.prototype.error as jest.Mock).mock.calls[0][0]);
    expect(line).toContain('code=SQLITE_IOERR');
    expect(line).not.toContain('secret');
  });

  it('counts a failed in-transaction insert but lets the caller continue', async () => {
    const { store, service, metrics } = setup();
    const scope = {};
    store.activeFor.add(scope);
    store.transactionalResult = () => ({ status: 'failed', error: new Error('x'), code: 'SQLITE_CONSTRAINT' });
    expect(await service.record(event, scope)).toEqual({ status: 'unavailable' });
    expect(await dropped(metrics)).toEqual({ 'resource:storage_error': 1 });
  });

  it('counts and rethrows a transaction the database discarded', async () => {
    const { store, service, metrics } = setup();
    const scope = {};
    store.activeFor.add(scope);
    store.transactionalResult = () => {
      throw new AuditTransactionAbortedError('SQLITE_FULL');
    };
    await expect(service.record(event, scope)).rejects.toBeInstanceOf(AuditTransactionAbortedError);
    expect(await dropped(metrics)).toEqual({ 'resource:storage_error': 1 });
    expect(String((Logger.prototype.error as jest.Mock).mock.calls[0][0])).toContain('code=SQLITE_FULL');
  });

  it('passes the process state to a durable write: a drain that ran out of time refuses the write', async () => {
    const { store, service, metrics } = setup();
    let control!: DurableAppendControl;
    store.durableResult = (given) => {
      control = given;
      return { status: 'refused', reason: 'shutting_down' };
    };
    expect(control).toBeUndefined();
    await service.record(event);
    expect(control.refusal()).toBeUndefined();
    expect(control.isStopping()).toBe(false);
    expect(await dropped(metrics)).toEqual({ 'resource:shutting_down': 1 });
    (service as unknown as { state: { stopping: boolean; drainExpired: boolean } }).state.stopping = true;
    (service as unknown as { state: { stopping: boolean; drainExpired: boolean } }).state.drainExpired = true;
    expect(control.isStopping()).toBe(true);
    expect(control.refusal()).toBe('shutting_down');
  });

  it('refuses new durable writes once shutdown started, without asking the store', async () => {
    const { store, service, metrics } = setup();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(await service.record(event)).toEqual({ status: 'unavailable' });
    expect(store.durable).toEqual([]);
    expect(await dropped(metrics)).toEqual({ 'resource:shutting_down': 1 });
  });

  it('drops writes beyond the pending cap as queue_full while earlier ones wait on the store', async () => {
    const { store, service, metrics } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    store.durableResult = async () => {
      await gate;
      return { status: 'stored' };
    };
    const queued = Array.from({ length: MAX_PENDING_AUDIT_WRITES }, () => service.record(event));
    expect(await service.record(event)).toEqual({ status: 'unavailable' });
    expect(await dropped(metrics)).toEqual({ 'resource:queue_full': 1 });
    release();
    expect((await Promise.all(queued)).every((receipt) => receipt.status === 'recorded')).toBe(true);
  });

  it('keeps the order in which durable writes were requested', async () => {
    const { store, service } = setup();
    const order: string[] = [];
    store.appendDurably = async (entry) => {
      order.push(String(entry.subjectId));
      return { status: 'stored' };
    };
    await Promise.all([1, 2, 3].map((id) => service.record({ ...event, subject: { type: 'resource', id } })));
    expect(order).toEqual(['1', '2', '3']);
  });

  it('retention deletes in batches of 1000 until a batch comes back short', async () => {
    const { store, service } = setup();
    const deleteExpired = jest.spyOn(store, 'deleteExpired');
    store.deleteBatches = [1000, 1000, 17];
    await service.onModuleInit();
    expect(deleteExpired).toHaveBeenCalledTimes(3);
    expect(deleteExpired).toHaveBeenCalledWith(expect.any(Date), 1000, expect.any(Function));
  });

  it('retention never runs against a closed store, and swallows a failing store', async () => {
    const { store, service } = setup();
    const deleteExpired = jest.spyOn(store, 'deleteExpired');
    await service.cleanup();
    expect(deleteExpired).not.toHaveBeenCalled();
    store.isOpen = true;
    deleteExpired.mockRejectedValueOnce(new Error('db gone'));
    await expect(service.cleanup()).resolves.toBeUndefined();
  });

  it('reads through the store while open and refuses reads when closed', async () => {
    const { store, service } = setup();
    await expect(service.read(async () => 1)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await service.onModuleInit();
    expect(
      await service.read(async (reader) => (await reader.findEntries({ notBefore: new Date(0) }, 5)).hasMore),
    ).toBe(false);
    expect(store.isOpen).toBe(true);
  });
});
