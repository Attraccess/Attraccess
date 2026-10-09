import express from 'express';
import request from 'supertest';
import { samlSession } from './main.bootstrap';

describe('SAML state transport', () => {
  function app(trustProxy: boolean) {
    const server = express();
    server.set('trust proxy', trustProxy);
    server.use(samlSession('fixture-secret'));
    server.get('/state', (req, res) => {
      req.session['attempts'] = (req.session['attempts'] ?? 0) + 1;
      res.json({ attempts: req.session['attempts'] });
    });
    return server;
  }

  it('sets Secure, HttpOnly and SameSite=Lax behind a trusted TLS proxy and restores state', async () => {
    const server = app(true);
    const start = await request(server).get('/state').set('X-Forwarded-Proto', 'https');
    const cookie = start.headers['set-cookie'][0];
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('; HttpOnly');
    expect(cookie).toContain('; SameSite=Lax');
    const callback = await request(server).get('/state').set('X-Forwarded-Proto', 'https').set('Cookie', cookie);
    expect(callback.body).toEqual({ attempts: 2 });
  });

  it.each([false, true])('never emits state cookies over plain HTTP (trust proxy=%s)', async (trustProxy) => {
    const result = await request(app(trustProxy)).get('/state');
    expect(result.headers['set-cookie']).toBeUndefined();
  });

  it('does not let an untrusted forwarded-proto header cause a state cookie to be issued', async () => {
    const result = await request(app(false)).get('/state').set('X-Forwarded-Proto', 'https');
    expect(result.headers['set-cookie']).toBeUndefined();
  });
});
