import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { User } from '@attraccess/database-entities';
import { WebSocket } from 'ws';
import { DeviceEnrollmentService } from '../../device-enrollment/device-enrollment.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { SessionService } from '../../users-and-auth/auth/session.service';
import { enrollmentAdapter, enrollmentClock, EnrollmentHarness } from './enrollment-adapter.test-fixture';

export function registerEnrollmentApprovalLimits(get: () => EnrollmentHarness) {
  for (const type of ['reader', 'companion'] as const) {
    it(`${type}: bounds approval guesses per account, IP and globally without device authority`, async () => {
      const h = get();
      const a = enrollmentAdapter(h, type);
      const clock = enrollmentClock();
      const before = await a.devices.count();
      let socket: WebSocket;
      let approve: jest.SpyInstance | undefined;
      try {
        socket = await a.connect();
        await a.announce(socket, 'LIM-123');
        const tokens: string[] = [];
        for (let i = 0; i < 25; i++) {
          const user = await h.db
            .getRepository(User)
            .save({ username: randomUUID(), email: `${randomUUID()}@example.test`, isEmailVerified: true });
          await h.app.get(RbacService).assignRoleByKey(user.id, 'administrator');
          tokens.push(await h.app.get(SessionService).createSession(user));
        }
        const path = `/api/${type === 'reader' ? 'attractap/readers' : 'companion-devices'}/enrollment/approve`;
        const guess = (token: string) =>
          request(h.app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send({ code: 'BAD-123' });
        for (let i = 0; i < 5; i++) await guess(tokens[0]).expect(404);
        await guess(tokens[0]).expect(429);
        clock.advance(61000);
        for (let i = 0; i < 20; i++) await guess(tokens[i]).expect(404);
        await guess(tokens[20]).expect(429);
        clock.advance(61000);
        const enrollment = h.app.get(DeviceEnrollmentService);
        const realApprove = enrollment.approve.bind(enrollment);
        // Distinct authenticated administrators and modeled remote peers exercise the global counter.
        approve = jest
          .spyOn(enrollment, 'approve')
          .mockImplementation((kind, code, account) =>
            realApprove(kind, code, account, `test-admin-peer-${account.id}`),
          );
        for (let i = 0; i < 100; i++) await guess(tokens[i % tokens.length]).expect(404);
        await guess(tokens[0]).expect(429);
        expect(await a.devices.count()).toBe(before);
        await a.assertNoAuthority(socket);
        await a.approve('LIM-123').expect(429);
      } finally {
        approve?.mockRestore();
        clock.mockRestore();
        a.protectedCall.mockRestore();
        socket?.terminate();
      }
    }, 60000);
  }
}
