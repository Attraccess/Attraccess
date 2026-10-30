import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { Project } from 'ts-morph';
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

/**
 * Routes that are public on purpose, reviewed for ATT-1149. Keys are `Controller.method`.
 * Adding a route here means a reviewer agreed that anyone, signed in or not, may call it.
 */
const REVIEWED_PUBLIC_ROUTES: Record<string, string> = {
  'AppController.getLogo': 'branding image shown on the sign-in page',
  'AppController.getInfo': 'static name and status only',
  'AttractapFirmwareController.downloadFirmwareBinary': 'firmware binary for the web flasher; no user data',
  'AttractapFirmwareController.getFirmwareBinary': 'firmware binary for readers; no user data',
  'BillingController.sumUpTopUpCallback': 'payment-provider callback, verified by its own signature check',
  'CompanionDownloadController.downloadBinary': 'companion installer download; no user data',
  'PluginController.getAllPlugins': 'plugin names and load status needed before sign-in; no activity or access data',
  'PluginController.getFrontendPluginFile': 'plugin frontend bundle loaded before sign-in',
  'SettingsController.getSystemLanguage': 'default language for the sign-in page',
  'SettingsController.getFirstTimeSetupStatus': 'first-time setup wizard status',
  'SettingsController.applyFirstTimeSetupSettings': 'first-time setup; refuses once setup is complete',
  'AuthController.createSession': 'password sign-in',
  'PasskeyController.authenticationOptions': 'passkey sign-in',
  'PasskeyController.createSession': 'passkey sign-in',
  'SsoLogoutController.consumeResult': 'single-use logout result token',
  'SsoLogoutController.backchannel': 'identity-provider logout, verified by token signature',
  'SsoLogoutController.frontchannel': 'identity-provider logout',
  'SsoLogoutController.oidcReturn': 'identity-provider logout return',
  'SsoLogoutController.samlGet': 'identity-provider logout',
  'SsoLogoutController.samlPost': 'identity-provider logout, verified by SAML signature',
  'SSOController.loginWithOidc': 'company sign-in',
  'SSOController.oidcLoginCallback': 'company sign-in callback',
  'SSOController.loginWithSaml': 'company sign-in',
  'SSOController.samlLoginCallback': 'company sign-in callback',
  'SSOController.getAll': 'provider list for the sign-in page; client and signing secrets are @Exclude()d',
  'SSOController.linkUserToExternalAccount': 'account linking, verified by a signed link token and the password',
  'SSOController.oidcLogout': 'identity-provider provisioning, verified by the provider client secret',
  'SSOController.samlLogout': 'identity-provider provisioning, verified by the provisioning secret',
  'SSOController.oidcDeleteUser': 'identity-provider provisioning, verified by the provider client secret',
  'SSOController.samlDeleteUser': 'identity-provider provisioning, verified by the provisioning secret',
  'SSOController.oidcUpdatePermissions': 'identity-provider provisioning, verified by the provider client secret',
  'SSOController.samlUpdatePermissions': 'identity-provider provisioning, verified by the provisioning secret',
  'PasswordPolicyController.getPublic': 'password rules shown on the registration form',
  'UserProfileController.confirmDeleteAccount': 'emailed single-use token',
  'UsersRegistrationController.createOne': 'self registration (can be disabled)',
  'UsersRegistrationController.isLocalSignupEnabled': 'whether self registration is on',
  'UsersRegistrationController.verifyEmail': 'emailed single-use token',
  'UsersRegistrationController.resendVerificationEmail': 'registration flow',
  'UsersRegistrationController.acceptInvitation': 'emailed single-use token',
  'UsersRegistrationController.requestPasswordReset': 'password reset flow',
  'UsersRegistrationController.changePasswordViaResetToken': 'emailed single-use token',
  'VersionController.getCurrentVersion': 'software version',
};

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
  const routes: { id: string; file: string; authenticated: boolean }[] = [];

  for (const file of sourceRoots.flatMap(controllerFiles)) {
    if (!readFileSync(file, 'utf8').includes('@Controller(')) continue;
    for (const declaration of project.addSourceFileAtPath(file).getClasses()) {
      if (!declaration.getDecorator('Controller')) continue;
      const isAuthentication = (decorators: ReturnType<typeof declaration.getDecorators>) =>
        decorators.some(
          (decorator) =>
            AUTH_DECORATORS.has(decorator.getName()) ||
            (decorator.getName() === 'UseGuards' &&
              decorator.getArguments().some((argument) => AUTH_GUARDS.has(argument.getText()))),
        );
      const classAuthenticated = isAuthentication(declaration.getDecorators());
      // Routes declared in a base class (e.g. PluginController's package routes) are served by this controller.
      for (const [name, method] of inheritedMethods(declaration)) {
        if (!method.getDecorators().some((decorator) => ROUTE_DECORATORS.has(decorator.getName()))) continue;
        routes.push({
          id: `${declaration.getName()}.${name}`,
          file: relative(root, file),
          authenticated: classAuthenticated || isAuthentication(method.getDecorators()),
        });
      }
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
});
