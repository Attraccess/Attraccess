import * as delivery from '../../device-enrollment/send-device-credentials';
import { AuditService } from '../../audit/audit.service';
import { WebSocket } from 'ws';
import { enrollmentAdapter, enrollmentClock, EnrollmentHarness } from './enrollment-adapter.test-fixture';

export function registerEnrollmentRaces(get: () => EnrollmentHarness) {
  for (const type of ['reader', 'companion'] as const) {
    it(`${type}: preserves rows, credential binding and authority through expiry and approval races`, async () => {
      const h = get();
      const a = enrollmentAdapter(h, type);
      const before = await a.devices.count();
      const clock = enrollmentClock();
      const opened: WebSocket[] = [];
      const pending = async (code: string) => {
        const socket = await a.connect();
        opened.push(socket);
        await a.announce(socket, code);
        await a.assertNoAuthority(socket);
        expect(await a.devices.count()).toBe(before);
        return socket;
      };
      try {
        const boundary = await pending('BEF-123');
        clock.advance(29999);
        const approved = await a.approve('BEF-123').expect(201);
        const issued = await a.credentials(boundary);
        expect(issued.id).toBe(approved.body.id);
        a.authenticate(boundary, issued);
        await a.receive(boundary, 'AUTHENTICATED');
        // Positive control: the exact protected action denied while pending now reaches its handler.
        a.protectedCall.mockClear();
        a.send(boundary, type === 'reader' ? 'REQUEST_RESOURCE_LIST' : 'COMPANION_IDLE', { idleSeconds: 1 });
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(a.protectedCall).toHaveBeenCalled();
        await a.devices.delete(issued.id);
        boundary.close();
        for (const elapsed of [30000, 30001]) {
          clock.advance(61000);
          const expired = await pending('EXP-123');
          clock.advance(elapsed);
          await a.approve('EXP-123').expect(404);
          await a.assertNoAuthority(expired);
          expired.close();
        }
        clock.advance(61000);
        const collision = await pending('COL-123');
        const other = await pending('COL-123');
        await a.approve('COL-123').expect(404);
        await a.assertNoAuthority(collision);
        await a.assertNoAuthority(other);
        collision.close();
        other.close();
        for (const race of [
          'rotation',
          'disconnect',
          'expiry',
          'creation-failure',
          'delivery-failure',
          'concurrent',
          'audit-failure',
        ] as const) {
          clock.advance(61000);
          const socket = await pending('RAC-123');
          let created: { id: number; token: string } | undefined;
          let release!: () => void, entered!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          const started = new Promise<void>((resolve) => {
            entered = resolve;
          });
          const delayed = a.delayCreation(async (current) => {
            if (race !== 'creation-failure') created = await a.create(current);
            entered();
            await gate;
            if (race === 'creation-failure') throw new Error('Injected creation failure');
            return created;
          });
          // Capture the real attempted credentials rather than testing an arbitrary invalid token.
          const attempts: object[] = [];
          const send = delivery.sendDeviceCredentials;
          const sendSpy = jest.spyOn(delivery, 'sendDeviceCredentials').mockImplementation(async (target, message) => {
            expect(target).toBeDefined();
            attempts.push(message);
            if (race === 'delivery-failure') throw new Error('Injected pre-write failure');
            return send(target, message);
          });
          const audit =
            race === 'audit-failure'
              ? jest
                  .spyOn(h.app.get(AuditService), 'recordAdministration')
                  .mockRejectedValue(new Error('Injected audit persistence failure'))
              : undefined;
          try {
            const approval = a.approve('RAC-123').then((response) => response);
            await started;
            await a.assertNoAuthority(socket);
            if (race === 'rotation') await a.announce(socket, 'NEW-456');
            if (race === 'disconnect') {
              const closed = new Promise((resolve) => socket.once('close', resolve));
              socket.close();
              await closed;
            }
            if (race === 'expiry') clock.advance(30000);
            if (race === 'concurrent') await a.approve('RAC-123').expect(409);
            release();
            const result = await approval;
            const succeeds = race === 'concurrent' || race === 'audit-failure';
            expect(result.status).toBe(
              succeeds ? 201 : ['creation-failure', 'delivery-failure'].includes(race) ? 500 : 409,
            );
            expect(attempts).toHaveLength(succeeds || race === 'delivery-failure' ? 1 : 0);
            if (succeeds) {
              expect(await a.credentials(socket)).toMatchObject(created);
              await a.assertNoAuthority(socket); // Credential delivery alone is not device authentication.
              a.authenticate(socket, created);
              await a.receive(socket, 'AUTHENTICATED');
            } else await a.assertNoAuthority(socket);
            const retainsRow = succeeds || race === 'delivery-failure';
            expect(await a.devices.count()).toBe(before + Number(retainsRow));
            await a.approve('RAC-123').expect(404);
            // A new connection cannot recover a consumed code or receive its credentials.
            const reconnect = await a.connect();
            opened.push(reconnect);
            await a.announce(reconnect, 'RAC-123');
            await a.assertNoAuthority(reconnect);
            expect(attempts).toHaveLength(succeeds || race === 'delivery-failure' ? 1 : 0);
            if (created && !retainsRow) {
              a.authenticate(reconnect, created);
              await a.receive(reconnect, 'UNAUTHORIZED');
              await a.assertNoAuthority(reconnect);
            }
            if (retainsRow) {
              const unrelated = await a.create(() => true);
              a.authenticate(reconnect, { id: unrelated.id, token: created.token });
              await a.receive(reconnect, 'UNAUTHORIZED');
              await a.assertNoAuthority(reconnect);
              await a.devices.delete(unrelated.id);
              await a.devices.delete(created.id);
            }
            if (created) {
              // Actual issued token cannot authenticate a missing/different device row.
              a.authenticate(reconnect, created);
              await a.receive(reconnect, 'UNAUTHORIZED');
              await a.assertNoAuthority(reconnect);
            }
            reconnect.close();
            socket.close();
          } finally {
            release();
            delayed.mockRestore();
            sendSpy.mockRestore();
            audit?.mockRestore();
          }
        }
        expect(await a.devices.count()).toBe(before);
      } finally {
        clock.mockRestore();
        a.protectedCall.mockRestore();
        for (const socket of opened) socket.terminate();
      }
    }, 60000);
  }
}
