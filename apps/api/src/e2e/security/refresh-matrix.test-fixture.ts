import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { SessionService } from '../../users-and-auth/auth/session.service';
import { ApiTokenService } from '../../users-and-auth/auth/api-token/api-token.service';

export function registerRefreshMatrix(get: () => { app: NestExpressApplication; db: DataSource }) {
  it('protects refresh across native tokens, mixed credentials and missing/null browser provenance', async () => {
    const { app, db } = get();
    const user = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-admin' });
    const sessions = app.get(SessionService);
    const api = await app
      .get(ApiTokenService)
      .create(user.id, { name: 'refresh denial', permissionKeys: ['resources.read'] });
    for (const mixed of [false, true]) {
      const token = await sessions.createSession(user);
      const call = request(app.getHttpServer())
        .post('/api/auth/session/refresh')
        .set('Authorization', `Bearer ${api.token}`)
        .send({ tokenLocation: 'body' });
      if (mixed) call.set('Cookie', `auth-session=${token}`).set('Origin', 'http://allowed.example');
      await call.expect(403);
      expect(await sessions.validateSession(token)).toBeTruthy();
    }
    for (const headers of [
      {},
      { Origin: 'null' },
      { Referer: 'http://sibling.example/path' },
      { Referer: 'invalid' },
    ]) {
      const token = await sessions.createSession(user);
      await request(app.getHttpServer())
        .post('/api/auth/session/refresh')
        .set('Cookie', `auth-session=${token}`)
        .set(headers)
        .send({ tokenLocation: 'body' })
        .expect(403);
      expect(await sessions.validateSession(token)).toBeTruthy();
    }
    for (const headers of [{ Origin: 'http://allowed.example' }, { Referer: 'http://allowed.example/path' }]) {
      for (const bearer of [false, true]) {
        const token = await sessions.createSession(user);
        const call = request(app.getHttpServer())
          .post('/api/auth/session/refresh')
          .set('Cookie', `auth-session=${token}`)
          .set(headers)
          .send({ tokenLocation: 'body' });
        if (bearer) call.set('Authorization', `Bearer ${token}`);
        const response = await call.expect(201);
        expect(response.body.authToken).toBe('');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
        expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
        expect(await sessions.validateSession(token)).toBeNull();
      }
    }
  });
}
