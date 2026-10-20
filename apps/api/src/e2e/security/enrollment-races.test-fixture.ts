import * as delivery from '../../device-enrollment/send-device-credentials';
import { DataSource } from 'typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { CompanionDevice } from '@attraccess/database-entities';
import { WebSocket } from 'ws';
import request from 'supertest';
import { CompanionService } from '../../companion/companion.service';

export function registerEnrollmentRaces(
  get: () => {
    app: NestExpressApplication;
    db: DataSource;
    admin: string;
    connect: () => Promise<WebSocket>;
    receive: (socket: WebSocket, event: string) => Promise<unknown>;
    send: (socket: WebSocket, event: string, data: unknown) => void;
  },
) {
  it('keeps real rows and credentials safe through expiry, collision, concurrent approval and creation races', async () => {
    const { app, db, admin, connect, receive, send } = get();
    const devices = db.getRepository(CompanionDevice);
    const before = await devices.count();
    let now = performance.now();
    const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
    const opened: WebSocket[] = [];
    const approve = (code: string) =>
      request(app.getHttpServer())
        .post('/api/companion-devices/enrollment/approve')
        .set('Authorization', `Bearer ${admin}`)
        .send({ code });
    async function pending(code: string) {
      const socket = await connect();
      opened.push(socket);
      await receive(socket, 'COMPANION_REQUEST_AUTHENTICATION');
      send(socket, 'COMPANION_REGISTER', { enrollmentCode: code });
      await receive(socket, 'COMPANION_ENROLLMENT_STATUS');
      return socket;
    }
    try {
      const boundary = await pending('BEF-123');
      now += 29999;
      const beforeExpiry = await approve('BEF-123').expect(201);
      await receive(boundary, 'COMPANION_REGISTER_RESPONSE');
      expect(await devices.count()).toBe(before + 1);
      await devices.delete(beforeExpiry.body.id);
      boundary.close();
      now += 61000;
      await pending('EXP-123');
      now += 30000;
      await approve('EXP-123').expect(404);
      now += 61000;
      await pending('AFT-123');
      now += 30001;
      await approve('AFT-123').expect(404);
      now += 61000;
      const collision = await pending('COL-123');
      await pending('COL-123');
      await receive(collision, 'COMPANION_ENROLLMENT_STATUS');
      await approve('COL-123').expect(404);
      expect(await devices.count()).toBe(before);
      for (const race of [
        'rotation',
        'disconnect',
        'expiry',
        'creation-failure',
        'delivery-failure',
        'concurrent',
      ] as const) {
        now += 61000;
        const socket = await pending('RAC-123');
        const service = app.get(CompanionService);
        const create = service.createDevice.bind(service);
        let createdId: number;
        let release!: () => void, entered!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const delayed = jest.spyOn(service, 'createDevice').mockImplementationOnce(async (...args) => {
          if (race === 'creation-failure') {
            entered();
            await gate;
            throw new Error('Injected creation failure');
          }
          const result = await create(...args);
          createdId = result.device.id;
          entered();
          await gate;
          return result;
        });
        const failedDelivery =
          race === 'delivery-failure'
            ? jest.spyOn(delivery, 'sendDeviceCredentials').mockRejectedValueOnce(new Error('Injected send failure'))
            : undefined;
        const approval = approve('RAC-123').then((response) => response);
        await started;
        if (race === 'rotation') {
          send(socket, 'COMPANION_REGISTER', { enrollmentCode: 'NEW-456' });
          await receive(socket, 'COMPANION_ENROLLMENT_STATUS');
        }
        if (race === 'disconnect') {
          socket.close();
          await new Promise((resolve) => socket.once('close', resolve));
        }
        if (race === 'expiry') now += 30000;
        if (race === 'concurrent') await approve('RAC-123').expect(409);
        release();
        const result = await approval;
        delayed.mockRestore();
        failedDelivery?.mockRestore();
        expect(result.status).toBe(
          race === 'concurrent' ? 201 : ['creation-failure', 'delivery-failure'].includes(race) ? 500 : 409,
        );
        if (race === 'concurrent') {
          await receive(socket, 'COMPANION_REGISTER_RESPONSE');
          expect(await devices.count()).toBe(before + 1);
          await devices.delete(result.body.id);
        } else if (race === 'delivery-failure') {
          // An attempted write is ambiguous: retain its unusable credential row,
          // consume the code and never replay the credential to another connection.
          expect(await devices.count()).toBe(before + 1);
          const row = await devices.findOneByOrFail({ id: createdId });
          expect(await service.verifyToken(row, 'invalid')).toBe(false);
          expect(row).toBeDefined();
          await devices.delete(row.id);
        } else expect(await devices.count()).toBe(before);
        await approve('RAC-123').expect(404);
        socket.close();
      }
      expect(await devices.count()).toBe(before);
      now += 61000;
      for (let n = 0; n < 5; n++) await approve('BAD-000').expect(404);
      await approve('BAD-000').expect(429);
      now += 61000;
      const flood = await pending('FLD-000');
      for (const code of ['FLD-001', 'FLD-002', 'FLD-003']) {
        send(flood, 'COMPANION_REGISTER', { enrollmentCode: code });
        await receive(flood, 'COMPANION_ENROLLMENT_STATUS');
      }
      await approve('FLD-003').expect(404);
      expect(await devices.count()).toBe(before);
      for (const socket of opened) socket.terminate();
      await new Promise((resolve) => setTimeout(resolve, 20));
      now += 61000;
      for (let n = 0; n < 8; n++) await pending(`CAP-00${n}`);
      const excess = await connect();
      opened.push(excess);
      if (excess.readyState !== WebSocket.CLOSED) {
        const code = await new Promise<number>((resolve) => excess.once('close', resolve));
        expect(code).toBe(1008);
      }
      expect(await devices.count()).toBe(before);
    } finally {
      clock.mockRestore();
      for (const socket of opened) socket.terminate();
    }
  }, 30000);
}
