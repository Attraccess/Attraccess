import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Attractap,
  NFCCard,
  Resource,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceType,
  ResourceUsage,
  User,
  IntroductionHistoryAction,
} from '@attraccess/database-entities';
import type { NoScreenPolicy } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from '../settings/settings.service';
import { AttractapGateway } from '../attractap/websockets/websocket.gateway';
import { WebsocketService } from '../attractap/websockets/websocket.service';
import { AttractapSessionHandler } from '../attractap/websockets/handlers/session/session.handler';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../attractap/websockets/websocket.types';
import { SessionService } from '../users-and-auth/auth/session.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { EnrollmentLimitsService } from '../device-enrollment/enrollment-limits.service';
import { ReaderUiSettingsService } from '../plugin-system/reader-ui/reader-ui-settings.service';
import { bootstrap } from '../main.bootstrap';
import { DesktopFixture, buildProbe, waitFor } from './desktop-simulator.fixture';
import { withDesktopCleanup } from './desktop-simulator-cleanup';
import { disposeStorage } from '../test/desktop-real-api.test-fixture';
import { TestReaderUiScenario, registerTestReaderUi } from '../test/reader-ui-test-hooks.test-fixture';

// ATT-1187: pre-start hooks, steps and slots through the real API and the real desktop simulator.
// Plugins stay disabled; an in-process provider stands in for one. The simulator is a touch reader, so
// "old firmware" and "Lite" are the stored capabilities the server decides on, not a different binary.
const nonProfitLicense =
  'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';
const CONFIRM = {
  decision: 'confirm' as const,
  confirmation: { stepKey: 'booked', title: 'Reserviert ab 14:00', body: 'Trotzdem starten?' },
};

describe('reader UI against an isolated real API and the desktop simulator', () => {
  let app: INestApplication;
  let db: DataSource;
  let endpoint: string;
  let prefix: string;
  let fixture: DesktopFixture | undefined;
  let reader: Attractap;
  let resource: Resource;
  let admin: User;
  let operator: User;
  let hook: ReturnType<typeof registerTestReaderUi> | undefined;
  let sent: AttractapEvent[] = [];

  beforeAll(async () => {
    await buildProbe();
    const boot = await bootstrap();
    app = boot.app;
    prefix = `/${boot.globalPrefix}`;
    db = app.get(DataSource);
    await app.get(SettingsService).updateAppSettings({ licenseKey: nonProfitLicense, defaultLanguage: 'de' });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('API did not bind TCP');
    endpoint = `http://127.0.0.1:${address.port}`;
  }, 420_000);

  afterEach(async () => {
    hook?.unregister();
    hook = undefined;
    await fixture?.dispose();
    fixture = undefined;
    if (db?.isInitialized) await db.getRepository(NFCCard).clear();
  });
  afterAll(async () => {
    await withDesktopCleanup(
      async () => app?.close(),
      async () => {
        if (db?.isInitialized) await db.destroy();
      },
      disposeStorage,
    );
  });

  const desktop = () => fixture as DesktopFixture;

  async function approve(code: string): Promise<boolean> {
    if (!admin) {
      admin = await db.getRepository(User).save({
        username: 'reader-ui-admin',
        email: 'reader-ui-admin@example.invalid',
        isEmailVerified: true,
        locale: 'de',
      });
      const rbac = app.get(RbacService);
      const granted = new Set(['resources.update']);
      const role = await rbac.createRole({ name: 'Reader UI pairing', permissionKeys: [...granted] }, granted);
      await rbac.assignRole(admin.id, role.id, granted);
    }
    const token = await app.get(SessionService).createSession(admin);
    desktop().diagnostics.remember(token);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const resolved = await fetch(`${endpoint}${prefix}/attractap/pairings/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    });
    if (!resolved.ok) return false;
    const pairing = (await resolved.json()) as { id: string };
    const approved = await fetch(`${endpoint}${prefix}/attractap/pairings/${pairing.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, mode: 'new', name: 'Reader UI simulator' }),
    });
    return approved.ok;
  }

  function socket(): AuthenticatedWebSocket {
    const found = [...app.get(WebsocketService).sockets.values()].filter((item) => item.readerId === reader.id);
    if (found.length !== 1) throw new Error(`Expected one connection for reader ${reader.id}, got ${found.length}`);
    return found[0];
  }

  /** Records every message the server sends to the reader from now on. */
  function recordSent() {
    sent = [];
    const connection = socket();
    const original = connection.sendMessage;
    connection.sendMessage = function (message) {
      sent.push(message);
      return original.call(this, message);
    };
  }
  const sentOf = (type: AttractapEventType) => sent.filter((message) => message.data.type === type);

  /** Pairs a simulator, gives it a resource and a signed-in operator with an enrolled card, and ends on the details screen. */
  async function signedIn(scenario: string, setup?: () => Promise<void>) {
    Object.assign(app.get(EnrollmentLimitsService), new EnrollmentLimitsService());
    fixture = new DesktopFixture(endpoint, scenario, approve);
    await fixture.start();
    const observed = await desktop().command('inspect');
    await desktop().screen('set-pin');
    await desktop().command('edit', { text: '1234' });
    reader = await db.getRepository(Attractap).findOneByOrFail({ id: observed.readerId });
    resource = await db.getRepository(Resource).save({ name: `UI Mill ${reader.id}`, type: ResourceType.Machine });
    reader.resources = [resource];
    await db.getRepository(Attractap).save(reader);
    operator = await db.getRepository(User).save({
      username: `ui-operator-${reader.id}`,
      email: `ui-operator-${reader.id}@example.invalid`,
      isEmailVerified: true,
      locale: 'de',
    });
    const introduction = await db
      .getRepository(ResourceIntroduction)
      .save({ resourceId: resource.id, receiverUserId: operator.id });
    await db.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId: introduction.id,
      action: IntroductionHistoryAction.GRANT,
      performedByUserId: operator.id,
    });
    await setup?.();
    await app.get(AttractapGateway).sendResourceList(reader.id);
    await desktop().text(resource.name);
    await desktop().click(resource.name);
    await desktop().screen('locked');
    const token = await app.get(SessionService).createSession(operator);
    desktop().diagnostics.remember(token);
    const enrolled = await fetch(`${endpoint}${prefix}/attractap/readers/enroll-nfc-card`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ readerId: reader.id }),
    });
    expect(enrolled.status).toBe(201);
    await desktop().screen('enrollment');
    await desktop().present(0);
    await waitFor(
      () => db.getRepository(NFCCard).exists({ where: { user: { id: operator.id }, isActive: true } }),
      'card enrollment',
    );
    await desktop().remove(0);
    await desktop().screen('locked');
    await desktop().present(0);
    await desktop().screen('details');
    await desktop().remove(0);
  }

  const usages = () => db.getRepository(ResourceUsage).countBy({ resourceId: resource.id });
  const useHook = (scenario: TestReaderUiScenario) => (hook = registerTestReaderUi(app, scenario));
  const storeCapabilities = async (ui: Record<string, unknown> | null) => {
    const current = await db.getRepository(Attractap).findOneByOrFail({ id: reader.id });
    current.firmware.capabilities.ui = ui;
    await db.getRepository(Attractap).save(current);
  };

  it('allow starts the session with no extra step', async () => {
    await signedIn('reader-ui-allow');
    useHook({ preStartHook: () => ({ decision: 'allow' }) });
    recordSent();
    await desktop().click('Ressource verwenden');
    await waitFor(async () => (await usages()) === 1, 'usage start');
    expect(sentOf(AttractapEventType.UI_STEP_REQUEST)).toHaveLength(0);
  }, 120_000);

  it('confirm holds the start, asks on the reader, and starts only after the answer', async () => {
    await signedIn('reader-ui-confirm');
    const asked: string[][] = [];
    useHook({
      preStartHook: (ctx) => {
        asked.push(ctx.confirmedStepKeys);
        return ctx.confirmedStepKeys.includes('booked') ? { decision: 'allow' } : CONFIRM;
      },
    });
    recordSent();
    await desktop().click('Ressource verwenden');
    await desktop().text('Reserviert ab 14:00');
    expect(await usages()).toBe(0);
    await desktop().snapshot('plugin-confirm-step');
    await desktop().click('Start');
    await waitFor(async () => (await usages()) === 1, 'usage start after confirm');
    expect(asked).toEqual([[], ['booked']]);
    expect(sentOf(AttractapEventType.UI_STEP_REQUEST)).toHaveLength(1);
  }, 120_000);

  it('cancel starts nothing, and a late retry with the old stepId is rejected', async () => {
    await signedIn('reader-ui-cancel');
    useHook({ preStartHook: () => CONFIRM });
    recordSent();
    await desktop().click('Ressource verwenden');
    await desktop().text('Reserviert ab 14:00');
    const step = sentOf(AttractapEventType.UI_STEP_REQUEST)[0].data.payload as { stepId: string; requestId: number };
    await desktop().click('Abbrechen');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await usages()).toBe(0);
    // The reader cannot retry any more; a late START carrying the cancelled step must fail.
    const replies: AttractapEvent[] = [];
    const connection = socket();
    const original = connection.sendMessage;
    connection.sendMessage = function (message) {
      replies.push(message);
      return original.call(this, message);
    };
    await app.get(AttractapSessionHandler).handleStartResourceUsageSession(connection, {
      type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
      payload: { requestId: step.requestId + 1000, resourceId: resource.id, stepId: step.stepId },
    } as AttractapEvent['data']);
    const reply = replies.find((message) => message.data.type === AttractapEventType.START_RESOURCE_USAGE_SESSION);
    expect(['STEP_EXPIRED', 'STEP_UNKNOWN']).toContain((reply?.data.payload as { error?: string }).error);
    expect(await usages()).toBe(0);
  }, 120_000);

  it('block shows the plugin reason and starts nothing', async () => {
    await signedIn('reader-ui-block');
    useHook({
      preStartHook: () => ({
        decision: 'block',
        reason: { code: 'RESERVED', title: 'Reserviert', body: 'Bis 16:00 von Anna M.' },
      }),
    });
    await desktop().click('Ressource verwenden');
    await desktop().text('Bis 16:00 von Anna M.');
    await desktop().snapshot('plugin-block-reason');
    expect(await usages()).toBe(0);
  }, 120_000);

  it('translates the step text to Latin-1 before it reaches the reader', async () => {
    await signedIn('reader-ui-latin1');
    useHook({
      preStartHook: () => ({
        decision: 'confirm',
        confirmation: { stepKey: 'l', title: 'Zażółć — „gut“', body: 'Ž …' },
      }),
    });
    recordSent();
    await desktop().click('Ressource verwenden');
    await desktop().text('Zaz\u00F3lc - "gut"');
    const step = sentOf(AttractapEventType.UI_STEP_REQUEST)[0].data.payload as { title: string; body: string };
    expect(step.title).toBe('Zaz\u00F3lc - "gut"');
    expect(step.body).toBe('Z ...');
  }, 120_000);

  it('old firmware without ui gets no UI messages and the confirm falls back to a block', async () => {
    await signedIn('reader-ui-old-firmware', async () => undefined);
    await storeCapabilities(null);
    useHook({ preStartHook: () => CONFIRM });
    recordSent();
    await desktop().click('Ressource verwenden');
    await waitFor(
      () => sent.some((message) => message.data.type === AttractapEventType.START_RESOURCE_USAGE_SESSION),
      'a start reply',
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(sentOf(AttractapEventType.UI_STEP_REQUEST)).toHaveLength(0);
    expect(await usages()).toBe(0);
    const reply = sent.find((message) => message.data.type === AttractapEventType.START_RESOURCE_USAGE_SESSION);
    expect(reply?.data.payload).toMatchObject({ error: 'START_BLOCKED', reason: { code: 'CONFIRMATION_REQUIRED' } });
  }, 120_000);

  describe.each<[NoScreenPolicy]>([['block'], ['card-confirm'], ['allow-with-warning']])(
    'a reader without a screen under the %s policy',
    (policy) => {
      it('applies the policy the server stores for the resource', async () => {
        await signedIn(`reader-ui-lite-${policy}`);
        await storeCapabilities({
          schemaVersion: 1,
          components: [],
          slots: [],
          steps: policy === 'card-confirm' ? ['card-confirm'] : [],
          maxPayloadBytes: 0,
          maxNodes: 0,
          maxDepth: 0,
          maxLiveNodes: 0,
          display: null,
          input: { touch: false, buttons: 0, cardHold: true },
          feedback: { leds: true, beeper: true },
          charset: 'latin1',
          images: false,
        });
        await app
          .get(ReaderUiSettingsService)
          .setResource(resource.id, { noScreenPolicy: policy, plugins: [] }, admin.id);
        useHook({ preStartHook: () => CONFIRM });
        recordSent();
        await desktop().click('Ressource verwenden');
        if (policy === 'allow-with-warning') {
          await waitFor(async () => (await usages()) === 1, 'usage start with warning');
          return;
        }
        await waitFor(() => sent.length > 0, 'a reply');
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(await usages()).toBe(0);
        if (policy === 'card-confirm') {
          expect((sentOf(AttractapEventType.UI_STEP_REQUEST)[0].data.payload as { kind: string }).kind).toBe(
            'card-confirm',
          );
        } else {
          expect(sentOf(AttractapEventType.UI_STEP_REQUEST)).toHaveLength(0);
        }
      }, 120_000);
    },
  );

  it('does not bring back a slot that expired while the reader was disconnected', async () => {
    let expiresAt = 0;
    await signedIn('reader-ui-slot-expiry', async () => {
      expiresAt = Date.now() + 6_000;
      useHook({
        readerUi: {
          getSlotContributions: () =>
            Date.now() < expiresAt
              ? [
                  {
                    slotId: 'resourceList.row.status',
                    key: 'free',
                    tree: { t: 'badge', text: 'Frei bis 14:00' },
                    expiresAt: new Date(expiresAt),
                  },
                ]
              : [],
        },
      });
    });
    await desktop().command('reconnect');
    await new Promise((resolve) => setTimeout(resolve, 7_000)); // server time passes the expiry
    recordSent();
    await desktop().command('reconnect');
    await waitFor(
      () => !!reader && [...app.get(WebsocketService).sockets.values()].some((item) => item.readerId === reader.id),
      'reconnect',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const shown = sentOf(AttractapEventType.UI_SLOT_UPDATE).filter(
      (message) => (message.data.payload as { tree: unknown }).tree !== null,
    );
    expect(shown).toHaveLength(0);
  }, 120_000);
});
