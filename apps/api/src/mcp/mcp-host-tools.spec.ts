import { generateMcpTools, McpTool, OpenApiDocument } from './openapi-tools';
import { buildHostOpenApiDocument } from './host-openapi-document.test-fixture';

/**
 * Operations the retired hand-reviewed manifest denied. The rules (session-only, no auth metadata, technical
 * exclusions, `@NotAnMcpTool`) must keep every one of them out of the tool list.
 */
const FORMERLY_DENIED = [
  'BillingController_streamEvents',
  'GlobalFlowsController_streamEvents',
  'PluginController_addRegistry',
  'PluginController_installPackage',
  'PluginController_installPackageSpec',
  'PluginController_removeInstalledPackage',
  'PluginController_removePackageGraph',
  'PluginController_removeRegistry',
  'PluginController_replaceInstalledPackage',
  'PluginController_setUpdatePolicy',
  'PluginController_updateInstalledPackageOverride',
  'PluginController_updateInstalledPackagePolicy',
  'PluginController_updateInstalledPackageSpec',
  'ResourceFlowsController_streamEvents',
  'SSEController_streamEvents',
  'acceptInvitation',
  'approveMcpOAuthRequest',
  'changePasswordViaResetToken',
  'changeUnverifiedEmail',
  'checkRecoveryKey',
  'confirmDeleteAccount',
  'consumeLogoutResult',
  'createApiToken',
  'createOneResource',
  'createOneUser',
  'createProject',
  'createSecureBootKeys',
  'createSession',
  'createSessionWithPasskey',
  'deleteMetricsApiKey',
  'deletePasskey',
  'deletePlugin',
  'denyMcpOAuthRequest',
  'disableTwoFactor',
  'discoverAuthentikOidc',
  'discoverKeycloakOidc',
  'downloadCompanionBinary',
  'downloadFirmwareBinary',
  'downloadRecoveryKey',
  'downloadSigningKeyBackup',
  'endSession',
  'formImagesGet',
  'formImagesUpload',
  'formPhotoGetImage',
  'formPhotoGetPage',
  'formPhotoRemoveImage',
  'formPhotoUpload',
  'generateMetricsApiKey',
  'getFirmwareBinary',
  'getFrontendPluginFile',
  'getLogo',
  'getLogoutCapability',
  'getMcpOAuthRequest',
  'getPasskeyAuthenticationOptions',
  'getPasskeyRegistrationOptions',
  'getReaderCrashReportCoredump',
  'getResourceMeteringLive',
  'getSecureBootKeys',
  'getSsoLogoutUrls',
  'getTwoFactorStatus',
  'inviteUsersFromCsv',
  'linkUserToExternalAccount',
  'listApiTokens',
  'listPasskeys',
  'loginWithOidc',
  'loginWithSaml',
  'logoutEverywhere',
  'messagingLive',
  'notificationsLive',
  'oidcBackchannelLogout',
  'oidcFrontchannelLogout',
  'oidcLoginCallback',
  'oidcPostLogout',
  'pushGetVapidConfig',
  'pushReplaceVapidKeys',
  'rebootHost',
  'refreshSession',
  'renamePasskey',
  'requestDeleteAccount',
  'requestPasswordReset',
  'resendVerificationEmail',
  'restoreSecureBootKeys',
  'retryPlugin',
  'revokeApiToken',
  'samlLoginCallback',
  'samlPostLogout',
  'samlRedirectLogout',
  'setSumUpApiKey',
  'setUserPassword',
  'setupTwoFactor',
  'shutdownHost',
  'ssoOidcDeleteUser',
  'ssoOidcLogout',
  'ssoOidcUpdatePermissions',
  'ssoSamlDeleteUser',
  'ssoSamlLogout',
  'ssoSamlUpdatePermissions',
  'sumUpTopUpCallback',
  'supervisionLive',
  'updateApiToken',
  'updateOneResource',
  'updateProject',
  'uploadPlugin',
  'verifyEmail',
  'verifyPasskeyRegistration',
  'verifyTwoFactor',
];

describe('MCP tools of the real host OpenAPI document', () => {
  let document: OpenApiDocument;
  let tools: Map<string, McpTool>;

  beforeAll(async () => {
    document = await buildHostOpenApiDocument();
    tools = new Map(generateMcpTools(document).tools.map((tool) => [tool.name, tool]));
  }, 240_000);

  it('exposes none of the operations that used to be denied', () => {
    expect(FORMERLY_DENIED.filter((id) => tools.has(id))).toEqual([]);
  });

  it('still finds every formerly denied operation in the document, so a rename cannot hide one from this check', () => {
    const ids = new Set(
      Object.values(document.paths ?? {}).flatMap((item) =>
        Object.values(item).map((operation) => (operation as { operationId?: string } | undefined)?.operationId),
      ),
    );
    expect(FORMERLY_DENIED.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('carries a class-level requirement to the tools of that controller', () => {
    expect(tools.get('mqttServersGetAll')?.auth).toEqual({ all: ['resources.update'], any: [] });
  });

  it('still exposes ordinary reads, writes and the introducer operations', () => {
    for (const id of [
      'getAllResources',
      'getOneResourceById',
      'resourceIntroducersIsIntroducer',
      'resourceIntroducersGrant',
      'resourceIntroductionsGrant',
    ]) {
      expect(tools.has(id)).toBe(true);
    }
  });

  it('keeps an introducer operation open to any signed-in caller, and a permission-bound one bound', () => {
    expect(tools.get('resourceIntroducersIsIntroducer')?.auth).toEqual({ all: [], any: [] });
    expect(tools.get('resourceIntroducersGrant')?.auth).toEqual({ all: ['resources.access.manage'], any: [] });
  });

  it('exposes no tool that needs a session, and no public route', () => {
    const sessionOnly = new Set<string>();
    for (const item of Object.values(document.paths ?? {})) {
      for (const operation of Object.values(item)) {
        const op = operation as { operationId?: string; 'x-attraccess-auth'?: { sessionOnly?: boolean } } | undefined;
        if (op?.operationId && (op['x-attraccess-auth']?.sessionOnly || !op['x-attraccess-auth'])) {
          sessionOnly.add(op.operationId);
        }
      }
    }
    expect([...tools.keys()].filter((id) => sessionOnly.has(id))).toEqual([]);
  });

  it('keeps the optional preview wording off the required role path parameter', () => {
    const schemas = (document as { components?: { schemas?: Record<string, { description?: string }> } }).components
      ?.schemas;
    expect(schemas?.PasswordPolicyRole?.description).toBeUndefined();
  });
});
