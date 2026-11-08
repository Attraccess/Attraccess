import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { ClassDeclaration, MethodDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import { inheritedMethods } from './route-shadow.controllers.test-fixture';

/** Every Nest route decorator, including the rarely used ones, so none slips past the inventory. */
const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Sse', 'All', 'Head', 'Options', 'Search']);

/** Decorators that put a sign-in (or a device/companion credential) in front of a route. */
const AUTH_DECORATORS = new Set([
  'Auth',
  'AuthAny',
  'SessionAuth',
  'IsResourceIntroducer',
  'IsResourceGroupIntroducer',
  'CompanionAuthenticated',
]);

/** Guards accepted inside @UseGuards(...) as a sign-in. */
const AUTH_GUARDS = new Set(['DualAuthGuard', 'MetricsGuard', 'CompanionAuthGuard']);

/** What a public route checks. `none` routes serve public data; everything else must be rate limited or exempt. */
type Credential = 'none' | 'password' | 'shared-secret' | 'signature' | 'random-token';

interface ReviewedPublicRoute {
  reason: string;
  credential: Credential;
  /** Claims that the route is rate limited. The claim is verified against the source, never taken on trust. */
  rateLimit?: true;
  /** Why no rate limit is needed. Only for credentials that cannot be guessed: `signature` and `random-token`. */
  exemption?: string;
}

/**
 * Routes that are public on purpose, reviewed for ATT-1149. Keys are `Controller.method`.
 * Adding a route here means a reviewer agreed that anyone, signed in or not, may call it, and
 * classified the credential it checks (ATT-1223): guessable secrets need a rate limit.
 */
const REVIEWED_PUBLIC_ROUTES: Record<string, ReviewedPublicRoute> = {
  'AppController.getLogo': { reason: 'branding image shown on the sign-in page', credential: 'none' },
  'AppController.getInfo': { reason: 'static name and status only', credential: 'none' },
  'AttractapFirmwareController.downloadFirmwareBinary': {
    reason: 'firmware binary for the web flasher; no user data',
    credential: 'none',
  },
  'AttractapFirmwareController.getFirmwareBinary': {
    reason: 'firmware binary for readers; no user data',
    credential: 'none',
  },
  'BillingController.sumUpTopUpCallback': {
    reason: 'payment-provider callback, verified by its own signature check',
    credential: 'signature',
    exemption: "the payment provider's callback is verified by an HMAC signature; it cannot be guessed",
  },
  'CompanionDownloadController.downloadBinary': {
    reason: 'companion installer download; no user data',
    credential: 'none',
  },
  'PluginController.getAllPlugins': {
    reason: 'plugin names and load status needed before sign-in; no activity or access data',
    credential: 'none',
  },
  'PluginController.getFrontendPluginFile': {
    reason: 'plugin frontend bundle loaded before sign-in',
    credential: 'none',
  },
  'SettingsController.getSystemLanguage': { reason: 'default language for the sign-in page', credential: 'none' },
  'SettingsController.getFirstTimeSetupStatus': { reason: 'first-time setup wizard status', credential: 'none' },
  'SettingsController.applyFirstTimeSetupSettings': {
    reason: 'first-time setup; refuses once setup is complete',
    credential: 'none',
  },
  'AuthController.createSession': { reason: 'password sign-in', credential: 'password', rateLimit: true },
  'PasskeyController.authenticationOptions': { reason: 'passkey sign-in', credential: 'signature', rateLimit: true },
  'PasskeyController.createSession': { reason: 'passkey sign-in', credential: 'signature', rateLimit: true },
  'SsoLogoutController.consumeResult': {
    reason: 'single-use logout result token',
    credential: 'random-token',
    exemption: '128-bit single-use result token; guessing is infeasible',
  },
  'SsoLogoutController.backchannel': {
    reason: 'identity-provider logout, verified by token signature',
    credential: 'signature',
    exemption: 'signed logout token verified against the provider keys; forging is infeasible',
  },
  'SsoLogoutController.frontchannel': {
    reason: 'identity-provider logout',
    credential: 'random-token',
    exemption: 'needs the provider session id that belongs to a live session; unguessable',
  },
  'SsoLogoutController.oidcReturn': {
    reason: 'identity-provider logout return',
    credential: 'random-token',
    exemption: 'correlated by a random single-use state value',
  },
  'SsoLogoutController.samlGet': {
    reason: 'identity-provider logout',
    credential: 'signature',
    exemption: 'SAML messages are verified by signature and correlated by request id',
  },
  'SsoLogoutController.samlPost': {
    reason: 'identity-provider logout, verified by SAML signature',
    credential: 'signature',
    exemption: 'SAML messages are verified by signature and correlated by request id',
  },
  'SSOController.loginWithOidc': { reason: 'company sign-in', credential: 'none' },
  'SSOController.oidcLoginCallback': {
    reason: 'company sign-in callback',
    credential: 'signature',
    exemption: 'authorization code and state are verified by the identity provider and the state cookie',
  },
  'SSOController.loginWithSaml': { reason: 'company sign-in', credential: 'none' },
  'SSOController.samlLoginCallback': {
    reason: 'company sign-in callback',
    credential: 'signature',
    exemption: 'SAML response is verified by the identity provider signature',
  },
  'SSOController.getAll': {
    reason: 'provider list for the sign-in page; client and signing secrets are @Exclude()d',
    credential: 'none',
  },
  'SSOController.linkUserToExternalAccount': {
    reason: 'account linking, verified by a signed link token and the password',
    credential: 'password',
    rateLimit: true,
  },
  'SSOController.oidcLogout': {
    reason: 'identity-provider provisioning, verified by the provider client secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'SSOController.samlLogout': {
    reason: 'identity-provider provisioning, verified by the provisioning secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'SSOController.oidcDeleteUser': {
    reason: 'identity-provider provisioning, verified by the provider client secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'SSOController.samlDeleteUser': {
    reason: 'identity-provider provisioning, verified by the provisioning secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'IcalPublicController.feed': {
    reason: 'calendar subscription (reservations plugin); revocable per-feed token',
    credential: 'random-token',
    rateLimit: true,
  },
  'SSOController.oidcUpdatePermissions': {
    reason: 'identity-provider provisioning, verified by the provider client secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'SSOController.samlUpdatePermissions': {
    reason: 'identity-provider provisioning, verified by the provisioning secret',
    credential: 'shared-secret',
    rateLimit: true,
  },
  'PasswordPolicyController.getPublic': { reason: 'password rules shown on the registration form', credential: 'none' },
  'UserProfileController.confirmDeleteAccount': {
    reason: 'emailed single-use token',
    credential: 'random-token',
    rateLimit: true,
  },
  'UsersRegistrationController.createOne': { reason: 'self registration (can be disabled)', credential: 'none' },
  'UsersRegistrationController.isLocalSignupEnabled': { reason: 'whether self registration is on', credential: 'none' },
  'UsersRegistrationController.verifyEmail': {
    reason: 'emailed single-use token',
    credential: 'random-token',
    exemption: 'emailed 128-bit single-use token; guessing is infeasible',
  },
  'UsersRegistrationController.resendVerificationEmail': { reason: 'registration flow', credential: 'none' },
  'UsersRegistrationController.acceptInvitation': {
    reason: 'emailed single-use token',
    credential: 'random-token',
    exemption: 'emailed 128-bit single-use token; guessing is infeasible',
  },
  'UsersRegistrationController.requestPasswordReset': { reason: 'password reset flow', credential: 'none' },
  'UsersRegistrationController.changePasswordViaResetToken': {
    reason: 'emailed single-use token',
    credential: 'random-token',
    rateLimit: true,
  },
  'VersionController.getCurrentVersion': { reason: 'software version', credential: 'none' },
};

/** Rate limit guards and interceptors the scanner recognises. */
const RATE_LIMIT_GUARD = 'LoginRateLimitGuard';
const RATE_LIMIT_INTERCEPTOR = 'AuthRateLimitInterceptor';
const RATE_LIMIT_DECORATOR = 'AuthRateLimit';
/** The limiter call that in-handler throttling goes through. */
const LIMITER_CALL = 'assertIpAllowed';
/**
 * Plugins cannot reach the core limiter; they throttle with their own in-process `RateLimiter`. A `this.<field>.hit()`
 * call counts only when `<field>` is a property of the class created with `new RateLimiter(...)`.
 */
const PLUGIN_LIMITER_CLASS = 'RateLimiter';
const PLUGIN_LIMITER_CALL = 'hit';

/** Names of the class's own properties that hold a plugin `RateLimiter`. */
function pluginLimiterFields(declaration: ClassDeclaration): Set<string> {
  return new Set(
    declaration
      .getProperties()
      .filter((property) => {
        const initializer = property.getInitializer();
        return (
          initializer !== undefined &&
          Node.isNewExpression(initializer) &&
          initializer.getExpression().getText() === PLUGIN_LIMITER_CLASS
        );
      })
      .map((property) => property.getName()),
  );
}

const decoratorArguments = (decorators: ReturnType<ClassDeclaration['getDecorators']>, name: string) =>
  decorators.filter((decorator) => decorator.getName() === name).flatMap((decorator) => decorator.getArguments());

/**
 * True when the body makes a real `x.assertIpAllowed(...)` call or a `this.<limiter field>.hit(...)` call,
 * directly or through a `this.helper()` of the class.
 */
function callsLimiter(
  method: MethodDeclaration,
  methods: Map<string, MethodDeclaration>,
  limiterFields: Set<string>,
  visited = new Set<MethodDeclaration>(),
): boolean {
  if (visited.has(method)) return false;
  visited.add(method);
  return method.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return false;
    if (callee.getName() === LIMITER_CALL) return true;
    const target = callee.getExpression();
    if (
      callee.getName() === PLUGIN_LIMITER_CALL &&
      Node.isPropertyAccessExpression(target) &&
      target.getExpression().getKind() === SyntaxKind.ThisKeyword &&
      limiterFields.has(target.getName())
    ) {
      return true;
    }
    const helper = target.getKind() === SyntaxKind.ThisKeyword ? methods.get(callee.getName()) : undefined;
    return helper !== undefined && callsLimiter(helper, methods, limiterFields, visited);
  });
}

/**
 * Verified from source: a login guard on the route, the decorator together with the interceptor,
 * or a real limiter call in the handler (or in a helper of the class that the handler calls).
 */
function hasDetectableRateLimit(
  declaration: ClassDeclaration,
  method: MethodDeclaration,
  methods: Map<string, MethodDeclaration>,
): boolean {
  const guards = [
    ...decoratorArguments(declaration.getDecorators(), 'UseGuards'),
    ...decoratorArguments(method.getDecorators(), 'UseGuards'),
  ];
  if (guards.some((argument) => argument.getText() === RATE_LIMIT_GUARD)) return true;
  const interceptors = [
    ...decoratorArguments(declaration.getDecorators(), 'UseInterceptors'),
    ...decoratorArguments(method.getDecorators(), 'UseInterceptors'),
  ];
  if (
    method.getDecorators().some((decorator) => decorator.getName() === RATE_LIMIT_DECORATOR) &&
    interceptors.some((argument) => argument.getText() === RATE_LIMIT_INTERCEPTOR)
  ) {
    return true;
  }
  return callsLimiter(method, methods, pluginLimiterFields(declaration));
}

interface ScannedRoute {
  id: string;
  authenticated: boolean;
  rateLimited: boolean;
}

/** Every route of a controller, own and inherited, with its sign-in and rate-limit state. */
function scanController(declaration: ClassDeclaration): ScannedRoute[] {
  const isAuthentication = (decorators: ReturnType<typeof declaration.getDecorators>) =>
    decorators.some(
      (decorator) =>
        AUTH_DECORATORS.has(decorator.getName()) ||
        (decorator.getName() === 'UseGuards' &&
          decorator.getArguments().some((argument) => AUTH_GUARDS.has(argument.getText()))),
    );
  const classAuthenticated = isAuthentication(declaration.getDecorators());
  const methods = inheritedMethods(declaration);
  const routes: ScannedRoute[] = [];
  // Routes declared in a base class (e.g. PluginController's package routes) are served by this controller.
  for (const [name, method] of methods) {
    if (!method.getDecorators().some((decorator) => ROUTE_DECORATORS.has(decorator.getName()))) continue;
    routes.push({
      id: `${declaration.getName()}.${name}`,
      authenticated: classAuthenticated || isAuthentication(method.getDecorators()),
      rateLimited: hasDetectableRateLimit(declaration, method, methods),
    });
  }
  return routes;
}

/**
 * ATT-1223: a public route that checks a credential must be rate limited. Signature and random-token
 * routes may instead carry an exemption; guessable secrets (password, shared-secret) never can.
 */
function credentialProblems(
  table: Record<string, ReviewedPublicRoute>,
  rateLimited: (id: string) => boolean,
): string[] {
  const problems: string[] = [];
  for (const [id, entry] of Object.entries(table)) {
    const limited = rateLimited(id);
    if (entry.rateLimit && !limited) problems.push(`${id} claims a rate limit the code does not have`);
    if (entry.credential === 'none') continue;
    const mayBeExempt = entry.credential === 'signature' || entry.credential === 'random-token';
    if (entry.exemption !== undefined && !mayBeExempt) {
      problems.push(`${id} checks a ${entry.credential} and can never be exempt from the rate limit`);
    } else if (entry.exemption !== undefined && entry.exemption.trim() === '') {
      problems.push(`${id} has an empty exemption reason`);
    } else if (!limited && !(mayBeExempt && entry.exemption)) {
      problems.push(`${id} checks a ${entry.credential} but has no detectable rate limit or exemption`);
    }
  }
  return problems;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : controllerFiles(path);
    return entry.name.endsWith('.ts') && !/\.(spec|test-fixture|d)\.ts$/.test(entry.name) ? [path] : [];
  });
}

describe('route sign-in inventory (ATT-1149)', () => {
  const root = __dirname;
  // First-party plugin backends are mounted on the same API, so their routes count too.
  const pluginsRoot = resolve(__dirname, '../../plugins');
  const sourceRoots = [
    root,
    ...readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(pluginsRoot, entry.name, 'backend'))
      .filter((dir) => {
        try {
          return readdirSync(dir).length > 0;
        } catch {
          return false;
        }
      }),
  ];
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const routes: (ScannedRoute & { file: string })[] = [];

  for (const file of sourceRoots.flatMap(controllerFiles)) {
    if (!readFileSync(file, 'utf8').includes('@Controller(')) continue;
    for (const declaration of project.addSourceFileAtPath(file).getClasses()) {
      if (!declaration.getDecorator('Controller')) continue;
      routes.push(...scanController(declaration).map((route) => ({ ...route, file: relative(root, file) })));
    }
  }

  it('finds the controllers', () => {
    expect(routes.length).toBeGreaterThan(200);
  });

  it('finds routes inherited from base classes and plugin backends', () => {
    const controllers = new Set(routes.map((route) => route.id.split('.')[0]));
    expect(routes.filter((route) => route.id.startsWith('PluginController.')).length).toBeGreaterThan(20);
    expect(routes.filter((route) => route.id.startsWith('SSOController.')).length).toBeGreaterThan(6);
    expect(routes.some((route) => route.file.startsWith('../../plugins/'))).toBe(true);
    expect(controllers.size).toBeGreaterThan(40);
  });

  it('has no route without sign-in that is not on the reviewed public list', () => {
    const unreviewed = routes
      .filter((route) => !route.authenticated && !(route.id in REVIEWED_PUBLIC_ROUTES))
      .map((route) => `${route.id} (${route.file})`);
    expect(unreviewed).toEqual([]);
  });

  it('keeps the reviewed public list free of routes that are now signed in or gone', () => {
    const stale = Object.keys(REVIEWED_PUBLIC_ROUTES).filter(
      (id) => !routes.some((route) => route.id === id && !route.authenticated),
    );
    expect(stale).toEqual([]);
  });

  it('classifies every public route and requires a rate limit or an exemption for credential checks', () => {
    const detected = new Set(routes.filter((route) => route.rateLimited).map((route) => route.id));
    expect(credentialProblems(REVIEWED_PUBLIC_ROUTES, (id) => detected.has(id))).toEqual([]);
  });

  it('detects the rate limits the table claims, from the source', () => {
    const detected = new Set(routes.filter((route) => route.rateLimited).map((route) => route.id));
    const claimed = Object.entries(REVIEWED_PUBLIC_ROUTES)
      .filter(([, entry]) => entry.rateLimit)
      .map(([id]) => id);
    expect(claimed.length).toBeGreaterThanOrEqual(11);
    expect(claimed.filter((id) => !detected.has(id))).toEqual([]);
  });

  describe('credential rule self-test', () => {
    const fake = (body: string) => {
      const source = new Project({ useInMemoryFileSystem: true }).createSourceFile('fake.controller.ts', body);
      return scanController(source.getClassOrThrow('FakeController'));
    };
    const limited = (routes: ScannedRoute[], name: string) =>
      routes.find((route) => route.id === `FakeController.${name}`)?.rateLimited;

    it('reports a public password route without a rate limit', () => {
      const routes = fake(`
        @Controller('fake')
        class FakeController {
          @Post('login')
          // this.bruteForce.assertIpAllowed('login', ip) is only mentioned in a comment
          async login() {
            const note = 'assertIpAllowed';
            return note;
          }
        }
      `);
      expect(limited(routes, 'login')).toBe(false);
      const table = { 'FakeController.login': { reason: 'sign-in', credential: 'password' as const } };
      // The rule runs on the scanner's verdict, so the scan and the rule are proven together.
      expect(credentialProblems(table, (id) => limited(routes, id.split('.')[1]) === true)).toEqual([
        'FakeController.login checks a password but has no detectable rate limit or exemption',
      ]);
    });

    it('reports an entry that claims a rate limit the code lacks', () => {
      const table = {
        'FakeController.login': { reason: 'sign-in', credential: 'password' as const, rateLimit: true as const },
      };
      expect(credentialProblems(table, () => false)).toContain(
        'FakeController.login claims a rate limit the code does not have',
      );
    });

    it.each(['password', 'shared-secret'] as const)('rejects an exemption on a %s route', (credential) => {
      const table = { 'FakeController.login': { reason: 'x', credential, exemption: 'looks harmless' } };
      expect(credentialProblems(table, () => true)).toEqual([
        `FakeController.login checks a ${credential} and can never be exempt from the rate limit`,
      ]);
    });

    it.each(['signature', 'random-token'] as const)(
      'accepts a reasoned exemption for a %s route, but not an empty one',
      (credential) => {
        expect(
          credentialProblems({ 'F.a': { reason: 'x', credential, exemption: 'unguessable' } }, () => false),
        ).toEqual([]);
        expect(credentialProblems({ 'F.a': { reason: 'x', credential, exemption: ' ' } }, () => false)).toHaveLength(1);
        expect(credentialProblems({ 'F.a': { reason: 'x', credential } }, () => false)).toHaveLength(1);
      },
    );

    it('recognises the supported rate limit mechanisms', () => {
      const routes = fake(`
        @Controller('fake')
        @UseInterceptors(AuthRateLimitInterceptor)
        class FakeController {
          @Post('guarded') @UseGuards(LoginRateLimitGuard) guarded() {}
          @Post('decorated') @AuthRateLimit('register') decorated() {}
          @Post('inline') async inline() { await this.bruteForce.assertIpAllowed('login', ip); }
          @Post('helper') async helper() { await this.assertNotThrottled(); }
          @Post('deep') async deep() { await this.outer(); }
          @Post('unrelated') async unrelated() { await this.other.assertIpAllowedLater(); }
          private async assertNotThrottled() { await this.bruteForce.assertIpAllowed('login', ip); }
          private async outer() { await this.assertNotThrottled(); }
        }
      `);
      expect(Object.fromEntries(routes.map((route) => [route.id.split('.')[1], route.rateLimited]))).toEqual({
        guarded: true,
        decorated: true,
        inline: true,
        helper: true,
        deep: true,
        unrelated: false,
      });
    });

    it("recognises a plugin's own RateLimiter field, but no other .hit() call", () => {
      const routes = fake(`
        @Controller('fake')
        class FakeController {
          private readonly perIp = new RateLimiter(240, 60_000);
          private readonly cache = new LruCache(100);
          private readonly stub = { hit: () => 0 };
          @Get('limited') feed() { if (this.perIp.hit(ip, now) > 0) throw new Error(); }
          @Get('viaHelper') helper() { this.throttle(); }
          @Get('cache') cached() { this.cache.hit(key); }
          @Get('stub') stubbed() { this.stub.hit(); }
          @Get('foreign') foreign() { other.perIp.hit(ip, now); }
          private throttle() { this.perIp.hit(ip, now); }
        }
      `);
      expect(Object.fromEntries(routes.map((route) => [route.id.split('.')[1], route.rateLimited]))).toEqual({
        feed: true,
        helper: true,
        cached: false,
        stubbed: false,
        foreign: false,
      });
    });

    it('does not count the decorator without the interceptor', () => {
      const routes = fake(`
        @Controller('fake')
        class FakeController {
          @Post('decorated') @AuthRateLimit('register') decorated() {}
        }
      `);
      expect(limited(routes, 'decorated')).toBe(false);
    });
  });
});
