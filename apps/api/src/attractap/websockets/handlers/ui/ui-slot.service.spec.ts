/* eslint-disable @typescript-eslint/no-explicit-any */
import { READER_UI_SLOTS } from '@attraccess/plugins-backend-sdk';
import { CardSessionService } from './card-session.service';
import { isUiMessageSuperseded, UiSlotService } from './ui-slot.service';
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

function setup(contributions: () => any[], opts: { suspended?: boolean; widgets?: boolean; ui?: any } = {}) {
  const registry = {
    providers: () => [
      { plugin: 'reservations', provider: { getSlotContributions: jest.fn(async () => contributions()) } },
    ],
  };
  const settings = { widgetsEnabled: jest.fn().mockResolvedValue(opts.widgets ?? true) };
  const alerts = { isReaderSuspended: () => opts.suspended ?? false, onCleared: jest.fn() };
  const attractap = { findReaderById: jest.fn().mockResolvedValue({ id: 5, resources: [{ id: 12 }] }) };
  const sockets = new Map<string, any>();
  const cardSessions = new CardSessionService();
  const service = new UiSlotService(
    registry as never,
    settings as never,
    alerts as never,
    attractap as never,
    { sockets, readerLanguage: 'de' } as never,
    cardSessions,
  );
  const socket = makeSocket();
  sockets.set(socket.id, socket);
  return { service, socket, settings, cardSessions, registry };
}

const header = (text: string, extra: Record<string, unknown> = {}) => ({
  slotId: READER_UI_SLOTS.RESOURCE_DETAILS_HEADER,
  key: 'state',
  tree: { t: 'text', text },
  ...extra,
});
const updates = (socket: any) =>
  socket.sendMessage.mock.calls.map((c: any[]) => c[0].data).filter((d: any) => d.type === 'UI_SLOT_UPDATE');

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
  });

  it('re-evaluates at expiresAt and drops the contribution when the provider no longer returns it', async () => {
    let calls = 0;
    const { service, socket } = setup(() => {
      calls += 1;
      return calls === 1 ? [header('Free until 14:00', { expiresAt: new Date(Date.now() + 5000) })] : [];
    });
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)[0].payload.expiresAtMs).toBeGreaterThan(Date.now());
    await jest.advanceTimersByTimeAsync(5100);
    expect(updates(socket).at(-1).payload).toMatchObject({ revision: 2, tree: null });
  });

  it('never sends an already expired contribution', async () => {
    const { service, socket } = setup(() => [header('old', { expiresAt: new Date(Date.now() - 1) })]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)).toHaveLength(0);
    expect(service.contributionsOf(5)).toEqual([expect.objectContaining({ status: 'skipped', reason: 'expired' })]);
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

  it('keeps at most 8 contributions per resource', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...header(`n${i}`), key: `k${i}` }));
    const { service, socket } = setup(() => many);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)).toHaveLength(8);
    expect(service.contributionsOf(5).filter((c) => c.reason === 'too-many-contributions')).toHaveLength(2);
  });

  it('keeps plugin nodes within the 64 live node budget', async () => {
    const slot = (key: string, slotId: string, n: number) => ({
      slotId,
      key,
      tree: { t: 'col', c: Array.from({ length: n }, (_, i) => ({ t: 'text', text: `${key}${i}` })) },
    });
    const { service, socket } = setup(() => [
      slot('h', READER_UI_SLOTS.RESOURCE_DETAILS_HEADER, 5),
      slot('b', READER_UI_SLOTS.RESOURCE_DETAILS_BODY, 7),
      slot('s', READER_UI_SLOTS.RESOURCE_DETAILS_SESSION, 5),
    ]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    expect(updates(socket)).toHaveLength(3); // 6 + 8 + 6 nodes, well within the budget
  });

  it('shows nothing while the reader is suspended after a crash loop, and nothing when widgets are off', async () => {
    const suspended = setup(() => [header('x')], { suspended: true });
    await suspended.service.onFirmwareInfo(suspended.socket, TOUCH_UI);
    expect(updates(suspended.socket)).toHaveLength(0);
    const off = setup(() => [header('x')], { widgets: false });
    await off.service.onFirmwareInfo(off.socket, TOUCH_UI);
    expect(updates(off.socket)).toHaveLength(0);
  });

  it('builds public slots without a user and rebuilds with the user while a card session is live', async () => {
    const seen: Array<number | undefined> = [];
    const { service, socket, cardSessions, registry } = setup(() => []);
    (registry as any).providers = () => [
      {
        plugin: 'reservations',
        provider: {
          getSlotContributions: async (ctx: any) => {
            seen.push(ctx.userId);
            return [header(ctx.userId ? 'Your booking' : 'Reserved')];
          },
        },
      },
    ];
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

  it('supersedes a pending retry when a newer revision of the same contribution exists', async () => {
    const { service, socket } = setup(() => [header('A')]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    const old = updates(socket)[0];
    expect(isUiMessageSuperseded(socket, { data: old })).toBe(false);
    socket.state.uiSlots.inflight.set('12|resource.details.header|reservations|state', 2);
    expect(isUiMessageSuperseded(socket, { data: old })).toBe(true);
    expect(isUiMessageSuperseded(socket, { data: { type: 'READER_LANGUAGE', payload: {} } })).toBe(false);
  });

  it('reports reader render drops in the contribution status', async () => {
    const { service, socket } = setup(() => [header('x')]);
    await service.onFirmwareInfo(socket, TOUCH_UI);
    service.renderReport(socket, {
      resourceId: 12,
      slot: 'resource.details.header',
      owner: 'reservations',
      key: 'state',
      revision: 1,
      status: 'dropped',
      reason: 'pool',
    });
    expect(service.contributionsOf(5)[0]).toMatchObject({ status: 'skipped', reason: 'reader-pool' });
  });
});
