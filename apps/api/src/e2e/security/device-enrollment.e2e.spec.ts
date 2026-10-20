import { CompanionService } from '../../companion/companion.service';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import net from 'node:net';
import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { WebSocket } from 'ws';
import request from 'supertest';
import {
  Attractap,
  CompanionDevice,
  User,
  AuthenticationDetail,
  AuthenticationType,
  Resource,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  ResourceIntroducer,
  ResourceIntroducerType,
} from '@attraccess/database-entities';
import { ResourceEventsService } from '../../resources/sse/resource-events.service';
import { SettingsService } from '../../settings/settings.service';
import { SessionService } from '../../users-and-auth/auth/session.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { configureBootstrapApi, configureBootstrapHttp } from '../../main.bootstrap';

// Actual HTTP guards, websocket adapter/gateways, migrations, SQLite and token hashing.
// No hardware or external service is needed for device approval and reconnect.
describe('device enrollment over HTTP and WebSocket', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let base: string;
  let admin: string;
  let ordinary: string;
  const sockets: WebSocket[] = [];
  type PacketData = {
    type?: string;
    messageId?: number;
    id?: number;
    token?: string;
    payload?: { id?: number; token?: string; message?: string; enrollmentVersion?: number; enrollmentCode?: string };
  };
  const messages = new Map<WebSocket, Array<{ event: string; data: PacketData }>>();
  async function connect(path = '/api/companion/websocket') {
    const socket = new WebSocket(base.replace('http:', 'ws:') + path);
    sockets.push(socket);
    messages.set(socket, []);
    socket.on('message', (raw) => {
      const value = JSON.parse(raw.toString());
      messages.get(socket).push(value);
      if (value.event === 'EVENT') {
        messages.get(socket).push({ event: value.data.type, data: value.data });
        socket.send(JSON.stringify({ event: 'EVENT', data: { type: `ACK_${value.data.type}` } }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return socket;
  }
  async function receive(socket: WebSocket, event: string) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const index = messages.get(socket).findIndex((m) => m.event === event);
      if (index >= 0) return messages.get(socket).splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Missing websocket event ${event}`);
  }
  const send = (socket: WebSocket, event: string, data: unknown) => socket.send(JSON.stringify({ event, data }));
  const approve = (type: 'reader' | 'companion', token: string, code: string) =>
    request(app.getHttpServer())
      .post(`/api/${type === 'reader' ? 'attractap/readers' : 'companion-devices'}/enrollment/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code });

  beforeAll(async () => {
    process.env.DISABLE_PLUGINS = 'true';
    process.env.AUTH_SESSION_SECRET = 'enrollment-integration-test-secret';
    process.env.ATTRACCESS_URL = 'http://allowed.example';
    delete process.env.SSL_GENERATE_SELF_SIGNED_CERTIFICATES;
    const { PluginService } = await import('../../plugin-system/plugin.service');
    PluginService.configure({ PLUGIN_DIR: process.env.STORAGE_ROOT + '/plugins', RESTART_BY_EXIT: false });
    const { AppModule } = await import('../../app/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    const config = app.get(ConfigService).get('app');
    configureBootstrapHttp(app, config, new Logger('Test'));
    await configureBootstrapApi(app, config, new Logger('Test'));
    const settings = app.get(SettingsService);
    await settings.updateAppSettings({
      url: 'http://allowed.example',
      licenseKey:
        'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md',
    });
    db = app.get(DataSource);
    const users = db.getRepository(User);
    const owner = await users.save(
      users.create({ username: 'enrollment-admin', email: 'admin@example.test', isEmailVerified: true }),
    );
    await db.getRepository(AuthenticationDetail).save({
      userId: owner.id,
      type: AuthenticationType.LOCAL_PASSWORD,
      password: await bcrypt.hash('local-test-password', 10),
    });
    const member = await users.save(
      users.create({ username: 'enrollment-member', email: 'member@example.test', isEmailVerified: true }),
    );
    await app.get(RbacService).assignRoleByKey(owner.id, 'administrator');
    await app.get(RbacService).assignDefaultRoles(member.id);
    admin = await app.get(SessionService).createSession(owner);
    ordinary = await app.get(SessionService).createSession(member);
    const realConnect = net.Socket.prototype.connect;
    jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket, ...args: unknown[]) {
      const options = (Array.isArray(args[0]) ? args[0][0] : args[0]) as { host?: string } | number | string;
      const host = typeof options === 'object' ? options.host : typeof args[1] === 'string' ? args[1] : 'localhost';
      if (host && !['localhost', '127.0.0.1', '::1'].includes(host))
        throw new Error('External network denied by local-operation test');
      return realConnect.apply(this, args as Parameters<typeof realConnect>);
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 120000);
  afterAll(async () => {
    for (const socket of sockets) socket.terminate();
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  it('requires sign-in for activity and preserves local password login and safe POST refresh with external networking denied', async () => {
    for (const path of [
      '/api/resources/in-use',
      '/api/resources/1/usage/active',
      '/api/resources/1/health',
      '/api/resources/1/events',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    const login = await request(app.getHttpServer())
      .post('/api/auth/session/local')
      .send({ username: 'enrollment-admin', password: 'local-test-password', tokenLocation: 'body' })
      .expect(201);
    const token = login.body.authToken;
    expect(token).toBeTruthy();
    const refreshPath = '/api/auth/session/refresh';
    await request(app.getHttpServer()).get(refreshPath).set('Authorization', `Bearer ${token}`).expect(404);
    await request(app.getHttpServer())
      .post(refreshPath)
      .set('Cookie', `auth-session=${token}`)
      .set('Origin', 'http://sibling.example')
      .send({ tokenLocation: 'body' })
      .expect(403);
    // Denial happens before token rotation; the original credential still works.
    expect(await app.get(SessionService).validateSession(token)).toBeTruthy();
    await request(app.getHttpServer())
      .post(refreshPath)
      .set('Authorization', 'Bearer invalid')
      .set('Cookie', `auth-session=${token}`)
      .set('Origin', 'http://allowed.example')
      .send({})
      .expect(401);
    const cookie = await request(app.getHttpServer())
      .post(refreshPath)
      .set('Cookie', `auth-session=${token}`)
      .set('Origin', 'http://allowed.example')
      .send({ tokenLocation: 'body' })
      .expect(201);
    expect(cookie.body.authToken).toBe('');
    expect(cookie.headers['cache-control']).toBe('no-store');
    expect(cookie.headers['set-cookie'].join(';')).toContain('auth-session=');
    const bearer = await request(app.getHttpServer())
      .post(refreshPath)
      .set('Authorization', `Bearer ${admin}`)
      .send({ tokenLocation: 'body' })
      .expect(201);
    expect(bearer.body.authToken).toBeTruthy();
    expect(bearer.headers['cache-control']).toBe('no-store');
    admin = bearer.body.authToken;
  });

  it('filters private activity before pagination while preserving browsing and the names-only help directory', async () => {
    const member = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-member' });
    const owner = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-admin' });
    const resources = db.getRepository(Resource);
    const visible = await resources.save({ name: 'Visible machine', type: ResourceType.Machine });
    const hidden = await resources.save({ name: 'Private machine', type: ResourceType.Machine });
    for (const resource of [visible, hidden])
      await db.getRepository(ResourceUsage).save({
        resourceId: resource.id,
        userId: member.id,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        isFinalized: true,
      });
    const introduction = await db
      .getRepository(ResourceIntroduction)
      .save({ resourceId: visible.id, receiverUserId: member.id, tutorUserId: owner.id });
    await db
      .getRepository(ResourceIntroductionHistoryItem)
      .save({ introductionId: introduction.id, performedByUserId: owner.id, action: IntroductionHistoryAction.GRANT });
    await db
      .getRepository(ResourceIntroducer)
      .save({ resourceId: hidden.id, userId: owner.id, type: ResourceIntroducerType.INTRODUCER });
    const settings = app.get(SettingsService);
    const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ordinary}`);
    await settings.updateAppSettings({ activityVisibility: 'all-resources' });
    expect((await get('/api/resources/in-use').expect(200)).body).toHaveLength(2);
    await settings.updateAppSettings({ activityVisibility: 'introduced-resources' });
    expect((await get('/api/resources/in-use').expect(200)).body.map((r: Resource) => r.id)).toEqual([visible.id]);
    const page = await get('/api/resources?onlyInUseByMe=true&limit=1').expect(200);
    expect(page.body.total).toBe(1);
    expect(page.body.data[0].id).toBe(visible.id);
    const detail = await get(`/api/resources/${hidden.id}`).expect(200);
    expect(detail.body.name).toBe(hidden.name);
    expect(detail.body).not.toHaveProperty('usages');
    expect(detail.body).not.toHaveProperty('introductions');
    expect(detail.body).not.toHaveProperty('introducers');
    for (const tail of ['usage/active', 'health', 'events', 'introductions', 'introducers']) {
      const response = await get(`/api/resources/${hidden.id}/${tail}`);
      expect({ path: tail, status: response.status }).toEqual({ path: tail, status: 403 });
    }
    const directory = await get(`/api/resources/${hidden.id}/introducer-directory`).expect(200);
    expect(directory.body).toEqual([{ id: owner.id, username: owner.username }]);
    await db.getRepository(ResourceIntroduction).delete(introduction.id);
    await get(`/api/resources/${visible.id}/usage/active`).expect(403);
    await settings.updateAppSettings({ activityVisibility: 'all-resources' });
  });

  it.each(['visibility', 'session'] as const)(
    'stops an open legacy stream before publishing after %s is revoked',
    async (change) => {
      const resource = await db.getRepository(Resource).findOneByOrFail({ name: 'Private machine' });
      const member = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-member' });
      const token = await app.get(SessionService).createSession(member);
      const abort = new AbortController();
      const response = await fetch(`${base}/api/resources/${resource.id}/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      expect(response.status).toBe(200);
      const reader = response.body.getReader();
      await reader.read();
      if (change === 'visibility')
        await app.get(SettingsService).updateAppSettings({ activityVisibility: 'introduced-resources' });
      else await app.get(SessionService).revokeSession(token);
      app
        .get(ResourceEventsService)
        .handleResourceUsage({ usage: { resource, user: { email: 'CONFIDENTIAL' } } } as never);
      let remaining = '';
      try {
        await Promise.race([
          (async () => {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              remaining += new TextDecoder().decode(chunk.value);
            }
          })(),
          new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Revoked stream stayed open')), 3000);
            timer.unref();
          }),
        ]);
        expect(remaining).not.toContain('CONFIDENTIAL');
        expect(remaining).not.toContain('"inUse"');
      } finally {
        abort.abort();
        await app.get(SettingsService).updateAppSettings({ activityVisibility: 'all-resources' });
      }
    },
  );

  it('creates nothing until an administrator approves, consumes once, and reconnects using issued credentials', async () => {
    const socket = await connect();
    await receive(socket, 'COMPANION_REQUEST_AUTHENTICATION');
    send(socket, 'COMPANION_REGISTER', { enrollmentCode: 'ABC-123' });
    await receive(socket, 'COMPANION_ENROLLMENT_STATUS');
    expect(await db.getRepository(CompanionDevice).count()).toBe(0);
    await approve('companion', '', 'ABC-123').expect(401);
    await approve('companion', ordinary, 'ABC-123').expect(403);
    expect(await db.getRepository(CompanionDevice).count()).toBe(0);
    const approved = await approve('companion', admin, 'ABC-123').expect(201);
    const credentials = (await receive(socket, 'COMPANION_REGISTER_RESPONSE')).data;
    expect(credentials).toMatchObject({ id: approved.body.id, enrollmentVersion: 1, enrollmentCode: 'ABC-123' });
    expect(typeof credentials.token).toBe('string');
    expect(await db.getRepository(CompanionDevice).count()).toBe(1);
    await approve('companion', admin, 'ABC-123').expect(404);
    send(socket, 'COMPANION_AUTHENTICATE', { id: credentials.id, token: credentials.token });
    await receive(socket, 'COMPANION_AUTHENTICATED');
    const reconnect = await connect();
    await receive(reconnect, 'COMPANION_REQUEST_AUTHENTICATION');
    send(reconnect, 'COMPANION_AUTHENTICATE', { id: credentials.id, token: credentials.token });
    await receive(reconnect, 'COMPANION_AUTHENTICATED');
    // Authenticated sockets regain the normal payload bound, including fragmented messages.
    reconnect.send(JSON.stringify({ event: 'UNKNOWN', data: 'x'.repeat(5000) }), { fin: false });
    reconnect.send(' ', { fin: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reconnect.readyState).toBe(WebSocket.OPEN);
    expect(await db.getRepository(CompanionDevice).count()).toBe(1);
    // Pause real token verification so the reauthentication window is deterministic.
    const companions = app.get(CompanionService);
    const verify = companions.verifyToken.bind(companions);
    let started: () => void, resume: () => void;
    const verifying = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const delayed = jest.spyOn(companions, 'verifyToken').mockImplementationOnce(async (...args) => {
      started();
      await gate;
      return verify(...args);
    });
    try {
      send(reconnect, 'COMPANION_AUTHENTICATE', { id: credentials.id, token: 'invalid' });
      await verifying;
      const closed = new Promise<number>((resolve) => reconnect.once('close', resolve));
      reconnect.send('x'.repeat(3000), { fin: false });
      reconnect.send('x'.repeat(2000), { fin: true });
      expect(await closed).toBe(1009);
    } finally {
      resume();
      delayed.mockRestore();
    }
  });

  it('rejects browser upgrades from sibling origins before creating state or rows', async () => {
    const before = await db.getRepository(CompanionDevice).count();
    for (const origin of ['http://evil.example', 'null']) {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/companion/websocket', { origin });
      sockets.push(socket);
      const code = await new Promise<number>((resolve, reject) => {
        socket.on('unexpected-response', (_req, response) => {
          response.resume();
          socket.terminate();
          resolve(response.statusCode);
        });
        socket.on('open', () => reject(new Error('Hostile origin was admitted')));
        socket.on('error', () => undefined);
      });
      expect(code).toBe(403);
    }
    expect(await db.getRepository(CompanionDevice).count()).toBe(before);
  });

  it('bounds fragmented pending messages before JSON parsing', async () => {
    const socket = await connect();
    await receive(socket, 'COMPANION_REQUEST_AUTHENTICATION');
    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.send('x'.repeat(3000), { fin: false });
    socket.send('x'.repeat(2000), { fin: true });
    expect(await closed).toBe(1009);
  });

  it('requires updated reader enrollment and does not create legacy registrations', async () => {
    const reader = await connect('/api/attractap/websocket');
    await receive(reader, 'READER_REQUEST_AUTHENTICATION');
    send(reader, 'EVENT', { type: 'READER_REGISTER', payload: {} });
    const status = await receive(reader, 'READER_ENROLLMENT_STATUS');
    expect(status.data.payload.message).toContain('Upgrade');
    expect(await db.getRepository(Attractap).count()).toBe(0);
    send(reader, 'EVENT', { type: 'READER_REGISTER', payload: { enrollmentCode: 'RDR-456' } });
    await receive(reader, 'READER_ENROLLMENT_STATUS');
    const approved = await approve('reader', admin, 'RDR-456').expect(201);
    const issued = (await receive(reader, 'READER_REGISTER')).data.payload;
    expect(issued).toMatchObject({ id: approved.body.id, enrollmentVersion: 1, enrollmentCode: 'RDR-456' });
    const stored = await db.getRepository(Attractap).findOneByOrFail({ id: issued.id });
    expect(stored.apiTokenHash).not.toBe(issued.token);
    send(reader, 'EVENT', { type: 'READER_AUTHENTICATE', payload: { id: issued.id, token: issued.token } });
    await receive(reader, 'READER_AUTHENTICATED');
    expect(await db.getRepository(Attractap).count()).toBe(1);
  });
});
