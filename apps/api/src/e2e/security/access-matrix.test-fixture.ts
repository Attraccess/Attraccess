import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Resource,
  ResourceType,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroducerType,
  User,
  SupervisionMode,
} from '@attraccess/database-entities';
import { SessionService } from '../../users-and-auth/auth/session.service';
import { LiveUpdatesService } from '../../live-updates/live-updates.service';
import { ResourceEventsService } from '../../resources/sse/resource-events.service';

export function registerAccessMatrix(
  get: () => { app: NestExpressApplication; db: DataSource; admin: string; ordinary: string; base: string },
) {
  it('denies anonymous, invalid and expired sessions before allocating streams or reading access lists', async () => {
    const { app, db } = get();
    const user = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-member' });
    const expired = await app.get(SessionService).createSession(user, { expiresIn: -1 });
    const open = jest.spyOn(app.get(LiveUpdatesService), 'open');
    const legacy = jest.spyOn(app.get(ResourceEventsService), 'subscribeResource');
    try {
      for (const token of [undefined, 'invalid', expired]) {
        for (const path of [
          '/resources/in-use',
          '/resources/1/usage/active',
          '/resources/1/health',
          '/resources/1/events',
          '/resources/1/introductions',
          '/resources/1/introducers',
          '/resource-groups/1/introductions',
          '/resource-groups/1/introducers',
          `/live-updates/${randomUUID()}/events`,
        ]) {
          const call = request(app.getHttpServer()).get(`/api${path}`);
          if (token) call.set('Authorization', `Bearer ${token}`);
          expect({ path, status: (await call).status }).toEqual({ path, status: 401 });
        }
        const update = request(app.getHttpServer())
          .put(`/api/live-updates/${randomUUID()}/subscriptions`)
          .send({ revision: 0, subscriptions: [] });
        if (token) update.set('Authorization', `Bearer ${token}`);
        await update.expect(401);
      }
      expect(open).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
      legacy.mockRestore();
    }
  });

  it('requires directory read authority for both purposes and permits names-only reader controls', async () => {
    const { app, db, ordinary } = get();
    const users = db.getRepository(User);
    const denied = await users.save({
      username: 'no-resource-permissions',
      email: 'denied@example.test',
      isEmailVerified: true,
    });
    const token = await app.get(SessionService).createSession(denied);
    const resource = await db.getRepository(Resource).save({
      name: 'Directory machine',
      type: ResourceType.Machine,
      supervisionMode: SupervisionMode.SUPERVISION_ALLOWED,
    });
    for (const purpose of ['help', 'supervision']) {
      const path = `/api/resources/${resource.id}/introducer-directory?purpose=${purpose}`;
      await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).expect(403);
      expect(
        (await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ordinary}`).expect(200)).body,
      ).toEqual([]);
    }
  });

  it('separates group maintainer, member, introducer and manager access to full lists and history', async () => {
    const { app, db, ordinary, admin } = get();
    const member = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-member' });
    const group = await db.getRepository(ResourceGroup).save({ name: 'Private group' });
    const grants = db.getRepository(ResourceIntroducer);
    const paths = [
      `/api/resource-groups/${group.id}/introductions`,
      `/api/resource-groups/${group.id}/introductions/${member.id}/history`,
    ];
    for (const path of paths)
      await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ordinary}`).expect(403);
    const grant = await grants.save({
      userId: member.id,
      resourceGroupId: group.id,
      type: ResourceIntroducerType.MAINTAINER,
    });
    for (const path of paths)
      await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ordinary}`).expect(403);
    await grants.update(grant.id, { type: ResourceIntroducerType.INTRODUCER });
    for (const path of paths) {
      await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ordinary}`).expect(200);
      await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${admin}`).expect(200);
    }
  });

  it('starts and ends equipment use through local HTTP while external networking is denied', async () => {
    const { app, db } = get();
    const login = await request(app.getHttpServer())
      .post('/api/auth/session/local')
      .send({ username: 'enrollment-admin', password: 'local-test-password', tokenLocation: 'body' })
      .expect(201);
    const admin = login.body.authToken;
    const resource = await db.getRepository(Resource).save({ name: 'Offline equipment', type: ResourceType.Machine });
    const start = await request(app.getHttpServer())
      .post(`/api/resources/${resource.id}/usage/start`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);
    expect(start.body.resourceId).toBe(resource.id);
    const active = await request(app.getHttpServer())
      .get(`/api/resources/${resource.id}/usage/active`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(active.body.usage.id).toBe(start.body.id);
    await request(app.getHttpServer())
      .put(`/api/resources/${resource.id}/usage/end`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(200);
    const ended = await request(app.getHttpServer())
      .get(`/api/resources/${resource.id}/usage/active`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(ended.body.usage).toBeNull();
    await request(app.getHttpServer()).delete('/api/auth/session').set('Authorization', `Bearer ${admin}`).expect(200);
    expect(await app.get(SessionService).validateSession(admin)).toBeNull();
    await request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${admin}`).expect(401);
  });
}
