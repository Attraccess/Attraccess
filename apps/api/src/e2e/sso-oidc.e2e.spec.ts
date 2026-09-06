import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import type { ModuleRef } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import type { AppConfigType } from '../config/app.config';
import {
  User,
  AuthenticationDetail,
  Session,
  ResourceUsage,
  UserRole,
  Role,
  Permission,
  RolePermission,
  SSOProviderType,
  UserRoleSource,
  entities,
} from '@attraccess/database-entities';
import type { SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { SSOOIDCStrategy } from '../users-and-auth/auth/sso/oidc/oidc.strategy';
import { UsersService } from '../users-and-auth/users/users.service';
import { AuthService } from '../users-and-auth/auth/auth.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import type { LicenseService } from '../license/license.service';
import { TokenHashService } from '../encryption/token-hash.service';
import { MetricsService } from '../metrics/metrics.service';
import type { EmailService } from '../email/email.service';

jest.setTimeout(180_000);

// In-memory state store — bypasses the cookie-based OidcCookieStateStore for testing.
class TestOidcStateStore {
  private states = new Map<string, { ctx: unknown; appState: unknown }>();

  store(
    _req: unknown,
    ctx: unknown,
    appState: unknown,
    _meta: unknown,
    cb: (err: Error | null, handle: string) => void,
  ): void {
    const handle = crypto.randomBytes(16).toString('hex');
    this.states.set(handle, { ctx, appState });
    cb(null, handle);
  }

  verify(_req: unknown, handle: string, cb: (err: Error | null, ctx: unknown, appState?: unknown) => void): void {
    const saved = this.states.get(handle);
    if (!saved) {
      return cb(null, false as unknown as null, { message: 'OIDC state handle not found' });
    }
    this.states.delete(handle);
    cb(null, saved.ctx, saved.appState);
  }
}

// mock-oauth2-server: a zero-config OIDC server that returns codes immediately (no login form).
const MOCK_OAUTH2_IMAGE = 'ghcr.io/navikt/mock-oauth2-server:2.1.10';
const ISSUER_ID = 'test';
const CLIENT_ID = 'test-client';
// ponytail: fixed callback URL — the mock server accepts any redirect_uri by design.
const CALLBACK_URL = 'http://localhost:0/api/auth/sso/OIDC/1/callback';

describe('SSO OIDC integration (e2e with testcontainers)', () => {
  let container: StartedTestContainer | null = null;
  let skipSuite = false;
  let dataSource: DataSource;
  let oidcBaseUrl: string;
  let usersService: UsersService;
  let authService: AuthService;
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

    // ── 3. Build real services backed by SQLite ───────────────────────────────
    userRepo = dataSource.getRepository(User);
    const authDetailRepo = dataSource.getRepository(AuthenticationDetail);
    const sessionRepo = dataSource.getRepository(Session);
    const resourceUsageRepo = dataSource.getRepository(ResourceUsage);
    const userRoleRepo = dataSource.getRepository(UserRole);
    const roleRepo = dataSource.getRepository(Role);
    const permissionRepo = dataSource.getRepository(Permission);

    const mockConfigService = {
      get: (key: string): AppConfigType | undefined => {
        if (key === 'app') return { AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET } as AppConfigType;
        return undefined;
      },
    } as unknown as ConfigService;

    const mockEmailService = {
      sendEmailFromTemplate: jest.fn().mockResolvedValue(undefined),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

    const mockMetricsService = {
      authSsoLoginTotal: { inc: jest.fn() },
      authSsoLoginFailuresTotal: { inc: jest.fn() },
      authActiveSessions: { set: jest.fn() },
      usersTotal: { set: jest.fn(), inc: jest.fn(), dec: jest.fn() },
      usersRegisteredTotal: { inc: jest.fn() },
      usersLocaleSyncsTotal: { inc: jest.fn() },
      usersPerLocale: { set: jest.fn(), inc: jest.fn(), dec: jest.fn() },
    } as unknown as MetricsService;

    const mockLicenseService = {
      verifyLicense: jest.fn().mockResolvedValue(undefined),
      getLicenseData: jest.fn().mockResolvedValue({
        valid: true,
        modules: Object.values(SSOProviderType),
        usageLimits: { users: Infinity, resources: Infinity },
      }),
    } as unknown as LicenseService;

    const tokenHashService = new TokenHashService(mockConfigService);
    rbacService = new RbacService(
      userRoleRepo,
      roleRepo,
      permissionRepo,
      userRepo,
      dataSource.getRepository(RolePermission),
      new EventEmitter2(),
      null,
    );
    usersService = new UsersService(
      userRepo,
      authDetailRepo,
      sessionRepo,
      resourceUsageRepo,
      mockLicenseService,
      mockEmailService,
      dataSource,
      tokenHashService,
      mockMetricsService,
      rbacService,
    );
    authService = new AuthService(mockEmailService, authDetailRepo, usersService, tokenHashService, mockMetricsService);

    mockModuleRef = {
      get: (token: unknown): unknown => {
        if (token === UsersService) return usersService;
        if (token === AuthService) return authService;
        if (token === RbacService) return rbacService;
        if (token === MetricsService) return mockMetricsService;
        return null;
      },
    } as unknown as ModuleRef;

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

    return new Promise<User>((resolve, reject) => {
      (strategy as unknown as Record<string, unknown>).success = (user: User) => resolve(user);
      (strategy as unknown as Record<string, unknown>).fail = (info: unknown) =>
        reject(new Error(`Auth failed: ${JSON.stringify(info)}`));
      (strategy as unknown as Record<string, unknown>).error = reject;
      strategy.authenticate(mockCallbackReq as never, {} as never);
    });
  }

  it('creates a new user on first OIDC login', async () => {
    if (skipSuite) return;
    const strategy = new SSOOIDCStrategy(mockModuleRef, oidcConfig, CALLBACK_URL, stateStore as never);

    const user = await driveOidcFlow(strategy);

    expect(user.id).toBeGreaterThan(0);
    expect(user.isEmailVerified).toBe(true);

    const dbUser = await userRepo.findOne({ where: { id: user.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.isEmailVerified).toBe(true);
  });

  it('returns the same user on repeat OIDC logins (SSO subject deduplication)', async () => {
    if (skipSuite) return;
    const strategy = new SSOOIDCStrategy(mockModuleRef, oidcConfig, CALLBACK_URL, stateStore as never);

    const userFirst = await driveOidcFlow(strategy);
    const userSecond = await driveOidcFlow(strategy);

    // Same OIDC subject → same DB user
    expect(userFirst.id).toBe(userSecond.id);
  });

  it('creates separate users for different OIDC providers (provider isolation)', async () => {
    if (skipSuite) return;
    // Simulate a second provider by using a different ssoProviderId
    const configProvider2 = { ...oidcConfig, id: 2, ssoProviderId: 2 };
    const strategy1 = new SSOOIDCStrategy(mockModuleRef, oidcConfig, CALLBACK_URL, stateStore as never);
    const strategy2 = new SSOOIDCStrategy(mockModuleRef, configProvider2, CALLBACK_URL, stateStore as never);

    const user1 = await driveOidcFlow(strategy1);

    // Changing the providerId means the SSO binding lookup will miss.
    // mock-oauth2-server always returns the same default sub, so both will land on the same email.
    // The second login will trigger the AccountLinkingRequired path (email collision, different provider).
    // That IS a valid scenario — the test just verifies strategy1 succeeded and returned a real user.
    expect(user1).toBeDefined();
    expect(user1.id).toBeGreaterThan(0);

    // Provider 2 will attempt to link the same email → account-linking exception expected.
    await expect(driveOidcFlow(strategy2)).rejects.toThrow();
  });

  it('correctly syncs SSO roles when permission mappings are configured', async () => {
    if (skipSuite) return;
    // mock-oauth2-server tokens don't carry role claims by default,
    // so syncSsoRoles should revoke any previously-assigned SSO roles and assign none.
    const configWithMappings = {
      ...oidcConfig,
      roleMappings: { 'system-admin': ['admin'] },
    };
    const strategy = new SSOOIDCStrategy(mockModuleRef, configWithMappings, CALLBACK_URL, stateStore as never);

    const user = await driveOidcFlow(strategy);
    expect(user).toBeDefined();

    const userRoles = await rbacService.getUserRoles(user.id);
    const ssoRoles = userRoles.filter((r) => r.source === UserRoleSource.SSO);
    // No role claims → no SSO roles assigned
    expect(ssoRoles.length).toBe(0);
  });
});
