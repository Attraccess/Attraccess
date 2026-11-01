/* eslint-disable @typescript-eslint/no-explicit-any */
import { READER_UI_SLOTS } from '@attraccess/plugins-backend-sdk';
import { CardSessionService } from './card-session.service';
import { isUiMessageSuperseded, UI_INVALIDATE_DEBOUNCE_MS, UiSlotService } from './ui-slot.service';
import { lastSent, makeSocket } from './ui-test-helpers.test-fixture';

const TOUCH_UI = {
  schemaVersion: 1,
  components: ['col', 'row', 'text', 'badge', 'icon', 'progress', 'countdown', 'spacer'],
  slots: Object.values(READER_UI_SLOTS),
  steps: ['confirm', 'choose', 'info'],
  maxPayloadBytes: 3072,
  maxNodes: 32,
  maxDepth: 5,
  maxLiveNodes: 64,
  display: { w: 480, h: 480, touch: true },
  input: { touch: true, buttons: 0, cardHold: true },
  feedback: { leds: false, beeper: true },
  charset: 'latin1',
  images: false,
};

interface SetupOptions {
  suspended?: boolean;
  widgets?: boolean;
  resources?: number[];
  providers?: { plugin: string; provider: { getSlotContributions: (ctx: any) => any } }[];
}

function setup(contributions: (ctx: any) => any, opts: SetupOptions = {}) {
  const providers = opts.providers ?? [
    { plugin: 'reservations', provider: { getSlotContributions: jest.fn(async (ctx: any) => contributions(ctx)) } },
  ];
  const registry = { providers: () => providers };
  const settings = {
    widgetToggles: jest.fn(async () => ({ readerEnabled: opts.widgets ?? true, disabled: new Set<string>() })),
  };
  const alerts = { isReaderSuspended: () => opts.suspended ?? false, onCleared: jest.fn() };
  const attractap = {
    findReaderById: jest.fn(async () => ({ id: 5, resources: (opts.resources ?? [12]).map((id) => ({ id })) })),
  };
  const sockets = new Map<string, any>();
  const cardSessions = new CardSessionService();
  const settingsService = { getDefaultLanguage: jest.fn().mockResolvedValue('de') };
  const service = new UiSlotService(
    registry as never,
    settings as never,
    alerts as never,
    attractap as never,
    { sockets } as never,
    cardSessions,
    settingsService as never,
  );
  const socket = makeSocket();
  sockets.set(socket.id, socket);
  return { service, socket, settings, cardSessions, registry, attractap, sockets, providers };
}

const header = (text: string, extra: Record<string, unknown> = {}) => ({
  slotId: READER_UI_SLOTS.RESOURCE_DETAILS_HEADER,
  key: 'state',
  tree: { t: 'text', text },
  ...extra,
});
const session = (text: string) => ({
  slotId: READER_UI_SLOTS.RESOURCE_DETAILS_SESSION,
  key: 's',
  tree: { t: 'text', text },
});
const updates = (socket: any) =>
  socket.sendMessage.mock.calls.map((c: any[]) => c[0].data).filter((d: any) => d.type === 'UI_SLOT_UPDATE');
const shapes = (socket: any) =>
  updates(socket).map((u: any) => `${u.payload.key}@${u.payload.revision}:${u.payload.tree?.text ?? 'null'}`);

describe('UiSlotService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does the initial full sync after the firmware info with revision 1', async () => {
    const { service, socket } = setup(() => [header('Free until 14:00')]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)).toHaveLength(1);
    expect(updates(socket)[0].payload).toMatchObject({
      resourceId: 12,
      slot: 'resource.details.header',
      revision: 1,
      owner: 'reservations',
      key: 'state',
      tree: { t: 'text', text: 'Free until 14:00' },
    });
  });

  it('sends nothing to readers without ui capabilities (schemaVersion 0)', async () => {
    const { service, socket } = setup(() => [header('x')]);
    await service.onFirmwareInfo(socket, undefined);
    await service.onFirmwareInfo(socket, { garbage: true });
    expect(updates(socket)).toHaveLength(0);
  });

  it('pushes only deltas, with a rising revision, and removes vanished contributions', async () => {
    let current = [header('A')];
    const { service, socket } = setup(() => current);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    await service.sync(socket);
    expect(updates(socket)).toHaveLength(1); // unchanged: no new push
    current = [header('B')];
    jest.advanceTimersByTime(2100);
    await service.sync(socket);
    expect(updates(socket).at(-1).payload).toMatchObject({ revision: 2, tree: { text: 'B' } });
    current = [];
    jest.advanceTimersByTime(2100);
    await service.sync(socket);
    expect(updates(socket).at(-1).payload).toMatchObject({ revision: 3, tree: null });
  });

  it('keeps counting revisions after a removal, so a late removal retry cannot clear the re-added content', async () => {
    let current = [header('A')];
    const { service, socket } = setup(() => current);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    current = [];
    jest.advanceTimersByTime(2100);
    await service.sync(socket);
    current = [header('A')];
    jest.advanceTimersByTime(2100);
    await service.sync(socket);
    expect(shapes(socket)).toEqual(['state@1:A', 'state@2:null', 'state@3:A']);
    const removal = updates(socket)[1];
    expect(isUiMessageSuperseded(socket, { data: removal })).toBe(true);
  });

  it('removes content from the reader when a rendered contribution becomes skipped', async () => {
    let current = [header('Free')];
    const { service, socket } = setup(() => current);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    current = [header('Maintenance')]; // now rejected as a core status spoof
    jest.advanceTimersByTime(2100);
    await service.sync(socket);
    expect(shapes(socket)).toEqual(['state@1:Free', 'state@2:null']);
    expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'skipped', reason: 'invalid-core-string-spoof' });
    await service.sync(socket);
    expect(updates(socket)).toHaveLength(2); // the removal is sent once
  });

  it('re-syncs only the updated reader when its resources change, using the resources of the event', async () => {
    let current = [header('A')];
    const { service, socket, attractap, providers } = setup(() => current);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    current = [header('B')];
    await jest.advanceTimersByTimeAsync(2100);

    service.onReaderUpdated({ reader: { id: socket.readerId + 1, resources: [] } } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(updates(socket)).toHaveLength(1);

    service.onReaderUpdated({ reader: { id: socket.readerId, resources: [{ id: 12 }, { id: 13 }] } } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(updates(socket).map((u: any) => `${u.payload.resourceId}:${u.payload.tree.text}`)).toEqual([
      '12:A',
      '12:B',
      '13:B',
    ]);
    // The resource ids are kept on the connection: one reader query for the whole connection.
    expect(attractap.findReaderById).toHaveBeenCalledTimes(1);
    const calls = (providers[0].provider.getSlotContributions as jest.Mock).mock.calls.length;
    expect(calls).toBe(3); // initial (12) + update (12, 13)
  });

  it('loads the widget toggles once per sync for all resources', async () => {
    const { service, socket, settings } = setup(() => [header('A')], { resources: [12, 13, 14] });
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(settings.widgetToggles).toHaveBeenCalledTimes(1);
    expect(settings.widgetToggles).toHaveBeenCalledWith(5, [12, 13, 14]);
  });

  it('resets revisions on a new firmware info (READER_AUTHENTICATED boundary)', async () => {
    const { service, socket } = setup(() => [header('A')]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket).map((u: any) => u.payload.revision)).toEqual([1, 1]);
  });

  describe('rate limit (1 update per 2 s per resource and slot)', () => {
    it('coalesces rapid invalidations and sends the latest state after the window', async () => {
      let text = 'A';
      const { service, socket } = setup(() => [header(text)]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      text = 'B';
      await service.sync(socket);
      text = 'C';
      await service.sync(socket);
      expect(updates(socket)).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(2100);
      expect(updates(socket)).toHaveLength(2);
      expect(updates(socket)[1].payload).toMatchObject({ revision: 2, tree: { text: 'C' } });
    });

    it('allows the next update once the window passed', async () => {
      let text = 'A';
      const { service, socket } = setup(() => [header(text)]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      jest.advanceTimersByTime(2001);
      text = 'B';
      await service.sync(socket);
      expect(updates(socket)).toHaveLength(2);
    });

    it('keeps rate limit windows per connection', async () => {
      const a = setup(() => [header('A')]);
      const b = setup(() => [header('A')]);
      await a.service.onFirmwareInfo(a.socket, TOUCH_UI);
      await b.service.onFirmwareInfo(b.socket, TOUCH_UI);
      expect(a.socket.state.uiSlots.limiter).not.toBe(b.socket.state.uiSlots.limiter);
    });
  });

  describe('server-side expiry', () => {
    const expiring = (at: number) => () => [header('Free until 14:00', { expiresAt: new Date(at) })];

    it('removes the contribution at expiresAt even though the provider still returns it', async () => {
      const { service, socket } = setup(expiring(Date.now() + 5000));
      await service.onFirmwareInfo(socket, TOUCH_UI);
      expect(updates(socket)[0].payload.expiresAtMs).toBeGreaterThan(Date.now());
      await jest.advanceTimersByTimeAsync(5100);
      expect(shapes(socket)).toEqual(['state@1:Free until 14:00', 'state@2:null']);
      expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'skipped', reason: 'expired' });
    });

    it('does not bring an expired contribution back on a new connection', async () => {
      const { service, socket } = setup(expiring(Date.now() + 5000));
      await service.onFirmwareInfo(socket, TOUCH_UI);
      service.cleanup(socket); // disconnected: no timers run
      jest.setSystemTime(Date.now() + 6000);
      socket.sendMessage.mockClear();
      await service.onFirmwareInfo(socket, TOUCH_UI);
      expect(updates(socket)).toHaveLength(0);
    });

    it('never sends an already expired contribution', async () => {
      const { service, socket } = setup(() => [header('old', { expiresAt: new Date(Date.now() - 1) })]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      expect(updates(socket)).toHaveLength(0);
      expect(service.contributionsOf(5)).toEqual([expect.objectContaining({ status: 'skipped', reason: 'expired' })]);
    });
  });

  it('uses the fallback when the reader lacks a component, and skips without one', async () => {
    const withoutProgress = { ...TOUCH_UI, components: ['col', 'row', 'text', 'badge'] };
    const tree = { t: 'progress', value: 50 };
    const { service, socket } = setup(() => [
      {
        slotId: READER_UI_SLOTS.RESOURCE_DETAILS_BODY,
        key: 'a',
        tree,
        fallback: { text: 'Half done', tone: 'warning' },
      },
      { slotId: READER_UI_SLOTS.RESOURCE_DETAILS_BODY, key: 'b', tree },
    ]);
    await service.onFirmwareInfo(socket, withoutProgress);
    expect(updates(socket)).toHaveLength(1);
    expect(updates(socket)[0].payload.tree).toEqual({ t: 'badge', text: 'Half done', tone: 'warning' });
    const status = service.contributionsOf(5);
    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'a', status: 'degraded' }),
        expect.objectContaining({ key: 'b', status: 'skipped', reason: 'unsupported' }),
      ]),
    );
  });

  it('rejects invalid contributions per contribution without affecting others', async () => {
    const { service, socket } = setup(() => [
      header('Maintenance', { key: 'spoof' }),
      { ...header('fine'), key: 'good' },
      { slotId: READER_UI_SLOTS.RESOURCE_DETAILS_BODY, key: 'btn', tree: { t: 'button', id: 'go', text: 'Go' } },
    ]);
    await service.onFirmwareInfo(socket, { ...TOUCH_UI, components: [...TOUCH_UI.components, 'button'] });
    expect(updates(socket).map((u: any) => u.payload.key)).toEqual(['good']);
    expect(
      service
        .contributionsOf(5)
        .filter((c) => c.status === 'skipped')
        .map((c) => c.reason),
    ).toEqual(expect.arrayContaining(['invalid-core-string-spoof', 'invalid-button-in-slot']));
  });

  it('survives hostile provider output: null entries, cyclic and deep trees, a fallback without text, non-arrays', async () => {
    const cyclic: any = { t: 'col', c: [] };
    cyclic.c.push(cyclic);
    let deep: any = { t: 'text', text: 'leaf' };
    for (let i = 0; i < 5000; i += 1) deep = { t: 'col', c: [deep] };
    const hostile = [
      null,
      { slotId: READER_UI_SLOTS.RESOURCE_DETAILS_BODY, key: 'cyc', tree: cyclic },
      { slotId: READER_UI_SLOTS.RESOURCE_DETAILS_BODY, key: 'deep', tree: deep },
      { slotId: READER_UI_SLOTS.RESOURCE_DETAILS_SESSION, key: 'fb', tree: { t: 'progress', value: 1 }, fallback: {} },
      { ...header('fine'), key: 'good' },
    ];
    const { service, socket } = setup(() => [], {
      providers: [
        { plugin: 'a-hostile', provider: { getSlotContributions: async () => hostile } },
        { plugin: 'b-object', provider: { getSlotContributions: async () => ({ not: 'an array' }) } },
        { plugin: 'c-fine', provider: { getSlotContributions: async () => [{ ...header('ok'), key: 'k' }] } },
      ],
    });
    await service.onFirmwareInfo(socket, { ...TOUCH_UI, components: ['col', 'text', 'badge'] });
    expect(updates(socket).map((u: any) => `${u.payload.owner}/${u.payload.key}`)).toEqual([
      'a-hostile/good',
      'c-fine/k',
    ]);
    const skipped = service
      .contributionsOf(5)
      .filter((c) => c.status === 'skipped')
      .map((c) => `${c.plugin}/${c.key}:${c.reason}`);
    expect(skipped).toEqual(
      expect.arrayContaining([
        'a-hostile/entry-0:invalid',
        'a-hostile/entry-1:invalid',
        'a-hostile/entry-2:invalid',
        expect.stringMatching(/^a-hostile\/fb:invalid-/),
        'b-object/provider:invalid',
      ]),
    );
  });

  it('keeps at most 8 contributions per resource', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...header(`n${i}`), key: `k${i}` }));
    const { service, socket } = setup(() => many);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)).toHaveLength(8);
    expect(service.contributionsOf(5).filter((c) => c.reason === 'too-many-contributions')).toHaveLength(2);
  });

  it('keeps plugin nodes within the 64 live node budget across resources', async () => {
    const slot = (key: string, slotId: string, n: number) => ({
      slotId,
      key,
      tree: { t: 'col', c: Array.from({ length: n - 1 }, (_, i) => ({ t: 'text', text: `${key}${i}` })) },
    });
    // 6 + 8 + 6 = 20 nodes per resource; four resources need 80.
    const { service, socket } = setup(
      () => [
        slot('h', READER_UI_SLOTS.RESOURCE_DETAILS_HEADER, 6),
        slot('b', READER_UI_SLOTS.RESOURCE_DETAILS_BODY, 8),
        slot('s', READER_UI_SLOTS.RESOURCE_DETAILS_SESSION, 6),
      ],
      { resources: [1, 2, 3, 4] },
    );
    await service.onFirmwareInfo(socket, TOUCH_UI);
    const nodes = (tree: any): number => 1 + (tree.c ?? []).reduce((sum: number, c: any) => sum + nodes(c), 0);
    const sent = updates(socket).reduce((sum: number, u: any) => sum + nodes(u.payload.tree), 0);
    expect(sent).toBeLessThanOrEqual(64);
    expect(updates(socket)).toHaveLength(9);
    expect(updates(socket).some((u: any) => u.payload.resourceId === 4)).toBe(false);
    expect(service.contributionsOf(5).filter((c) => c.reason === 'node-budget')).toHaveLength(3);
  });

  describe('providers', () => {
    it('runs the providers of a resource concurrently and clears the timeout timer', async () => {
      const started: string[] = [];
      let releaseA: (value: any[]) => void = () => undefined;
      const { service, socket } = setup(() => [], {
        providers: [
          {
            plugin: 'a',
            provider: {
              getSlotContributions: () => {
                started.push('a');
                return new Promise<any[]>((resolve) => (releaseA = resolve));
              },
            },
          },
          {
            plugin: 'b',
            provider: {
              getSlotContributions: async () => {
                started.push('b');
                return [header('B')];
              },
            },
          },
        ],
      });
      const syncing = service.onFirmwareInfo(socket, TOUCH_UI);
      await jest.advanceTimersByTimeAsync(0);
      expect(started).toEqual(['a', 'b']); // b did not wait for a
      releaseA([{ ...header('A'), key: 'a' }]);
      await syncing;
      expect(updates(socket)).toHaveLength(2);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('times out a slow provider, and does not call it again while its earlier call is still pending', async () => {
      const slow = jest.fn(() => new Promise<any[]>(() => undefined));
      const { service, socket } = setup(() => [], {
        providers: [
          { plugin: 'slow', provider: { getSlotContributions: slow } },
          { plugin: 'fast', provider: { getSlotContributions: async () => [header('F')] } },
        ],
      });
      const syncing = service.onFirmwareInfo(socket, TOUCH_UI);
      await jest.advanceTimersByTimeAsync(1500);
      await syncing;
      expect(updates(socket).map((u: any) => u.payload.owner)).toEqual(['fast']);
      expect(service.contributionsOf(5)).toEqual(
        expect.arrayContaining([expect.objectContaining({ plugin: 'slow', reason: 'provider-error' })]),
      );
      await service.sync(socket);
      expect(slow).toHaveBeenCalledTimes(1);
    });

    it('keeps the provider-error status while a timed-out call is still pending', async () => {
      let hang = false;
      const { service, socket } = setup(() => (hang ? new Promise(() => undefined) : [header('A')]));
      await service.onFirmwareInfo(socket, TOUCH_UI);
      hang = true;
      jest.advanceTimersByTime(2100);
      const first = service.sync(socket);
      await jest.advanceTimersByTimeAsync(1500);
      await first; // timed out: its content is removed (fail closed)
      expect(shapes(socket)).toEqual(['state@1:A', 'state@2:null']);
      hang = false;
      await service.sync(socket); // still pending: not called, nothing changes
      expect(updates(socket)).toHaveLength(2);
      expect(service.contributionsOf(5)).toEqual([expect.objectContaining({ reason: 'provider-error' })]);
    });
  });

  describe('invalidate', () => {
    it('only syncs readers in scope and coalesces bursts', async () => {
      const t = setup(() => [header('A')]);
      const other = { ...t.socket, id: 'sock-2', readerId: 6, sendMessage: jest.fn().mockResolvedValue(true) };
      other.state = { lastAuthenticatedUserId: null };
      t.sockets.set(other.id, other);
      await t.service.onFirmwareInfo(t.socket, TOUCH_UI);
      await t.service.onFirmwareInfo(other, TOUCH_UI);
      other.state.uiSlots.resourceIds = [99];
      const calls = () => (t.providers[0].provider.getSlotContributions as jest.Mock).mock.calls.length;
      const before = calls();

      for (let i = 0; i < 50; i += 1) t.service.onInvalidate({ pluginName: 'reservations', scope: { resourceId: 12 } });
      await jest.advanceTimersByTimeAsync(UI_INVALIDATE_DEBOUNCE_MS + 1);
      expect(calls() - before).toBe(1); // only reader 5 has resource 12, and 50 calls became one sync

      t.service.onInvalidate({ pluginName: 'reservations', scope: { readerId: 6 } });
      await jest.advanceTimersByTimeAsync(UI_INVALIDATE_DEBOUNCE_MS + 1);
      expect(calls() - before).toBe(2);
    });
  });

  it('shows nothing while the reader is suspended after a crash loop, and nothing when widgets are off', async () => {
    const suspended = setup(() => [header('x')], { suspended: true });
    await suspended.service.onFirmwareInfo(suspended.socket, TOUCH_UI);
    expect(updates(suspended.socket)).toHaveLength(0);
    const off = setup(() => [header('x')], { widgets: false });
    await off.service.onFirmwareInfo(off.socket, TOUCH_UI);
    expect(updates(off.socket)).toHaveLength(0);
  });

  it('tells the admin view why a reader shows no plugin content, without sending anything', async () => {
    const status = (t: ReturnType<typeof setup>) => {
      t.socket.readerId = 5;
      return t.service.contributionsOf(5).map((c) => `${c.plugin}#${c.resourceId}:${c.status}:${c.reason}`);
    };
    const suspended = setup(() => [header('x')], { suspended: true });
    await suspended.service.onFirmwareInfo(suspended.socket, TOUCH_UI);
    expect(status(suspended)).toEqual(['reservations#12:skipped:crash-loop-suspended']);

    const off = setup(() => [header('x')], { widgets: false });
    await off.service.onFirmwareInfo(off.socket, TOUCH_UI);
    expect(status(off)).toEqual(['reservations#12:skipped:widgets-disabled']);

    const old = setup(() => [header('x')]);
    await old.service.onFirmwareInfo(old.socket, undefined);
    expect(status(old)).toEqual(['reservations#12:skipped:old-firmware']);

    const lite = setup(() => [header('x')]);
    await lite.service.onFirmwareInfo(lite.socket, { ...TOUCH_UI, components: [], slots: [], display: null });
    expect(status(lite)).toEqual(['reservations#12:skipped:no-screen']);
    for (const t of [suspended, off, old, lite]) expect(updates(t.socket)).toHaveLength(0);
  });

  describe('language', () => {
    it('builds public slots in the stored default language and follows changes of it', async () => {
      const seen: string[] = [];
      const { service, socket } = setup((ctx) => {
        seen.push(ctx.language);
        return [header(ctx.language)];
      });
      await service.onFirmwareInfo(socket, TOUCH_UI);
      service.onDefaultLanguage('en');
      await jest.advanceTimersByTimeAsync(2100);
      expect([...new Set(seen)]).toEqual(['de', 'en']);
      expect(lastSent(socket, 'UI_SLOT_UPDATE').tree.text).toBe('en');
    });
  });

  describe('card sessions', () => {
    it('builds public slots without a user and rebuilds with the user while a card session is live', async () => {
      const seen: Array<number | undefined> = [];
      const { service, socket, cardSessions } = setup((ctx) => {
        seen.push(ctx.userId);
        return [header(ctx.userId ? 'Your booking' : 'Reserved')];
      });
      await service.onFirmwareInfo(socket, TOUCH_UI);
      jest.advanceTimersByTime(2100);
      cardSessions.issue(socket, 7, 'en');
      await jest.advanceTimersByTimeAsync(10);
      jest.advanceTimersByTime(2100);
      cardSessions.end(socket, socket.state.cardSession.id, 'reader');
      await jest.advanceTimersByTimeAsync(2200);
      expect(seen.filter((id) => id === undefined).length).toBeGreaterThanOrEqual(2);
      expect(seen).toContain(7);
      expect(lastSent(socket, 'UI_SLOT_UPDATE').tree.text).toBe('Reserved');
    });

    it('replaces user content at sign-out at once, without waiting for the rate limit', async () => {
      const { service, socket, cardSessions } = setup((ctx) => [header(ctx.userId ? 'Your booking' : 'Reserved')]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      jest.advanceTimersByTime(2100);
      cardSessions.issue(socket, 7, 'en');
      await jest.advanceTimersByTimeAsync(0);
      expect(lastSent(socket, 'UI_SLOT_UPDATE').tree.text).toBe('Your booking');
      cardSessions.end(socket, socket.state.cardSession.id, 'reader'); // well within the 2 s window
      await jest.advanceTimersByTimeAsync(0);
      // Removed before the providers are asked, then the public content follows.
      expect(shapes(socket)).toEqual(['state@1:Reserved', 'state@2:Your booking', 'state@3:null', 'state@4:Reserved']);
    });

    it('removes the previous user content before awaiting slow providers', async () => {
      let release: () => void = () => undefined;
      let slow = false;
      const { service, socket, cardSessions } = setup((ctx) => {
        if (!slow) return [header(ctx.userId ? 'Your booking' : 'Reserved')];
        return new Promise<any[]>((resolve) => (release = () => resolve([header('Reserved')])));
      });
      await service.onFirmwareInfo(socket, TOUCH_UI);
      jest.advanceTimersByTime(2100);
      cardSessions.issue(socket, 7, 'en');
      await jest.advanceTimersByTimeAsync(0);
      slow = true;
      cardSessions.end(socket, socket.state.cardSession.id, 'reader');
      await jest.advanceTimersByTimeAsync(0);
      expect(shapes(socket)).toEqual(['state@1:Reserved', 'state@2:Your booking', 'state@3:null']); // not yet answered
      release();
      await jest.advanceTimersByTimeAsync(0);
      expect(shapes(socket).at(-1)).toBe('state@4:Reserved');
    });

    it("drops a pass's results when the card session changed while the providers ran", async () => {
      const releases: Array<() => void> = [];
      const { service, socket, cardSessions } = setup(
        (ctx) =>
          new Promise<any[]>((resolve) =>
            releases.push(() => resolve([header(ctx.userId ? `User ${ctx.userId}` : 'Public')])),
          ),
      );
      const initial = service.onFirmwareInfo(socket, TOUCH_UI);
      await jest.advanceTimersByTimeAsync(0);
      releases.shift()?.();
      await initial;
      jest.advanceTimersByTime(2100);
      cardSessions.issue(socket, 7, 'en'); // pass for user 7 starts and waits for the provider
      await jest.advanceTimersByTimeAsync(0);
      cardSessions.issue(socket, 8, 'en'); // user 8 taps while it waits
      await jest.advanceTimersByTimeAsync(0);
      releases.shift()?.(); // user 7 content arrives late
      await jest.advanceTimersByTimeAsync(0);
      releases.shift()?.(); // the rerun for user 8
      await jest.advanceTimersByTimeAsync(0);
      expect(shapes(socket)).toEqual(['state@1:Public', 'state@2:User 8']);
    });

    it('removes user-only content at sign-out at once', async () => {
      const { service, socket, cardSessions } = setup((ctx) => (ctx.userId ? [header('Your booking')] : []));
      await service.onFirmwareInfo(socket, TOUCH_UI);
      cardSessions.issue(socket, 7, 'en');
      await jest.advanceTimersByTimeAsync(0);
      cardSessions.end(socket, socket.state.cardSession.id, 'expired');
      await jest.advanceTimersByTimeAsync(0);
      expect(shapes(socket)).toEqual(['state@1:Your booking', 'state@2:null']);
    });

    it('sends the session slot again after sign-out, because the reader clears it itself', async () => {
      const { service, socket, cardSessions } = setup(() => [session('Booked 14:00-16:00')]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      jest.advanceTimersByTime(2100);
      cardSessions.issue(socket, 7, 'en');
      await jest.advanceTimersByTimeAsync(0);
      expect(updates(socket)).toHaveLength(1); // unchanged content is not sent again
      cardSessions.end(socket, socket.state.cardSession.id, 'reader');
      await jest.advanceTimersByTimeAsync(0);
      expect(shapes(socket)).toEqual(['s@1:Booked 14:00-16:00', 's@2:Booked 14:00-16:00']);
    });
  });

  describe('UI_RENDER_REPORT', () => {
    const report = (extra: Record<string, unknown> = {}) => ({
      resourceId: 12,
      slot: 'resource.details.header',
      owner: 'reservations',
      key: 'state',
      revision: 1,
      status: 'skipped',
      reason: 'pool',
      ...extra,
    });

    it('records a drop in the firmware format (owner, revision, status skipped, reason)', async () => {
      const { service, socket } = setup(() => [header('x')]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      service.renderReport(socket, report());
      expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'skipped', reason: 'reader-pool' });
    });

    it('accepts the older "dropped" status and ignores stale revisions and other statuses', async () => {
      const { service, socket } = setup(() => [header('x')]);
      await service.onFirmwareInfo(socket, TOUCH_UI);
      service.renderReport(socket, report({ revision: 0 }));
      service.renderReport(socket, report({ status: 'rendered' }));
      expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'rendered' });
      service.renderReport(socket, report({ status: 'dropped', reason: 'Unknown Node!' }));
      expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'skipped', reason: 'reader-UnknownNode' });
    });
  });
});
