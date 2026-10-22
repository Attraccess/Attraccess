import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Resource,
  ResourceType,
  Attractap,
  User,
  NFCCard,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  Project,
  ProjectMember,
  Form,
  FormField,
  FormFieldType,
  FormSubmission,
  ResourceUsage,
  SupervisionMode,
  ResourceIntroducer,
} from '@attraccess/database-entities';
import { SettingsService } from '../settings/settings.service';
import { WebsocketService } from '../attractap/websockets/websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../attractap/websockets/websocket.types';
import { SessionService } from '../users-and-auth/auth/session.service';
import { SupervisionService } from '../resources/supervision/supervision.service';
import { bootstrap } from '../main.bootstrap';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { DesktopFixture, buildProbe, waitFor } from './desktop-simulator.fixture';
import { withDesktopCleanup } from './desktop-simulator-cleanup';
import { disposeStorage, storageRoot } from '../test/desktop-real-api.test-fixture';

const nonProfitLicense =
  'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

describe('desktop simulator against an isolated real API', () => {
  let app: INestApplication | undefined;
  let db: DataSource;
  let endpoint: string;
  let prefix: string;
  let fixture: DesktopFixture | undefined;
  let reader: Attractap;
  let resource: Resource;

  beforeAll(async () => {
    await buildProbe();
    const boot = await bootstrap();
    app = boot.app;
    prefix = `/${boot.globalPrefix}`;
    db = app.get(DataSource);
    const database = db.options.database;
    if (typeof database !== 'string') throw new Error('Expected an owned SQLite database');
    const location = relative(realpathSync(storageRoot), realpathSync(database));
    if (location.startsWith('..') || isAbsolute(location)) throw new Error('API database escaped isolated storage');
    await app.get(SettingsService).updateAppSettings({ licenseKey: nonProfitLicense, defaultLanguage: 'de' });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('API did not bind TCP');
    endpoint = `http://127.0.0.1:${address.port}`;
  }, 420_000);

  afterEach(async () => {
    await fixture?.dispose();
    fixture = undefined;
    // Virtual cards have stable physical UIDs across fresh profiles. Retire the
    // previous scenario's cards only after its reader has stopped.
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

  function api() {
    if (!app) throw new Error('API has not started');
    return app;
  }

  function desktop() {
    if (!fixture) throw new Error('Desktop fixture has not started');
    return fixture;
  }

  async function start(scenario: string, pin = '1234') {
    fixture = new DesktopFixture(endpoint, scenario);
    await fixture.start();
    const observed = await fixture.command('inspect');
    expect(observed.authenticated).toBe(true);
    expect(observed.networkAvailable).toBe(true);
    expect(observed.devicePin).toBe('0000');
    await fixture.screen('set-pin');
    expect((await fixture.command('edit', { text: pin })).devicePin).toBe(pin);
    reader = await db.getRepository(Attractap).findOneByOrFail({ id: observed.readerId });
    resource = await db.getRepository(Resource).save({ name: `Desktop Mill ${reader.id}`, type: ResourceType.Machine });
    reader.resources = [resource];
    await db.getRepository(Attractap).save(reader);
    return observed;
  }

  function socket(): AuthenticatedWebSocket {
    const connections = [...api().get(WebsocketService).sockets.values()].filter((item) => item.readerId === reader.id);
    if (connections.length !== 1)
      throw new Error(`Expected one connection for reader ${reader.id}, got ${connections.length}`);
    return connections[0];
  }

  async function assertMaintenanceOnly() {
    const connection = socket();
    expect(await connection.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_LIST, { resources: [] }))).toBe(
      false,
    );
    const acknowledged = await connection.sendMessage(
      new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
        name: reader.name,
        language: 'de',
      }),
    );
    desktop().recordDelivery(reader.id, connection.id, AttractapEventType.READER_AUTHENTICATED, acknowledged);
    expect(acknowledged).toBe(true);
    await waitFor(async () => {
      const current = await db.getRepository(Attractap).findOneByOrFail({ id: reader.id });
      return !!current.firmware?.version;
    }, 'legacy firmware metadata');
    expect(connection.state.lastAuthenticatedUserId).toBeFalsy();
  }

  async function user(name: string, introduced = true) {
    const result = await db.getRepository(User).save({
      username: `${name}-${reader.id}`,
      email: `${name}-${reader.id}@example.invalid`,
      isEmailVerified: true,
      locale: 'de',
    });
    if (introduced) {
      const introduction = await db
        .getRepository(ResourceIntroduction)
        .save({ resourceId: resource.id, receiverUserId: result.id });
      await db.getRepository(ResourceIntroductionHistoryItem).save({
        introductionId: introduction.id,
        action: IntroductionHistoryAction.GRANT,
        performedByUserId: result.id,
      });
    }
    return result;
  }

  async function request(user: User, path: string, body: object, signal = AbortSignal.timeout(40_000)) {
    const token = await api().get(SessionService).createSession(user);
    desktop().diagnostics.remember(token);
    // Use the real authentication, authorization and card handlers.
    return fetch(`${endpoint}${prefix}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  }

  // ATT-950 will supply successful card workflows. The foundation deliberately
  // leaves this bearer-authenticated simulator restricted to firmware maintenance.
  it('registers, acknowledges maintenance on replacement connections and preserves its profile', async () => {
    const original = await start('registration-reconnect', '7391');
    const connection = socket();
    await assertMaintenanceOnly();
    const recovered = await desktop().command('reconnect');
    expect(recovered.authenticationGeneration).toBeGreaterThan(original.authenticationGeneration);
    expect(recovered.readerId).toBe(reader.id);
    expect(recovered.networkAvailable).toBe(true);
    await waitFor(() => {
      const active = [...api().get(WebsocketService).sockets.values()].filter((item) => item.readerId === reader.id);
      return active.length === 1 && active[0] !== connection;
    }, 'replacement reader connection');
    await assertMaintenanceOnly();
    const readerCount = await db.getRepository(Attractap).count();
    await desktop().stop();
    await desktop().start();
    const restarted = await desktop().command('inspect');
    expect(restarted.devicePin).toBe('7391');
    expect(restarted.readerId).toBe(reader.id);
    expect(await db.getRepository(Attractap).count()).toBe(readerCount);
    await assertMaintenanceOnly();
    const diagnostics = readFileSync(join(desktop().screenshots, 'observations.ndjson'), 'utf8');
    for (const line of diagnostics.trim().split('\n')) expect(JSON.parse(line)).not.toHaveProperty('devicePin');
    expect(diagnostics).not.toContain('7391');
  }, 90_000);

  it('denies enrollment and reset without changing database cards or virtual card keys', async () => {
    await start('card-denial');
    const owner = await user('card-owner');
    const cards = db.getRepository(NFCCard);
    // An existing owned card reaches the real reset handler through access checks.
    const stored = await cards.save({
      user: owner,
      uid: 'foundation-card',
      keyNo: 1,
      key: 'test-only-key',
      isActive: true,
    });
    desktop().diagnostics.remember(stored.key);
    const beforeRows = await cards.find({ order: { id: 'ASC' } });
    const beforeKeys = await Promise.all(
      [0, 1, 2, 3].map(async (card) => (await desktop().command('inspect', { card })).keyVersions),
    );
    for (const [path, body] of [
      ['/attractap/readers/enroll-nfc-card', { readerId: reader.id }],
      ['/attractap/readers/reset-nfc-card', { readerId: reader.id, cardId: stored.id }],
    ] as const) {
      const response = await request(owner, path, body);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ message: 'CARD_VERIFICATION_UNAVAILABLE' });
      expect(await cards.find({ order: { id: 'ASC' } })).toEqual(beforeRows);
      expect(socket().state.enrollment).toBeFalsy();
      expect(socket().state.enrollNewCardData).toBeFalsy();
      expect(socket().state.resetNfcCardData).toBeFalsy();
    }
    // Presenting a card on this maintenance-only reader cannot start usage.
    await desktop().present();
    await desktop().remove();
    expect(socket().state.lastAuthenticatedUserId).toBeFalsy();
    expect(await cards.find({ order: { id: 'ASC' } })).toEqual(beforeRows);
    expect(
      await Promise.all([0, 1, 2, 3].map(async (card) => (await desktop().command('inspect', { card })).keyVersions)),
    ).toEqual(beforeKeys);
    expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
    await assertMaintenanceOnly();
  }, 60_000);

  it('delivers legacy update notifications while the desktop refuses to flash', async () => {
    await start('legacy-update');
    const connection = socket();
    const acknowledged = await connection.sendMessage(
      new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, { size: 1024 }),
    );
    desktop().recordDelivery(
      reader.id,
      connection.id,
      AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED,
      acknowledged,
    );
    expect(acknowledged).toBe(true);
    await desktop().text('Something went wrong. Please try again.');
    expect((await desktop().command('inspect')).authenticated).toBe(true);
    expect(await db.getRepository(NFCCard).count()).toBe(0);
  }, 30_000);

  // These real card-success scenarios require the deferred ATT-950 verifier.
  // Keep them separate from the foundation's mandatory denial checks above.
  describe.skip('ATT-950 card gateway success workflows (requires ATT-950 implementation)', () => {
    async function enroll(user: User, card = 0) {
      expect((await request(user, '/attractap/readers/enroll-nfc-card', { readerId: reader.id })).status).toBe(201);
      await desktop().screen('enrollment');
      await desktop().present(card);
      await waitFor(
        async () => db.getRepository(NFCCard).exists({ where: { user: { id: user.id }, isActive: true } }),
        'card enrollment',
      );
      const stored = await db
        .getRepository(NFCCard)
        .findOneOrFail({ where: { user: { id: user.id }, isActive: true } });
      desktop().diagnostics.remember(stored.key);
      // INfc::CARD_KEY_VERSION_ENROLLED in rfid_contract.hpp; application.cpp writes this version.
      expect((await desktop().command('inspect', { card })).keyVersions[stored.keyNo]).toBe(0x01);
      await desktop().text('Karte registriert!');
      await desktop().snapshot(`enrolled-${card}`);
      await desktop().remove(card);
      return stored;
    }

    async function authenticate(card = 0) {
      let observed = await desktop().command('inspect');
      await waitFor(async () => {
        observed = await desktop().command('inspect');
        return observed.screen === 'resources' || observed.screen === 'locked';
      }, 'card entry screen');
      if (observed.screen === 'resources') await desktop().click(resource.name);
      await desktop().screen('locked');
      await desktop().present(card);
      await desktop().screen('details');
      await desktop().text(resource.name);
      await desktop().remove(card);
    }

    it('enrolls cards, rejects unknown and incorrect keys, and recovers from write failure and removal', async () => {
      await start('cards');
      await desktop().present(3);
      await desktop().text('Karte nicht gefunden');
      await desktop().snapshot('unknown-card');
      await desktop().click('OK');
      await desktop().screen('locked');
      expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
      await desktop().remove(3);
      const owner = await user('card-owner');
      const card = await enroll(owner);
      await desktop().screen('locked');
      await desktop().command('corrupt-key', { card: 0, slot: card.keyNo });
      await desktop().authenticationFailure();
      expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
      await desktop().snapshot('incorrect-key');
      await desktop().click('OK');
      await desktop().remove();
      await desktop().command('corrupt-key', { card: 0, slot: card.keyNo });
      await authenticate();
      await desktop().click('Abmelden');
      for (const [index, fault] of [
        [1, 'write'],
        [2, 'removeOnWrite'],
      ] as const) {
        const candidate = await user(`failed-${index}`);
        await desktop().command('faults', { card: index, [fault]: true });
        expect((await request(candidate, '/attractap/readers/enroll-nfc-card', { readerId: reader.id })).status).toBe(
          201,
        );
        await desktop().screen('enrollment');
        await desktop().present(index);
        await desktop().text('Karte konnte nicht\ngeschrieben werden');
        expect(await db.getRepository(NFCCard).count({ where: { user: { id: candidate.id }, isActive: true } })).toBe(
          0,
        );
        if (fault === 'removeOnWrite') expect((await desktop().command('inspect')).removedOnWrite).toBe(true);
        await desktop().snapshot(`failed-enrollment-${index}`);
        await desktop().remove(index);
        await desktop().command('faults', { card: index });
        await desktop().text('Karte an den Leser halten');
        await desktop().present(index);
        await desktop().text('Karte registriert!');
        await waitFor(
          () => db.getRepository(NFCCard).exists({ where: { user: { id: candidate.id }, isActive: true } }),
          'recovered enrollment',
        );
        const recovered = await db.getRepository(NFCCard).findOneOrFail({
          where: { user: { id: candidate.id }, isActive: true },
        });
        desktop().diagnostics.remember(recovered.key);
        expect((await desktop().command('inspect', { card: index })).keyVersions[recovered.keyNo]).toBe(0x01);
        await desktop().remove(index);
        await authenticate(index);
        await desktop().click('Abmelden');
      }
      expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
    }, 120_000);

    it('starts and ends a project session only after required forms, including server rejection and correction', async () => {
      await start('sessions-forms');
      const owner = await user('operator');
      const projectOwner = await user('project-owner');
      const project = await db
        .getRepository(Project)
        .save({ name: `Desktop Project ${reader.id}`, owner: projectOwner });
      await db.getRepository(ProjectMember).save({ userId: owner.id, projectId: project.id });
      const form = await db.getRepository(Form).save({
        name: 'Safety check',
        resourceId: resource.id,
        isRequiredOnResourceUsageStart: true,
        isRequiredOnResourceUsageEnd: true,
      });
      const text = await db
        .getRepository(FormField)
        .save({ formId: form.id, name: 'Work note', type: FormFieldType.TEXT, isRequired: true, position: 0 });
      const choice = await db.getRepository(FormField).save({
        formId: form.id,
        name: 'Material',
        type: FormFieldType.SELECT,
        isRequired: true,
        options: ['Wood', 'Metal'],
        position: 1,
      });
      await enroll(owner);
      await authenticate();
      await desktop().click('Projekt wählen');
      await desktop().click(project.name);
      await desktop().text(`Projekt: ${project.name}`);
      await desktop().snapshot('project-selected');
      await desktop().click('Ressource verwenden');
      await desktop().text('Work note *');
      await desktop().click('Weiter');
      await desktop().text('Bitte markierte Felder ausfüllen.');
      expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
      await desktop().snapshot('required-start-form');
      await desktop().click('Antippen zum Eingeben');
      await desktop().command('edit', { text: 'Prototype' });
      await desktop().click('Weiter');
      await desktop().text('Material *');
      await desktop().click('Wood');
      // The client has the original option list. Changing the real server's
      // constraint makes the next submission fail validation at the actual handler.
      await db.getRepository(FormField).update(choice.id, { options: ['Metal'] });
      await desktop().click('Absenden');
      await desktop().text('Bitte Eingabe korrigieren.');
      expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
      await desktop().snapshot('server-rejected-form');
      await desktop().click('Metal');
      await desktop().click('Absenden');
      await waitFor(
        () =>
          db
            .getRepository(ResourceUsage)
            .exists({ where: { resourceId: resource.id, userId: owner.id, projectId: project.id } }),
        'project usage start',
      );
      const usage = await db
        .getRepository(ResourceUsage)
        .findOneByOrFail({ resourceId: resource.id, userId: owner.id });
      expect(usage.endTime).toBeNull();
      expect(socket().state.lastAuthenticatedUserId).toBe(owner.id);
      const persistedReader = await db
        .getRepository(Attractap)
        .findOneOrFail({ where: { id: reader.id }, relations: ['resources'] });
      expect(persistedReader.resources.map((item) => item.id)).toContain(usage.resourceId);
      await desktop().text('Sitzung beenden');
      await desktop().snapshot('project-session');
      await desktop().click('Sitzung beenden');
      await desktop().text('Work note *');
      await desktop().click('Weiter');
      await desktop().text('Bitte markierte Felder ausfüllen.');
      expect((await db.getRepository(ResourceUsage).findOneByOrFail({ id: usage.id })).endTime).toBeNull();
      await desktop().snapshot('required-end-form');
      await desktop().click('Antippen zum Eingeben');
      await desktop().command('edit', { text: 'Finished' });
      await desktop().click('Weiter');
      await desktop().click('Metal');
      await desktop().click('Absenden');
      await waitFor(
        async () => Boolean((await db.getRepository(ResourceUsage).findOneByOrFail({ id: usage.id })).endTime),
        'usage end',
      );
      const submissions = await db.getRepository(FormSubmission).findBy({ resourceUsageId: usage.id });
      expect(submissions).toHaveLength(2);
      expect(submissions.map((submission) => submission.action).sort()).toEqual(['end', 'start']);
      for (const submission of submissions) {
        expect(submission.userId).toBe(owner.id);
        expect(submission.formId).toBe(form.id);
        expect(submission.data[String(text.id)].value).toBe(submission.action === 'start' ? 'Prototype' : 'Finished');
        expect(submission.data[String(choice.id)].value).toBe('Metal');
      }
    }, 120_000);

    it.each(['approval', 'http-abort', 'reader-disconnect'] as const)(
      'handles web supervision %s',
      async (outcomeType) => {
        await start('supervision');
        const supervisor = await user('supervisor');
        const requester = await user('requester', false);
        await db.getRepository(ResourceIntroducer).save({ resourceId: resource.id, userId: supervisor.id });
        await db.getRepository(Resource).update(resource.id, { supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
        await enroll(supervisor);
        await desktop().screen('locked');
        let settled = false;
        const controller = new AbortController();
        const pending = request(
          requester,
          `/resources/${resource.id}/usage/supervision/request`,
          { readerId: reader.id },
          AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
        ).then(
          (response) => {
            settled = true;
            return { response, error: undefined };
          },
          (error: unknown) => {
            settled = true;
            return { response: undefined, error };
          },
        );
        try {
          await desktop().screen('supervision');
          expect(settled).toBe(false);
          const requests = api().get(SupervisionService).listPendingForSupervisor(supervisor.id);
          expect(requests).toHaveLength(1);
          expect(requests[0]).toMatchObject({ resourceId: resource.id, requesterUserId: requester.id });
          expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
          await desktop().snapshot('supervision-request');
          if (outcomeType !== 'approval') {
            if (outcomeType === 'http-abort') {
              const connection = socket();
              const original = connection.sendMessage;
              const cancellations: { payload: unknown; result: Promise<boolean> }[] = [];
              connection.sendMessage = function (message) {
                const delivery = original.call(this, message);
                if (message.data.type === AttractapEventType.SUPERVISION_RESOLVED) {
                  cancellations.push({ payload: message.data.payload, result: delivery });
                }
                return delivery;
              };
              try {
                controller.abort(new Error('Injected supervision request failure'));
                expect((await pending).error).toBeDefined();
                await desktop().text('Something went wrong. Please try again.');
                await desktop().screen('resources');
                const cancelled = await desktop().command('inspect');
                expect(cancelled.labels).not.toContain('Aufsichts-Karte auflegen');
                await desktop().snapshot('supervision-cancelled');
                expect(cancellations).toHaveLength(1);
                expect(cancellations[0].payload).toMatchObject({ success: false, resourceId: resource.id });
                const acknowledged = await cancellations[0].result;
                desktop().recordDelivery(
                  reader.id,
                  connection.id,
                  AttractapEventType.SUPERVISION_RESOLVED,
                  acknowledged,
                );
                expect(acknowledged).toBe(true);
                expect(connection.state.supervisionFlow).toBeNull();
              } finally {
                connection.sendMessage = original;
              }
            } else {
              const root = desktop().root;
              await desktop().dispose();
              expect(existsSync(root)).toBe(false);
              const outcome = await pending;
              expect(outcome.response?.status).toBe(408);
            }
            await waitFor(
              () => api().get(SupervisionService).listPendingForSupervisor(supervisor.id).length === 0,
              `backend supervision cancellation after ${outcomeType}`,
            );
            if (outcomeType === 'http-abort') {
              // The reader stays connected: HTTP cancellation must clean up on its own.
              expect((await desktop().command('inspect')).authenticated).toBe(true);
              expect(socket().readerId).toBe(reader.id);
            }
            expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
            expect(settled).toBe(true);
            return;
          }
          await desktop().present(3);
          await desktop().text('Karte nicht gefunden');
          expect(settled).toBe(false);
          expect(await db.getRepository(ResourceUsage).countBy({ resourceId: resource.id })).toBe(0);
          await desktop().remove(3);
          await desktop().present();
          const outcome = await pending;
          if (!outcome.response) throw outcome.error;
          const response = outcome.response;
          expect(response.status).toBe(201);
          const approved = await response.json();
          const usage = await db.getRepository(ResourceUsage).findOneByOrFail({ id: approved.id });
          expect(usage.userId).toBe(requester.id);
          expect(usage.supervisorUserId).toBe(supervisor.id);
          expect(usage.resourceId).toBe(resource.id);
          expect(usage.endTime).toBeNull();
          await desktop().text('Freigegeben!');
          const confirmation = await desktop().command('inspect');
          expect(confirmation.labels).toContain('Aufsicht bestätigt');
          expect(confirmation.labels).not.toContain('Aufsichts-Karte auflegen');
          await desktop().snapshot('supervision-approved');
        } finally {
          // Always consume the bounded HTTP request, including if a screen assertion fails.
          try {
            if (outcomeType === 'approval') await desktop().remove();
          } finally {
            controller.abort();
            await pending;
          }
        }
      },
      60_000,
    );
  });

  it('cleans up after failed startup and a failing scenario assertion', async () => {
    const failed = new DesktopFixture('invalid-endpoint', 'startup-failure');
    try {
      await expect(failed.start()).rejects.toThrow();
    } finally {
      await failed.dispose();
    }
    expect(existsSync(failed.root)).toBe(false);
    await start('assertion-cleanup');
    const ownedRoot = desktop().root;
    await expect(
      (async () => {
        try {
          const observed = await desktop().command('inspect');
          expect(observed.readerId).toBe(-1); // Deliberate scenario assertion failure.
        } finally {
          await desktop().dispose();
        }
      })(),
    ).rejects.toThrow();
    expect(existsSync(ownedRoot)).toBe(false);
  }, 30_000);

  it('rejects malformed commands, unsafe captures, invalid indices and bounded waits without stopping', async () => {
    await start('control-failures');
    for (const input of [
      '{',
      '{}',
      '{"action":"unknown"}',
      '{"action":"present","card":-1}',
      '{"action":"corrupt-key","slot":6}',
      '{"action":"snapshot","text":"../escape"}',
      '{"action":"faults","write":"yes"}',
      ' '.repeat(4097),
    ]) {
      expect((await desktop().exchange(input, 'malformed command')).ok).toBe(false);
    }
    expect(
      (await desktop().exchange('{"action":"wait-text","text":"never displayed"}', 'bounded missing text')).ok,
    ).toBe(false);
    expect((await desktop().command('inspect')).authenticated).toBe(true);
  }, 45_000);
});
