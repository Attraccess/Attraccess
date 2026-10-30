import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Browser, BrowserContext, Page, Response, chromium } from 'playwright';
import { DataSource } from 'typeorm';
import WebSocket from 'ws';
import { Resource, ResourceType, User } from '@attraccess/database-entities';
import { bootstrap } from '../main.bootstrap';
import { AUTH_COOKIE_NAME } from '../common/services/cookie-config.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { disposeStorage } from '../test/desktop-real-api.test-fixture';

/**
 * Sibling hostnames share one registrable domain, so the browser treats them
 * as the same *site* (SameSite=Strict cookies are sent) but different
 * *origins*. The app's own address is approved because it is the served
 * address, the portal through ATTRACCESS_TRUSTED_ORIGINS, the sibling not at all.
 */
const APP_HOST = 'app.attraccess.test';
const SIBLING_HOST = 'help.attraccess.test';
const PORTAL_HOST = 'portal.attraccess.test';
const GUARD_MESSAGE = 'This website is not approved to make changes';
const LIVE_UPDATES = '/api/notifications/live';

describe('sibling website against a real API in headless Chromium', () => {
  let app: INestApplication;
  let db: DataSource;
  let browser: Browser;
  let context: BrowserContext;
  let pages: Server;
  let appUrl: string;
  let siblingUrl: string;
  let portalUrl: string;
  let resourceId: number;
  let user: User;
  let sessionToken: string;
  /** What the API answered, recorded on the server: the browser hides responses it blocks. */
  let answers: Array<{ method: string; url: string; status: number; cookie: boolean }> = [];

  beforeAll(async () => {
    // One plain page server answers for the sibling and the portal hostnames.
    pages = createServer((_req, res) => res.setHeader('content-type', 'text/html').end('<!doctype html><title>x</title>'));
    await new Promise<void>((resolve) => pages.listen(0, '127.0.0.1', resolve));
    const pagesPort = (pages.address() as AddressInfo).port;
    siblingUrl = `http://${SIBLING_HOST}:${pagesPort}`;
    portalUrl = `http://${PORTAL_HOST}:${pagesPort}`;

    // First-time setup state: no application URL is configured anywhere.
    delete process.env.ATTRACCESS_URL;
    process.env.ATTRACCESS_TRUSTED_ORIGINS = portalUrl;
    const boot = await bootstrap();
    app = boot.app;
    db = app.get(DataSource);
    await app.listen(0, '127.0.0.1');
    appUrl = `http://${APP_HOST}:${(app.getHttpServer().address() as AddressInfo).port}`;
    (app.getHttpServer() as Server).on('request', (req: IncomingMessage, res: ServerResponse) => {
      const record = () =>
        answers.push({
          method: req.method ?? '',
          url: req.url ?? '',
          status: res.statusCode,
          cookie: (req.headers.cookie ?? '').includes(`${AUTH_COOKIE_NAME}=`),
        });
      // Streams (live updates) only end when the browser closes them.
      let done = false;
      for (const event of ['finish', 'close']) res.once(event, () => !done && (done = true) && record());
    });

    user = await db
      .getRepository(User)
      .save({ username: 'victim', email: 'victim@example.invalid', isEmailVerified: true, locale: 'en' });
    resourceId = (await db.getRepository(Resource).save({ name: 'Mill', type: ResourceType.Machine })).id;

    browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.attraccess.test 127.0.0.1`] });
  }, 300_000);

  beforeEach(async () => {
    // A fresh session per test: renewing rotates the token and ends the old one.
    sessionToken = await app.get(SessionService).createSession(user);
    answers = [];
    context = await browser.newContext();
    await context.addCookies([
      { name: AUTH_COOKIE_NAME, value: sessionToken, url: appUrl, httpOnly: true, sameSite: 'Strict' },
    ]);
  });
  afterEach(async () => context?.close());
  afterAll(async () => {
    // Bounded steps: a lingering stream or socket must not hang the suite, and the log names the step.
    const step = async (name: string, run: () => Promise<unknown>) => {
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), 15_000)));
      const result = await Promise.race([run().then(() => 'done' as const), timedOut]);
      clearTimeout(timer);
      if (result === 'timeout') process.stderr.write(`teardown step "${name}" did not finish within 15s\n`);
    };
    await step('browser', async () => browser?.close());
    pages?.closeAllConnections();
    await step('pages', () => new Promise((resolve) => (pages ? pages.close(resolve) : resolve(undefined))));
    (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
    await step('app', async () => app?.close());
    await step('db', async () => (db?.isInitialized ? db.destroy() : undefined));
    delete process.env.ATTRACCESS_TRUSTED_ORIGINS;
    disposeStorage();
  }, 90_000);

  const cookieValue = async () => (await context.cookies(appUrl)).find((c) => c.name === AUTH_COOKIE_NAME)?.value;

  async function open(url: string): Promise<Page> {
    const page = await context.newPage();
    // The API serves no page in this test, so the app's own address loads a small JSON route.
    const response = await page.goto(url === appUrl ? `${url}/api/auth/session/logout-capability` : `${url}/`);
    expect(response?.ok()).toBe(true);
    return page;
  }

  /** Resolves with what the server answered for the next request to `path`, readable to the page or not. */
  const serverAnswer = (page: Page, path: string, method: string) =>
    page.waitForResponse((r) => r.url() === `${appUrl}${path}` && r.request().method() === method);

  const sentCookie = async (response: Response) =>
    (await response.request().headerValue('cookie'))?.includes(`${AUTH_COOKIE_NAME}=`) ?? false;

  /** The response the server sent, even when the page itself may not read it. */
  async function submitForm(page: Page, path: string, fields: Record<string, string> = {}): Promise<Response> {
    const responded = serverAnswer(page, path, 'POST');
    await page.evaluate(
      ({ action, fields }) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = action;
        for (const [name, value] of Object.entries(fields)) {
          const input = document.createElement('input');
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
      },
      { action: `${appUrl}${path}`, fields },
    );
    return responded;
  }

  async function serverAnswered(path: string, method: string) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const answer = answers.find((a) => a.url === path && a.method === method);
      if (answer) return answer;
      if (Date.now() > deadline) throw new Error(`The API never answered ${method} ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  type ServerAnswer = Awaited<ReturnType<typeof serverAnswered>>;
  type FetchResult = { readable: boolean; status?: number; body?: string; server: ServerAnswer };

  // Scripts run in the page as plain strings: ts-jest would otherwise inject helpers the page does not have.
  async function fetchFrom(page: Page, path: string, init: { method: string }): Promise<FetchResult> {
    const result = await page.evaluate<{ readable: boolean; status?: number; body?: string }>(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(`${appUrl}${path}`)}, {
          method: ${JSON.stringify(init.method)},
          credentials: 'include',
        });
        return { readable: true, status: response.status, body: await response.text() };
      } catch {
        return { readable: false };
      }
    })()`);
    return { ...result, server: await serverAnswered(path, init.method) };
  }

  async function eventSourceOpens(page: Page, path: string): Promise<{ opened: boolean; server: ServerAnswer }> {
    const opened = await page.evaluate<boolean>(`new Promise((resolve) => {
      const source = new EventSource(${JSON.stringify(`${appUrl}${path}`)}, { withCredentials: true });
      source.onopen = () => { source.close(); resolve(true); };
      source.onerror = () => { source.close(); resolve(false); };
      setTimeout(() => { source.close(); resolve(false); }, 5000);
    })`);
    return { opened, server: await serverAnswered(path, 'GET') };
  }

  describe('from the sibling website', () => {
    let page: Page;
    beforeEach(async () => {
      page = await open(siblingUrl);
    });

    it('cannot read API responses made with the visitor’s cookie', async () => {
      const result = await fetchFrom(page, '/api/auth/session/logout-capability', { method: 'GET' });
      // The cookie is sent (same site) and the server answers, but the page may not read it.
      expect(result.server.cookie).toBe(true);
      expect(result.server.status).toBe(200);
      expect(result).toMatchObject({ readable: false });
    });

    it('cannot renew the session or obtain a token', async () => {
      const before = await cookieValue();
      const post = await fetchFrom(page, '/api/auth/session/refresh?tokenLocation=body', { method: 'POST' });
      expect(post.server.cookie).toBe(true);
      expect(post.server.status).toBe(403);
      expect(post.readable).toBe(false);
      const get = await fetchFrom(page, '/api/auth/session/refresh?tokenLocation=body', { method: 'GET' });
      expect(get.server.status).toBe(404);
      expect(get.readable).toBe(false);
      expect(await cookieValue()).toBe(before);
    });

    it('cannot renew the session by auto-submitting a form', async () => {
      const response = await submitForm(page, '/api/auth/session/refresh');
      expect(await sentCookie(response)).toBe(true);
      expect(response.status()).toBe(403);
      expect(await response.text()).toContain(GUARD_MESSAGE);
      expect(await cookieValue()).toBe(sessionToken);
    });

    it('cannot start a session with an auto-submitted sign-in form (login CSRF)', async () => {
      const response = await submitForm(page, '/api/auth/session/local', { username: 'victim', password: 'x' });
      expect(response.status()).toBe(403);
      expect(await response.text()).toContain(GUARD_MESSAGE);
    });

    it('cannot use the session to start or unlock equipment by auto-submitting a form', async () => {
      for (const action of ['start', 'unlock']) {
        // A refused form submission navigates away, so each attempt needs a fresh page.
        const response = await submitForm(await open(siblingUrl), `/api/resources/${resourceId}/usage/${action}`);
        expect(await sentCookie(response)).toBe(true);
        expect(response.status()).toBe(403);
        expect(await response.text()).toContain(GUARD_MESSAGE);
      }
    });

    it('cannot read live updates', async () => {
      const result = await eventSourceOpens(page, LIVE_UPDATES);
      expect(result.server.cookie).toBe(true);
      expect(result.server.status).toBe(200);
      expect(result.opened).toBe(false);
    });

    it.each([
      ['SAML assertion', '/api/auth/sso/SAML/1/callback'],
      ['SAML logout', '/api/auth/sso/SAML/1/slo'],
      ['OIDC back-channel logout', '/api/auth/sso/OIDC/1/backchannel-logout'],
      ['SSO provisioning', '/api/auth/sso/OIDC/1/logout'],
      ['SumUp callback', '/api/billing/top-up/sumup/callback'],
    ])('still reaches the %s route, which is exempt', async (_name, path) => {
      const response = await submitForm(page, path);
      expect(response.status()).not.toBe(404);
      expect(await response.text()).not.toContain(GUARD_MESSAGE);
    });
  });

  describe('from an approved other website', () => {
    let page: Page;
    beforeEach(async () => {
      page = await open(portalUrl);
    });

    it('reads responses', async () => {
      const result = await fetchFrom(page, '/api/auth/session/logout-capability', { method: 'GET' });
      expect(result).toMatchObject({ readable: true, status: 200 });
    });

    it('renews the session with a rotated cookie and no token', async () => {
      const result = await fetchFrom(page, '/api/auth/session/refresh', { method: 'POST' });
      expect(result).toMatchObject({ readable: true, status: 200 });
      expect(JSON.parse(result.body as string).authToken).toBe('');
      expect(await cookieValue()).not.toBe(sessionToken);
    });
  });

  describe('from the application’s own address', () => {
    let page: Page;
    beforeEach(async () => {
      page = await open(appUrl);
    });

    it('reads responses', async () => {
      const result = await fetchFrom(page, '/api/auth/session/logout-capability', { method: 'GET' });
      expect(result).toMatchObject({ readable: true, status: 200 });
    });

    it('renews the session with a rotated cookie and no token', async () => {
      const result = await fetchFrom(page, '/api/auth/session/refresh?tokenLocation=body', { method: 'POST' });
      expect(result).toMatchObject({ readable: true, status: 200 });
      expect(JSON.parse(result.body as string).authToken).toBe('');
      const rotated = await cookieValue();
      expect(rotated).toBeTruthy();
      expect(rotated).not.toBe(sessionToken);
    });

    it('no longer answers the old GET renewal', async () => {
      expect(await fetchFrom(page, '/api/auth/session/refresh', { method: 'GET' })).toMatchObject({ status: 404 });
    });

    it('reaches the sign-in and equipment handlers', async () => {
      const login = await submitForm(page, '/api/auth/session/local', { username: 'victim', password: 'x' });
      // The handler ran and rejected the password.
      expect(login.status()).toBe(401);
      expect(await login.text()).not.toContain(GUARD_MESSAGE);
      const start = await submitForm(await open(appUrl), `/api/resources/${resourceId}/usage/start`);
      expect(await sentCookie(start)).toBe(true);
      // Signed in (not 401) and past the cross-site check; the visitor simply has no permission for the machine.
      expect(start.status()).not.toBe(401);
      expect(await start.text()).not.toContain(GUARD_MESSAGE);
    });

    it('opens live updates', async () => {
      expect((await eventSourceOpens(page, LIVE_UPDATES)).opened).toBe(true);
    });
  });

  it('accepts device websockets that send a foreign Origin', async () => {
    // Readers authenticate inside the socket; the upgrade itself must not depend on the Origin.
    const socket = new WebSocket(`${appUrl.replace(`http://${APP_HOST}`, 'ws://127.0.0.1')}/api/attractap/websocket`, {
      origin: siblingUrl,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('unexpected-response', (_req, res) => reject(new Error(`upgrade refused: ${res.statusCode}`)));
        socket.once('error', reject);
      });
    } finally {
      // terminate() drops the socket at once; close() would wait for the server's close frame.
      socket.terminate();
    }
  });
});
