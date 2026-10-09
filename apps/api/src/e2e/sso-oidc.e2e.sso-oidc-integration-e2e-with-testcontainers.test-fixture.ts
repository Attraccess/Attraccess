import type { SsoSessionRequest } from '../users-and-auth/auth/sso/sso-session-request';
import type { SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { User, entities } from '@attraccess/database-entities';
import type { ModuleRef } from '@nestjs/core';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { SSOOIDCStrategy } from '../users-and-auth/auth/sso/oidc/oidc.strategy';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { createOidcTestServices } from './oidc-test-services.test-fixture';
import { TestOidcStateStore } from './oidc-test-state.test-fixture';

jest.setTimeout(180_000);

// In-memory state store — bypasses the cookie-based OidcCookieStateStore for testing.

// mock-oauth2-server: a zero-config OIDC server that returns codes immediately (no login form).
const MOCK_OAUTH2_IMAGE = 'ghcr.io/navikt/mock-oauth2-server:2.1.10';

const ISSUER_ID = 'test';

const CLIENT_ID = 'test-client';

// ponytail: fixed callback URL — the mock server accepts any redirect_uri by design.
const CALLBACK_URL = 'http://localhost:0/api/auth/sso/OIDC/1/callback';
export function registerSsoOidcIntegrationE2eWithTestcontainersFixture() {
  let container: StartedTestContainer | null = null;

  let skipSuite = false;

  let dataSource: DataSource;

  let oidcBaseUrl: string;

  let rbacService: RbacService;

  let mockModuleRef: ModuleRef;

  let userRepo: Repository<User>;

  let stateStore: TestOidcStateStore;

  let oidcConfig: SSOProviderOIDCConfiguration;

  beforeAll(async () => {
    // ── 0. Fast Docker availability check (avoids testcontainers hang) ──────
    try {
      execFileSync('docker', ['info'], { timeout: 5000, stdio: 'ignore' });
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[sso-oidc e2e] Docker not available — skipping container tests');
      skipSuite = true;
      return;
    }

    // ── 1. Start OIDC mock container ────────────────────────────────────────
    try {
      container = await new GenericContainer(MOCK_OAUTH2_IMAGE)
        .withExposedPorts(8080)
        .withWaitStrategy(Wait.forHttp(`/${ISSUER_ID}/.well-known/openid-configuration`, 8080))
        .start();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sso-oidc e2e] Failed to start container — skipping:', (e as Error).message);
      skipSuite = true;
      return;
    }

    const containerPort = container.getMappedPort(8080);
    oidcBaseUrl = `http://${container.getHost()}:${containerPort}/${ISSUER_ID}`;

    // ── 2. Set up SQLite database ────────────────────────────────────────────
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'att-sso-oidc-e2e-'));
    process.env.AUTH_SESSION_SECRET = 'sso-oidc-e2e-test-secret-must-be-long-enough';

    dataSource = new DataSource({
      type: 'sqlite',
      database: path.join(tmpRoot, 'attraccess.sqlite'),
      entities: Object.values(entities),
      synchronize: true,
    });
    await dataSource.initialize();

    ({ userRepo, rbacService, mockModuleRef } = createOidcTestServices(dataSource));

    stateStore = new TestOidcStateStore();

    // ── 4. Discover endpoints from the running container ─────────────────────
    const discovery = await fetch(`${oidcBaseUrl}/.well-known/openid-configuration`).then(
      (r) => r.json() as Promise<Record<string, string>>,
    );

    oidcConfig = {
      id: 1,
      ssoProviderId: 1,
      issuer: oidcBaseUrl,
      authorizationURL: discovery['authorization_endpoint'],
      tokenURL: discovery['token_endpoint'],
      userInfoURL: discovery['userinfo_endpoint'],
      clientId: CLIENT_ID,
      // ponytail: mock-oauth2-server ignores the secret — any value works.
      clientSecret: 'any-secret',
      scopes: ['openid', 'email'],
      // Fall back to sub if the mock server doesn't populate email.
      emailClaimPaths: ['email', 'sub'],
      usernameClaimPaths: ['preferred_username', 'email', 'sub'],
      roleMappings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null as unknown as SSOProviderOIDCConfiguration['ssoProvider'],
    };
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await container?.stop();
  });

  /**
   * mock-oauth2-server 2.x shows a login form before redirecting.
   * Follow redirects manually, submitting the login form when we hit a 200,
   * until we reach the callback URL (http://localhost:0/...).
   */
  async function followOAuthFlowToCallback(startUrl: string): Promise<string> {
    let currentUrl = startUrl;
    for (let attempt = 0; attempt < 10; attempt++) {
      const resp = await fetch(currentUrl, { redirect: 'manual' });
      const location = resp.headers.get('location');

      if (location?.startsWith('http://localhost:0')) {
        return location;
      }

      if (resp.status >= 300 && resp.status < 400 && location) {
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (resp.status === 200) {
        const html = await resp.text();
        const formActionMatch = html.match(/action="([^"]+)"/);
        const postUrl = formActionMatch ? new URL(formActionMatch[1], currentUrl).toString() : currentUrl;
        const loginResp = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: 'testuser@example.com' }).toString(),
          redirect: 'manual',
        });
        const nextLocation = loginResp.headers.get('location');
        if (nextLocation?.startsWith('http://localhost:0')) return nextLocation;
        if (nextLocation) {
          currentUrl = new URL(nextLocation, currentUrl).toString();
          continue;
        }
      }

      throw new Error(`OAuth flow stuck: status ${resp.status} at ${currentUrl}`);
    }
    throw new Error('OAuth flow did not reach callback after 10 attempts');
  }

  /**
   * Drives the full OIDC authorization-code flow without a browser:
   *  1. Call strategy.authenticate() in "login" mode → captures the IdP redirect URL.
   *  2. Follow the IdP flow (handles mock-oauth2-server login form) → extracts code+state.
   *  3. Call strategy.authenticate() in "callback" mode → exchanges code, validates JWT.
   */
  async function driveOidcFlow(strategy: SSOOIDCStrategy): Promise<User> {
    // ── Step 1: login initiation ───────────────────────────────────────────
    let capturedRedirectUrl: string | null = null;

    const mockLoginReq = {
      url: '/login',
      method: 'GET',
      query: { redirectTo: 'http://frontend.example.com/done' },
      cookies: {},
      headers: {},
      res: { redirect: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() },
    };

    await new Promise<void>((resolve, reject) => {
      (strategy as unknown as Record<string, unknown>).redirect = (url: string) => {
        capturedRedirectUrl = url;
        resolve();
      };
      (strategy as unknown as Record<string, unknown>).error = reject;
      strategy.authenticate(mockLoginReq as never, {} as never);
    });

    if (!capturedRedirectUrl) throw new Error('Strategy did not redirect to IdP');

    // ── Step 2: follow IdP flow (handles login form from mock-oauth2-server 2.x)
    const callbackLocation = await followOAuthFlowToCallback(capturedRedirectUrl);

    const callbackUrl = new URL(callbackLocation);
    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    if (!code || !state) throw new Error(`Missing code/state in IdP callback: ${callbackLocation}`);

    // ── Step 3: callback — strategy exchanges code, validates JWT, creates user
    const mockCallbackReq = {
      url: `${CALLBACK_URL}?code=${code}&state=${state}`,
      method: 'GET',
      query: { code, state },
      cookies: {},
      headers: {},
      res: { redirect: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() },
    };

    const user = await new Promise<User>((resolve, reject) => {
      (strategy as unknown as Record<string, unknown>).success = (user: User) => resolve(user);
      (strategy as unknown as Record<string, unknown>).fail = (info: unknown) =>
        reject(new Error(`Auth failed: ${JSON.stringify(info)}`));
      (strategy as unknown as Record<string, unknown>).error = reject;
      strategy.authenticate(mockCallbackReq as never, {} as never);
    });
    const logoutContext = (mockCallbackReq as unknown as SsoSessionRequest).ssoSessionContext;
    expect(logoutContext).toMatchObject({ protocol: 'OIDC', issuer: oidcBaseUrl });
    if (logoutContext?.protocol !== 'OIDC') throw new Error('Verified OIDC logout context was not captured');
    expect(logoutContext.subject).toBeTruthy();
    expect(logoutContext.idTokenEncrypted).toMatch(/^v1\./);
    return user;
  }
  return {
    get CALLBACK_URL() {
      return CALLBACK_URL;
    },
    get skipSuite() {
      return skipSuite;
    },
    get dataSource() {
      return dataSource;
    },
    get rbacService() {
      return rbacService;
    },
    get mockModuleRef() {
      return mockModuleRef;
    },
    get userRepo() {
      return userRepo;
    },
    get stateStore() {
      return stateStore;
    },
    get oidcConfig() {
      return oidcConfig;
    },
    get driveOidcFlow() {
      return driveOidcFlow;
    },
  };
}
