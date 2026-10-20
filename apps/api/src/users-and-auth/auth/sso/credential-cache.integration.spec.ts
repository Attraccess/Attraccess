import express from 'express';
import request from 'supertest';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
import { PasskeyController } from '../passkey/passkey.controller';

describe('credential response cache headers over HTTP', () => {
  const fixture = registerSsoControllerFixture();
  it.each(['OIDC', 'SAML'])('%s protects body and redirect responses', async (protocol) => {
    const server = express();
    server.use(express.json());
    // Protocol verification is exercised separately with the real parsers. Here a
    // verified principal reaches the actual finalization methods and HTTP response.
    server.post('/callback', async (req, res, next) => {
      Object.assign(req, { user: { id: 1, username: 'test' }, connection: req.connection });
      try {
        const result =
          protocol === 'OIDC'
            ? await fixture.controller.oidcLoginCallback(
                req as unknown as AuthenticatedRequest,
                req.body.redirect,
                res,
                '1',
              )
            : await fixture.controller.samlLoginCallback(
                req as unknown as AuthenticatedRequest,
                undefined,
                req.body.redirect,
                undefined,
                res,
                '2',
              );
        if (!res.headersSent) res.json(result);
      } catch (error) {
        next(error);
      }
    });
    for (const redirect of [undefined, 'https://app.example/resources']) {
      const result = await request(server).post('/callback').send({ redirect });
      expect(result.status).toBe(redirect || protocol === 'SAML' ? 302 : 200);
      expect(result.headers['cache-control']).toBe('no-store');
    }
  });
  it.each(['body', 'cookie'] as const)('protects passkey %s responses', async (tokenLocation) => {
    const controller = new PasskeyController(
      { verifyAuthentication: async () => ({ id: 1 }) } as never,
      { createSession: async () => 'credential' } as never,
      { setAuthCookie: async (res) => res.cookie('auth-session', 'credential') } as never,
      { assertIpAllowed: async () => undefined, recordSuccess: async () => undefined } as never,
      { log: async () => undefined } as never,
    );
    const server = express();
    server.use(express.json());
    server.post('/passkey', async (req, res, next) => {
      try {
        res.json(await controller.createSession(req, res, { tokenLocation, response: {} } as never));
      } catch (error) {
        next(error);
      }
    });
    const response = await request(server).post('/passkey').send({});
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.authToken).toBe(tokenLocation === 'body' ? 'credential' : '');
  });
});
