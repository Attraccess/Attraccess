import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { BrowserOriginPolicy, parseAllowedOrigins } from './browser-origin-policy';
import { browserRequestProtection } from './browser-request.middleware';

describe('browser origin protection', () => {
  let savedUrl = 'https://app.example.test';
  const policy = new BrowserOriginPolicy(async () => [savedUrl]);
  beforeEach(() => {
    savedUrl = 'https://app.example.test';
  });

  it.each([
    'null',
    '*',
    'https://app.example.test.attacker.test',
    'https://app.example.test:444',
    'http://app.example.test',
    'https://user@app.example.test',
    'https://app.example.test/path',
  ])('rejects %s', async (origin) => {
    expect(await policy.allows(origin)).toBe(false);
  });

  it('observes saved URL changes', async () => {
    expect(await policy.allows(savedUrl)).toBe(true);
    savedUrl = 'https://new.example.test';
    expect(await policy.allows('https://app.example.test')).toBe(false);
    expect(await policy.allows(savedUrl)).toBe(true);
  });

  it.each(['*', 'null', 'https://app.example.test/path', 'https://user@app.example.test'])(
    'rejects invalid configured origin %s',
    (value) => {
      expect(() => parseAllowedOrigins(value)).toThrow();
    },
  );

  it('rejects hostile forms and cookie writes before side effects, even with an Authorization header', async () => {
    let writes = 0;
    const app = express();
    app.use(cookieParser(), express.json(), express.urlencoded({ extended: false }), browserRequestProtection(policy));
    app.post('/change', (_req, res) => {
      writes++;
      res.sendStatus(204);
    });
    for (const origin of ['https://sibling.example.test', 'null']) {
      await request(app)
        .post('/change')
        .set('Origin', origin)
        .set('Cookie', 'auth-session=secret')
        .set('Authorization', 'Bearer invalid')
        .type('form')
        .send({ action: 'change' })
        .expect(403);
    }
    await request(app).post('/change').set('Cookie', 'auth-session=secret').expect(403);
    expect(writes).toBe(0);
    await request(app).post('/change').set('Cookie', 'auth-session=secret').set('Origin', savedUrl).expect(204);
    await request(app)
      .post('/change')
      .set('Cookie', 'auth-session=secret')
      .set('Referer', `${savedUrl}/settings`)
      .expect(204);
    expect(writes).toBe(2);
  });

  it('protects browser sign-in before a cookie exists and permits nonbrowser authentication to reach its guard', async () => {
    const app = express();
    app.use(express.json(), browserRequestProtection(policy));
    app.post('/login', (_req, res) => res.sendStatus(204));
    await request(app).post('/login').send({ tokenLocation: 'cookie' }).expect(403);
    await request(app).post('/login').set('Origin', savedUrl).send({ tokenLocation: 'cookie' }).expect(204);
    await request(app).post('/login').send({ tokenLocation: 'body' }).expect(204);
  });
});
