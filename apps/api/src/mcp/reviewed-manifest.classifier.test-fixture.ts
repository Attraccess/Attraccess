import type { DocumentOperation } from './openapi-tools';

type Decision = { decision: 'allow' | 'deny'; reason: string };

const deny = (reason: string): Decision => ({ decision: 'deny', reason });
const ALLOW: Decision = {
  decision: 'allow',
  reason: 'JSON request and response; the REST endpoint authorises every call.',
};

const EXACT: Record<string, string> = {
  // Host lifecycle
  rebootHost: 'Host lifecycle: reboots the device, which would cut the MCP session off.',
  shutdownHost: 'Host lifecycle: powers the device off.',
  // Binary
  getLogo: 'Binary response: returns the logo image, not JSON.',
  downloadCompanionBinary: 'Binary response: companion installer download.',
  downloadFirmwareBinary: 'Binary response: firmware image download.',
  getFirmwareBinary: 'Binary response: firmware image download.',
  getReaderCrashReportCoredump: 'Binary response: reader core dump download.',
  getFrontendPluginFile: 'Binary response: serves plugin frontend bundle files.',
  downloadRecoveryKey: 'Binary response and secret key material: recovery key file download.',
  downloadSigningKeyBackup: 'Binary response and secret key material: signing key backup file download.',
  // Multipart uploads
  inviteUsersFromCsv: 'Non-JSON request: multipart/form-data CSV upload.',
  createOneResource: 'Non-JSON request: multipart/form-data with an image upload.',
  updateOneResource: 'Non-JSON request: multipart/form-data with an image upload.',
  createProject: 'Non-JSON request: multipart/form-data with an image upload.',
  updateProject: 'Non-JSON request: multipart/form-data with an image upload.',
  uploadPlugin: 'Non-JSON request: multipart/form-data plugin package upload.',
  // Callbacks
  sumUpTopUpCallback: 'Provider callback: called by SumUp and authenticated by its signature, not by a user.',
  // Credential, secret and account flows
  createSession: 'Interactive authentication: password login.',
  refreshSession: 'Session management: refreshes the caller session cookie.',
  getLogoutCapability: 'Session management: logout flow helper.',
  logoutEverywhere: 'Session management: ends the user sessions.',
  endSession: 'Session management: logout.',
  verifyEmail: 'Credential flow: e-mail verification with a one-time token.',
  resendVerificationEmail: 'Credential flow: re-sends the e-mail verification token.',
  acceptInvitation: 'Credential flow: accepts an account invitation with a one-time token and sets the password.',
  requestPasswordReset: 'Credential flow: password reset request.',
  changePasswordViaResetToken: 'Credential flow: password reset with a one-time token.',
  setUserPassword: 'Credential flow: sets another user password.',
  requestDeleteAccount: 'Credential flow: starts account deletion with an e-mail confirmation.',
  confirmDeleteAccount: 'Credential flow: confirms account deletion with a one-time token.',
  linkUserToExternalAccount: 'Interactive authentication: SSO account linking.',
  consumeLogoutResult: 'Interactive authentication: single-use SSO logout result token.',
  discoverAuthentikOidc:
    'Interactive authentication: SSO discovery fetches an arbitrary identity-provider URL from the server.',
  discoverKeycloakOidc:
    'Interactive authentication: SSO discovery fetches an arbitrary identity-provider URL from the server.',
  getSsoLogoutUrls: 'Interactive authentication: SSO logout redirect URLs.',
  generateMetricsApiKey: 'Secret management: generates and returns the metrics API key.',
  deleteMetricsApiKey: 'Secret management: removes the metrics API key.',
  setSumUpApiKey: 'Secret management: stores a payment provider API key.',
  pushGetVapidConfig: 'Secret management: returns the private VAPID key pair.',
  pushReplaceVapidKeys: 'Secret management: replaces the VAPID key pair.',
  getSecureBootKeys: 'Secret management: returns secure-boot key material.',
  createSecureBootKeys: 'Secret management: generates secure-boot key material.',
  restoreSecureBootKeys: 'Secret management: restores secure-boot key material from a backup.',
  checkRecoveryKey: 'Secret management: checks a secure-boot recovery key.',
  createOneUser: 'Credential flow: public sign-up that sets the new account password.',
  PluginController_addRegistry: 'Secret management: stores an npm registry and its access token.',
  PluginController_removeRegistry: 'Secret management: removes an npm registry and its stored access token.',
  PluginController_setUpdatePolicy:
    'Host lifecycle: changes automatic plugin updates, which install code and restart the host.',
};

const PATTERNS: Array<[RegExp, string]> = [
  [
    /_streamEvents$|Live$|live$/,
    'Streaming: server-sent events or live updates; a tool call returns a single response.',
  ],
  [
    /^(oidc|saml)(Backchannel|Frontchannel|Post|Redirect)/,
    'Identity provider callback: called by the SSO provider, not by a user.',
  ],
  [/^sso(Oidc|Saml)/, 'Identity provider callback: called and authenticated by the SSO provider, not by a user.'],
  [/^(loginWith|oidcLoginCallback|samlLoginCallback)/, 'Interactive authentication: SSO login redirect or callback.'],
  [/Passkey/, 'Interactive authentication: passkey (WebAuthn) registration and sign-in need a browser authenticator.'],
  [
    /^(getTwoFactorStatus|setupTwoFactor|verifyTwoFactor|disableTwoFactor)$/,
    'Credential flow: per-user two-factor enrolment and verification.',
  ],
  [
    /McpOAuthRequest$/,
    'MCP OAuth endpoint: the consent decision belongs to the signed-in user in a browser, never to an MCP client.',
  ],
  [/ApiToken/, 'API-token management: a token must never mint or change tokens.'],
  [
    /^PluginController_(removePackageGraph|installPackage|installPackageSpec|removeInstalledPackage|updateInstalledPackage\w*|replaceInstalledPackage)$|^(uploadPlugin|retryPlugin|deletePlugin)$/,
    'Host lifecycle: installs, updates or removes executable plugin code, which may restart the host.',
  ],
];

/** First-pass classification for new manifest entries. A human still reviews and may change every decision. */
export function classifyOperation({ id }: DocumentOperation): Decision {
  const exact = EXACT[id];
  if (exact) return deny(exact);
  for (const [pattern, reason] of PATTERNS) if (pattern.test(id)) return deny(reason);
  return ALLOW;
}
