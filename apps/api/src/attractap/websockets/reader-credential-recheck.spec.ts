import { FakeCredentialStore, FakeUnitOfWork } from '../attractap-fake-stores.test-fixture';
import { CredentialRegistryService } from '../security/credential-registry.service';
import type { ReaderCredentialRow } from '../security/credential-store.port';
import { CREDENTIAL_CHANGED_EVENT } from '../security/pairing-model';
import { CREDENTIAL_RECHECK_EVERY_MS, ReaderCredentialRecheck } from './reader-credential-recheck';
import { remoteEvent } from './reader-event-relay';
import type { AuthenticatedWebSocket } from './websocket.types';

/** A revoke or re-pair made on another API instance whose message was lost (ATT-1163). */
describe('ReaderCredentialRecheck', () => {
  let store: FakeCredentialStore;
  let registry: CredentialRegistryService;
  let sockets: Map<string, AuthenticatedWebSocket>;
  let events: { emit: jest.Mock };

  const recheck = (clusterEnabled = true) =>
    new ReaderCredentialRecheck(
      { sockets } as never,
      registry,
      { cluster: { enabled: clusterEnabled } } as never,
      events as never,
    );

  const paired = (id: number, fingerprint: string): Partial<ReaderCredentialRow> & { id: number } => ({
    id,
    pairingState: 'paired',
    credentialFingerprint: fingerprint,
  });

  /** A reader socket signed in with the key `fingerprint`. */
  const connect = (socketId: string, readerId: number | null, fingerprint?: string) =>
    sockets.set(socketId, {
      id: socketId,
      readerId,
      ...(fingerprint ? { sessionSecurity: { fingerprint } } : {}),
    } as unknown as AuthenticatedWebSocket);

  const credentialChanged = () =>
    events.emit.mock.calls.filter(([name]) => name === remoteEvent(CREDENTIAL_CHANGED_EVENT)).map(([, id]) => id);

  beforeEach(() => {
    store = new FakeCredentialStore();
    registry = new CredentialRegistryService(store, new FakeUnitOfWork());
    sockets = new Map();
    events = { emit: jest.fn() };
  });

  afterEach(() => jest.useRealTimers());

  it('ends nothing while every held credential is still active', async () => {
    store.addReader(paired(1, 'fp-1'));
    store.addReader(paired(2, 'fp-2'));
    connect('s1', 1, 'fp-1');
    connect('s2', 2, 'fp-2');

    await recheck().recheck();

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('ends the sockets of a reader revoked elsewhere, although the cache still says paired', async () => {
    store.addReader(paired(1, 'fp-1'));
    store.addReader(paired(2, 'fp-2'));
    connect('s1', 1, 'fp-1');
    connect('s2', 2, 'fp-2');
    expect(await registry.isActive(1, 'fp-1')).toBe(true);
    store.addReader({ ...paired(1, 'fp-1'), pairingState: 'revoked' });

    await recheck().recheck();

    expect(credentialChanged()).toEqual([1]);
  });

  it('ends a reader one of whose sockets still uses the key it was re-paired away from', async () => {
    store.addReader(paired(3, 'new'));
    connect('current', 3, 'new');
    connect('stale', 3, 'old');

    await recheck().recheck();

    expect(credentialChanged()).toEqual([3]);
  });

  it('skips sockets that are not signed in as a reader with a session key', async () => {
    connect('signing-in', null, 'fp');
    connect('no-session', 4);

    await recheck().recheck();

    expect(store.reads).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('goes on with the other readers when one cannot be checked', async () => {
    store.addReader(paired(2, 'fp-2'));
    store.addReader({ ...paired(2, 'fp-2'), pairingState: 'revoked' });
    connect('s1', 1, 'fp-1');
    connect('s2', 2, 'fp-2');
    const findState = store.findState.bind(store);
    store.findState = async (readerId: number) => {
      if (readerId === 1) throw new Error('database down');
      return findState(readerId);
    };

    await recheck().recheck();

    expect(credentialChanged()).toEqual([2]);
  });

  it('checks every interval with several instances, and never without', async () => {
    jest.useFakeTimers();
    store.addReader({ ...paired(1, 'fp-1'), pairingState: 'revoked' });
    connect('s1', 1, 'fp-1');

    const single = recheck(false);
    single.onModuleInit();
    await jest.advanceTimersByTimeAsync(CREDENTIAL_RECHECK_EVERY_MS * 2);
    expect(events.emit).not.toHaveBeenCalled();

    const clustered = recheck(true);
    clustered.onModuleInit();
    await jest.advanceTimersByTimeAsync(CREDENTIAL_RECHECK_EVERY_MS);
    expect(credentialChanged()).toEqual([1]);
    clustered.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(CREDENTIAL_RECHECK_EVERY_MS * 2);
    expect(credentialChanged()).toEqual([1]);
  });
});
