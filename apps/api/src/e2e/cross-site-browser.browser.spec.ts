import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Browser, BrowserContext, Page, Response, chromium } from 'playwright';
import { DataSource } from 'typeorm';
import { Resource, ResourceType, User } from '@attraccess/database-entities';
import { bootstrap } from '../main.bootstrap';
import { SessionService } from '../users-and-auth/auth/session.service';
import { disposeStorage } from '../test/desktop-real-api.test-fixture';

/**
 * Two sibling hostnames share one registrable domain, so the browser treats
 * them as the same *site* (SameSite=Strict cookies are sent) but different
 * *origins* (only the first is an approved website).
 */
const APP_HOST = 'app.attraccess.test';
const SIBLING_HOST = 'help.attraccess.test';
const COOKIE = 'auth-session';
const GUARD_MESSAGE = 'This website is not approved to make changes';

describe('sibling website against a real API in headless Chromium', () => {
  let app: INestApplication;
  let db: DataSource;
  let browser: Browser;
  let context: BrowserContext;
  let sibling: Server;
  let appUrl: string;
  let siblingUrl: string;
  let resourceId: number;
  let sessionToken: string;

  beforeAll(async () => {
    // First-time setup state: no application URL is configured anywhere.
    delete process.env.ATTRACCESS_URL;
    const boot = await bootstrap();
    app = boot.app;
    db = app.get(DataSource);
    await app.listen(0, '127.0.0.1');
    appUrl = `http://${APP_HOST}:${(app.getHttpServer().address() as AddressInfo).port}`;

    sibling = createServer((_req, res) =>
      res.setHeader('content-type', 'text/html').end('<!doctype html><title>help</title>'),
    );
    await new Promise<void>((resolve) => sibling.listen(0, '127.0.0.1', resolve));
    siblingUrl = `http://${SIBLING_HOST}:${(sibling.address() as AddressInfo).port}`;

    const user = await db
      .getRepository(User)
      .save({ username: 'victim', email: 'victim@example.invalid', isEmailVerified: true, locale: 'en' });
    resourceId = (await db.getRepository(Resource).save({ name: 'Mill', type: ResourceType.Machine })).id;
    sessionToken = await app.get(SessionService).createSession(user);

    browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.attraccess.test 127.0.0.1`] });
  }, 300_000);

  beforeEach(async () => {
    context = await browser.newContext();
    await context.addCookies([{ name: COOKIE, value: sessionToken, url: appUrl, httpOnly: true, sameSite: 'Strict' }]);
  });
  afterEach(async () => context?.close());
  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => sibling?.close(resolve));
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    disposeStorage();
  });

  const cookieValue = async () => (await context.cookies(appUrl)).find((c) => c.name === COOKIE)?.value;

  async function open(url: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${url}/api/auth/session/logout-capability`).catch(() => undefined);
    return page;
  }

  /** The response the server sent, even when the page itself may not read it. */
  async function submitForm(page: Page, path: string, fields: Record<string, string> = {}): Promise<Response> {
    const responded = page.waitForResponse((r) => r.url() === `${appUrl}${path}` && r.request().method() === 'POST');
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

  // Scripts run in the page as plain strings: ts-jest would otherwise inject helpers the page does not have.
  async function fetchFrom(page: Page, path: string, init: { method: string }) {
    return page.evaluate<{ readable: boolean; status?: number; body?: string }>(`(async () => {
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
  }

  const eventSourceOpens = (page: Page, path: string) =>
    page.evaluate<boolean>(`new Promise((resolve) => {
      const source = new EventSource(${JSON.stringify(`${appUrl}${path}`)}, { withCredentials: true });
      source.onopen = () => { source.close(); resolve(true); };
      source.onerror = () => { source.close(); resolve(false); };
      setTimeout(() => { source.close(); resolve(false); }, 5000);
    })`);

  describe('from the sibling website', () => {
    let page: Page;
    beforeEach(async () => {
      page = await open(siblingUrl);
    });

    it('cannot read API responses made with the visitor’s cookie', async () => {
      expect(await fetchFrom(page, '/api/auth/session/logout-capability', { method: 'GET' })).toEqual({
        readable: false,
      });
    });

    it('cannot renew the session or obtain a token', async () => {
      const before = await cookieValue();
      const post = await fetchFrom(page, '/api/auth/session/refresh?tokenLocation=body', { method: 'POST' });
      expect(post.readable).toBe(false);
      const get = await fetchFrom(page, '/api/auth/session/refresh?tokenLocation=body', { method: 'GET' });
      expect(get.readable).toBe(false);
      expect(await cookieValue()).toBe(before);
    });

    it('cannot renew the session by auto-submitting a form', async () => {
      const response = await submitForm(page, '/api/auth/session/refresh');
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
        expect(response.status()).toBe(403);
        expect(await response.text()).toContain(GUARD_MESSAGE);
      }
    });

    it('cannot read live updates', async () => {
      expect(await eventSourceOpens(page, `/api/resources/${resourceId}/events`)).toBe(false);
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
      expect(JSON.parse((result as { body: string }).body).authToken).toBe('');
      const rotated = await cookieValue();
      expect(rotated).toBeTruthy();
      expect(rotated).not.toBe(sessionToken);
    });

    it('no longer answers the old GET renewal', async () => {
      expect(await fetchFrom(page, '/api/auth/session/refresh', { method: 'GET' })).toMatchObject({ status: 404 });
    });

    it('is not stopped by the cross-site check for sign-in or equipment forms', async () => {
      const login = await submitForm(page, '/api/auth/session/local', { username: 'victim', password: 'x' });
      expect(await login.text()).not.toContain(GUARD_MESSAGE);
      const start = await submitForm(await open(appUrl), `/api/resources/${resourceId}/usage/start`);
      expect(await start.text()).not.toContain(GUARD_MESSAGE);
    });

    it('opens live updates', async () => {
      expect(await eventSourceOpens(page, `/api/resources/${resourceId}/events`)).toBe(true);
    });
  });
});
