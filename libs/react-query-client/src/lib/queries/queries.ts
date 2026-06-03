// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { useMutation, UseMutationOptions, useQuery, UseQueryOptions } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, FlowVariablesService, LicenseService, MqttService, PasswordPolicyAdminService, PasswordPolicyService, PluginsService, ProjectInvitationsService, ProjectsService, ResourceFlowsService, ResourceFormsService, ResourceHealthService, ResourceMaintenanceSchedulesService, ResourceMaintenancesService, ResourcesService, SettingsService, SystemService, TwoFactorAuthenticationService, UsersService } from "../requests/services.gen";
import { AcceptInvitationDto, AppKeyRequestDto, BulkUpdateUserPermissionsDto, ChangeBillingFactorDto, ChangeEmailDto, ChangePasswordDto, ChangeUsernameDto, CreateFormDto, CreateMaintenanceDto, CreateMaintenanceScheduleDto, CreateMqttServerDto, CreateProjectDto, CreateProjectInvitationDto, CreateResourceDto, CreateResourceGroupDto, CreateSSOProviderDto, CreateUserDto, CsvInviteUploadDto, DeleteAccountConfirmDto, EmailTemplateType, EndUsageSessionDto, EnrollNfcCardDto, FinishMaintenanceDto, FlowVariableUpsertDto, GrantIntroducerDto, InviteUserDto, LinkUserToExternalAccountRequestDto, ModifyBalanceDto, NfcCardSetActiveStateDto, PairSumUpReaderDto, PasswordPolicyRole, PermissionFilter, PreviewMjmlDto, PreviewPasswordDto, RefundTransactionDto, ResendVerificationEmailDto, ResetNfcCardDto, ResetPasswordDto, ResourceFlowSaveDto, ResourceFlowVariableScope, ResourceIntroducerType, SetBillingConfigurationDto, SetSumUpApiKeyDto, SetUserPasswordDto, SSOProvisioningPermissionsDto, SSOProvisioningUserDto, StartUsageSessionDto, SumupTopUpDto, SumupTransactionCallbackDto, SymbolicateCoredumpDto, TwoFactorCodeDto, TwoFactorPolicyDto, UpdateAuthRateLimitSettingsDto, UpdateEmailTemplateDto, UpdateFormDto, UpdateMaintenanceScheduleDto, UpdateMetricsSettingsDto, UpdateMqttServerDto, UpdatePasswordPolicyDto, UpdateProjectDto, UpdateReaderDto, UpdateResourceBillingConfigurationDto, UpdateResourceDto, UpdateResourceGroupDto, UpdateResourceGroupIntroductionDto, UpdateResourceIntroductionDto, UpdateSSOProviderDto, UpdateSystemSettingsDto, UpdateUsageSessionProjectDto, UpdateUserPermissionsDto, UploadPluginDto, UpsertPasswordPolicyOverrideDto, VerifyEmailDto } from "../requests/types.gen";
import * as Common from "./common";
/**
* Return API information
* @returns unknown API information
* @throws ApiError
*/
export const useSystemServiceInfo = <TData = Common.SystemServiceInfoDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSystemServiceInfoKeyFn(queryKey), queryFn: () => SystemService.info() as TData, ...options });
/**
* Return the currently running Attraccess version
* @returns VersionInfoDto The currently running version.
* @throws ApiError
*/
export const useSystemServiceGetCurrentVersion = <TData = Common.SystemServiceGetCurrentVersionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSystemServiceGetCurrentVersionKeyFn(queryKey), queryFn: () => SystemService.getCurrentVersion() as TData, ...options });
/**
* Check whether a newer Attraccess release is available on GitHub
* Compares the currently running version against the highest stable GitHub release. Results are cached for one hour to avoid hitting the GitHub API rate limit.
* @param data The data for the request.
* @param data.refresh Set to "true" or "1" to bypass the 1-hour server-side cache and re-query GitHub immediately.
* @returns UpdateStatusDto Update availability status.
* @throws ApiError
*/
export const useSystemServiceGetUpdateStatus = <TData = Common.SystemServiceGetUpdateStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ refresh }: {
  refresh?: string | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSystemServiceGetUpdateStatusKeyFn({ refresh }, queryKey), queryFn: () => SystemService.getUpdateStatus({ refresh }) as TData, ...options });
/**
* Get the local signup domain whitelist
* @returns string The local signup domain whitelist.
* @throws ApiError
*/
export const useUsersServiceGetLocalSignupDomainWhitelist = <TData = Common.UsersServiceGetLocalSignupDomainWhitelistDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetLocalSignupDomainWhitelistKeyFn(queryKey), queryFn: () => UsersService.getLocalSignupDomainWhitelist() as TData, ...options });
/**
* Get a paginated list of users
* @param data The data for the request.
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @param data.search Search query
* @param data.ids User IDs
* @returns PaginatedUsersResponseDto List of users.
* @throws ApiError
*/
export const useUsersServiceFindMany = <TData = Common.UsersServiceFindManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, page, search }: {
  ids?: number[] | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  search?: string | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }, queryKey), queryFn: () => UsersService.findMany({ ids, limit, page, search }) as TData, ...options });
/**
* Check if local signup is enabled
* @returns BooleanDto Local signup is enabled.
* @throws ApiError
*/
export const useUsersServiceIsLocalSignupEnabled = <TData = Common.UsersServiceIsLocalSignupEnabledDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceIsLocalSignupEnabledKeyFn(queryKey), queryFn: () => UsersService.isLocalSignupEnabled() as TData, ...options });
/**
* Get the current authenticated user
* @returns User The current user.
* @throws ApiError
*/
export const useUsersServiceGetCurrent = <TData = Common.UsersServiceGetCurrentDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(queryKey), queryFn: () => UsersService.getCurrent() as TData, ...options });
/**
* Get a user by ID
* @param data The data for the request.
* @param data.id
* @returns User The user with the specified ID.
* @throws ApiError
*/
export const useUsersServiceGetOneUserById = <TData = Common.UsersServiceGetOneUserByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }, queryKey), queryFn: () => UsersService.getOneUserById({ id }) as TData, ...options });
/**
* Get a user's system permissions
* @param data The data for the request.
* @param data.id
* @returns SystemPermissions The user's permissions.
* @throws ApiError
*/
export const useUsersServiceGetPermissions = <TData = Common.UsersServiceGetPermissionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }, queryKey), queryFn: () => UsersService.getPermissions({ id }) as TData, ...options });
/**
* Get users with a specific permission
* @param data The data for the request.
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @param data.permission Filter users by permission
* @returns PaginatedUsersResponseDto List of users with the specified permission.
* @throws ApiError
*/
export const useUsersServiceGetAllWithPermission = <TData = Common.UsersServiceGetAllWithPermissionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, permission }: {
  limit?: number | undefined;
  page?: number | undefined;
  permission?: PermissionFilter | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }, queryKey), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) as TData, ...options });
/**
* Refresh the current session
* @param data The data for the request.
* @param data.tokenLocation
* @returns CreateSessionResponse The session has been refreshed
* @throws ApiError
*/
export const useAuthenticationServiceRefreshSession = <TData = Common.AuthenticationServiceRefreshSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ tokenLocation }: {
  tokenLocation: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }, queryKey), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) as TData, ...options });
/**
* Get all SSO providers
* @returns SSOProvider The list of SSO providers
* @throws ApiError
*/
export const useAuthenticationServiceGetAllSsoProviders = <TData = Common.AuthenticationServiceGetAllSsoProvidersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(queryKey), queryFn: () => AuthenticationService.getAllSsoProviders() as TData, ...options });
/**
* Get SSO provider by ID with full configuration
* @param data The data for the request.
* @param data.id The ID of the SSO provider
* @returns SSOProvider The SSO provider with full configuration
* @throws ApiError
*/
export const useAuthenticationServiceGetOneSsoProviderById = <TData = Common.AuthenticationServiceGetOneSsoProviderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }, queryKey), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) as TData, ...options });
/**
* Proxy Authentik OIDC well-known discovery
* @param data The data for the request.
* @param data.host Authentik host, e.g. http://localhost:9000
* @param data.applicationName Authentik application slug
* @returns unknown OIDC configuration JSON
* @throws ApiError
*/
export const useAuthenticationServiceDiscoverAuthentikOidc = <TData = Common.AuthenticationServiceDiscoverAuthentikOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ applicationName, host }: {
  applicationName: string;
  host: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverAuthentikOidcKeyFn({ applicationName, host }, queryKey), queryFn: () => AuthenticationService.discoverAuthentikOidc({ applicationName, host }) as TData, ...options });
/**
* Proxy Keycloak OIDC well-known discovery
* @param data The data for the request.
* @param data.host Keycloak host, e.g. http://localhost:8080
* @param data.realm Keycloak realm name
* @returns unknown OIDC configuration JSON
* @throws ApiError
*/
export const useAuthenticationServiceDiscoverKeycloakOidc = <TData = Common.AuthenticationServiceDiscoverKeycloakOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ host, realm }: {
  host: string;
  realm: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverKeycloakOidcKeyFn({ host, realm }, queryKey), queryFn: () => AuthenticationService.discoverKeycloakOidc({ host, realm }) as TData, ...options });
/**
* Login with OIDC
* Login with OIDC and redirect to the callback URL (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.redirectTo The URL to redirect to after login (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
* @returns unknown The user has been logged in
* @throws ApiError
*/
export const useAuthenticationServiceLoginWithOidc = <TData = Common.AuthenticationServiceLoginWithOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) as TData, ...options });
/**
* Callback for OIDC login
* @param data The data for the request.
* @param data.redirectTo
* @param data.code
* @param data.iss
* @param data.sessionState
* @param data.state
* @param data.providerId The ID of the SSO provider
* @returns CreateSessionResponse The user has been logged in
* @throws ApiError
*/
export const useAuthenticationServiceOidcLoginCallback = <TData = Common.AuthenticationServiceOidcLoginCallbackDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state }, queryKey), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state }) as TData, ...options });
/**
* Login with SAML
* Initiate a SAML authentication request. Redirect the resulting browser request back to the callback endpoint to mint an API session token.
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.redirectTo URL that should receive the resulting session payload after authentication succeeds.
* @returns unknown SAML authentication initiated
* @throws ApiError
*/
export const useAuthenticationServiceLoginWithSaml = <TData = Common.AuthenticationServiceLoginWithSamlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithSamlKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithSaml({ providerId, redirectTo }) as TData, ...options });
/**
* Get 2FA status for the current user
* @returns TwoFactorStatusDto 2FA status for the current user
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceGetTwoFactorStatus = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorStatusKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorStatus() as TData, ...options });
/**
* Get the configured 2FA policy
* @returns TwoFactorPolicyDto The configured 2FA policy
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceGetTwoFactorPolicy = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorPolicyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorPolicy() as TData, ...options });
/**
* List all email templates
* @returns EmailTemplate List of email templates
* @throws ApiError
*/
export const useEmailTemplatesServiceEmailTemplateControllerFindAll = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() as TData, ...options });
/**
* Get an email template by type
* @param data The data for the request.
* @param data.type Template type/type
* @returns EmailTemplate Email template found
* @throws ApiError
*/
export const useEmailTemplatesServiceEmailTemplateControllerFindOne = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ type }: {
  type: EmailTemplateType;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }, queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) as TData, ...options });
/**
* Get system settings
* @returns SystemSettingsDto Current system settings.
* @throws ApiError
*/
export const useSettingsServiceGetSystemSettings = <TData = Common.SettingsServiceGetSystemSettingsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetSystemSettingsKeyFn(queryKey), queryFn: () => SettingsService.getSystemSettings() as TData, ...options });
/**
* Get first-time setup status
* Returns whether first-time setup is available and which wizard steps are already completed. Unauthenticated.
* @returns FirstTimeSetupStatusDto First-time setup status and steps completed.
* @throws ApiError
*/
export const useSettingsServiceGetFirstTimeSetupStatus = <TData = Common.SettingsServiceGetFirstTimeSetupStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetFirstTimeSetupStatusKeyFn(queryKey), queryFn: () => SettingsService.getFirstTimeSetupStatus() as TData, ...options });
/**
* Get metrics settings
* @returns MetricsSettingsDto Current metrics settings.
* @throws ApiError
*/
export const useSettingsServiceGetMetricsSettings = <TData = Common.SettingsServiceGetMetricsSettingsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetMetricsSettingsKeyFn(queryKey), queryFn: () => SettingsService.getMetricsSettings() as TData, ...options });
/**
* Get auth rate-limit settings
* @returns AuthRateLimitSettingsDto Current auth rate-limit settings.
* @throws ApiError
*/
export const useSettingsServiceGetAuthRateLimitSettings = <TData = Common.SettingsServiceGetAuthRateLimitSettingsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetAuthRateLimitSettingsKeyFn(queryKey), queryFn: () => SettingsService.getAuthRateLimitSettings() as TData, ...options });
/**
* Get license information
* @returns LicenseDataDto The current license data.
* @throws ApiError
*/
export const useLicenseServiceGetLicenseInformation = <TData = Common.LicenseServiceGetLicenseInformationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(queryKey), queryFn: () => LicenseService.getLicenseInformation() as TData, ...options });
/**
* Get the public password policy
* @returns PublicPasswordPolicyDto The currently active public password policy
* @throws ApiError
*/
export const usePasswordPolicyServiceGetPublicPasswordPolicy = <TData = Common.PasswordPolicyServiceGetPublicPasswordPolicyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePasswordPolicyServiceGetPublicPasswordPolicyKeyFn(queryKey), queryFn: () => PasswordPolicyService.getPublicPasswordPolicy() as TData, ...options });
/**
* Get the global password policy
* @returns PasswordPolicyDto The global password policy.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceGetAdminPasswordPolicy = <TData = Common.PasswordPolicyAdminServiceGetAdminPasswordPolicyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn(queryKey), queryFn: () => PasswordPolicyAdminService.getAdminPasswordPolicy() as TData, ...options });
/**
* List all per-role password policy overrides
* @returns PasswordPolicyOverrideDto All defined overrides.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceListPasswordPolicyOverrides = <TData = Common.PasswordPolicyAdminServiceListPasswordPolicyOverridesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn(queryKey), queryFn: () => PasswordPolicyAdminService.listPasswordPolicyOverrides() as TData, ...options });
/**
* Get the per-role override for a single role
* @param data The data for the request.
* @param data.role
* @returns unknown The override row, or null if unset.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceGetPasswordPolicyOverride = <TData = Common.PasswordPolicyAdminServiceGetPasswordPolicyOverrideDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ role }: {
  role: PasswordPolicyRole;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePasswordPolicyAdminServiceGetPasswordPolicyOverrideKeyFn({ role }, queryKey), queryFn: () => PasswordPolicyAdminService.getPasswordPolicyOverride({ role }) as TData, ...options });
/**
* Get all resources
* @param data The data for the request.
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @param data.search Search term to filter resources
* @param data.groupId Group ID to filter resources. Send -1 to find ungrouped resources.
* @param data.ids Resource IDs to filter resources
* @param data.onlyInUseByMe Only resources in use by me
* @param data.onlyWithPermissions Only resources with permissions
* @returns PaginatedResourceResponseDto List of resources with pagination.
* @throws ApiError
*/
export const useResourcesServiceGetAllResources = <TData = Common.ResourcesServiceGetAllResourcesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number | undefined;
  ids?: number[] | undefined;
  limit?: number | undefined;
  onlyInUseByMe?: boolean | undefined;
  onlyWithPermissions?: boolean | undefined;
  page?: number | undefined;
  search?: string | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }, queryKey), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) as TData, ...options });
/**
* Get all resources in use
* @returns Resource List of resources in use.
* @throws ApiError
*/
export const useResourcesServiceGetAllResourcesInUse = <TData = Common.ResourcesServiceGetAllResourcesInUseDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(queryKey), queryFn: () => ResourcesService.getAllResourcesInUse() as TData, ...options });
/**
* Get a resource by ID
* @param data The data for the request.
* @param data.id
* @returns Resource The found resource.
* @throws ApiError
*/
export const useResourcesServiceGetOneResourceById = <TData = Common.ResourcesServiceGetOneResourceByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }, queryKey), queryFn: () => ResourcesService.getOneResourceById({ id }) as TData, ...options });
/**
* @param data The data for the request.
* @param data.resourceId
* @returns unknown
* @throws ApiError
*/
export const useResourcesServiceSseControllerStreamEvents = <TData = Common.ResourcesServiceSseControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) as TData, ...options });
/**
* Get many resource groups
* @returns ResourceGroup The resource groups have been successfully retrieved.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsGetMany = <TData = Common.ResourcesServiceResourceGroupsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(queryKey), queryFn: () => ResourcesService.resourceGroupsGetMany() as TData, ...options });
/**
* Get a resource group by ID
* @param data The data for the request.
* @param data.id The ID of the resource group
* @returns ResourceGroup The resource group has been successfully retrieved.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsGetOne = <TData = Common.ResourcesServiceResourceGroupsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }, queryKey), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) as TData, ...options });
/**
* Get usage history for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @param data.userId The user ID to filter by
* @returns GetResourceHistoryResponseDto Resource usage history retrieved successfully.
* @throws ApiError
*/
export const useResourcesServiceResourceUsageGetHistory = <TData = Common.ResourcesServiceResourceUsageGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId, userId }: {
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
  userId?: number | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) as TData, ...options });
/**
* Get active usage session for current user
* @param data The data for the request.
* @param data.resourceId
* @returns GetActiveUsageSessionDto Active session retrieved successfully.
* @throws ApiError
*/
export const useResourcesServiceResourceUsageGetActiveSession = <TData = Common.ResourcesServiceResourceUsageGetActiveSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) as TData, ...options });
/**
* Check if the current user can control a resource
* @param data The data for the request.
* @param data.resourceId
* @returns CanControlResponseDto User can control resource
* @throws ApiError
*/
export const useResourcesServiceResourceUsageCanControl = <TData = Common.ResourcesServiceResourceUsageCanControlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) as TData, ...options });
/**
* Get all MQTT servers
* @returns MqttServer Returns all MQTT servers
* @throws ApiError
*/
export const useMqttServiceMqttServersGetAll = <TData = Common.MqttServiceMqttServersGetAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(queryKey), queryFn: () => MqttService.mqttServersGetAll() as TData, ...options });
/**
* Get MQTT server by ID
* @param data The data for the request.
* @param data.id
* @returns MqttServer Returns the MQTT server with the specified ID
* @throws ApiError
*/
export const useMqttServiceMqttServersGetOneById = <TData = Common.MqttServiceMqttServersGetOneByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }, queryKey), queryFn: () => MqttService.mqttServersGetOneById({ id }) as TData, ...options });
/**
* Get many introductions by group ID
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @returns ResourceIntroduction The introductions have been successfully retrieved.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroductionsGetMany = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) as TData, ...options });
/**
* Get history of introductions by group ID and user ID
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.userId The ID of the user
* @returns ResourceIntroductionHistoryItem The history has been successfully retrieved.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroductionsGetHistory = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) as TData, ...options });
/**
* Get all introducers for a resource group
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @returns ResourceIntroducer The introducers have been successfully retrieved.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroducersGetMany = <TData = Common.AccessControlServiceResourceGroupIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) as TData, ...options });
/**
* Check if a user is an introducer for a resource group
* @param data The data for the request.
* @param data.userId The ID of the user
* @param data.groupId The ID of the resource group
* @returns IsResourceGroupIntroducerResponseDto The user is an introducer for the resource group.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroducersIsIntroducer = <TData = Common.AccessControlServiceResourceGroupIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) as TData, ...options });
/**
* Check if a user is an introducer for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @param data.includeGroups
* @returns IsResourceIntroducerResponseDto User is an introducer for the resource
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersIsIntroducer = <TData = Common.AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ includeGroups, resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ includeGroups, resourceId, userId }) as TData, ...options });
/**
* Get all introducers for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.type Filter by access type. Omit to return both introducers and maintainers.
* @returns ResourceIntroducer All introducers for a resource
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersGetMany = <TData = Common.AccessControlServiceResourceIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, type }: {
  resourceId: number;
  type?: ResourceIntroducerType | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId, type }, queryKey), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId, type }) as TData, ...options });
/**
* Get all introductions for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceIntroduction All introductions for a resource
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroductionsGetMany = <TData = Common.AccessControlServiceResourceIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) as TData, ...options });
/**
* Get history of introductions by resource ID and user ID
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.userId The ID of the user
* @returns ResourceIntroductionHistoryItem The history has been successfully retrieved.
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroductionsGetHistory = <TData = Common.AccessControlServiceResourceIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, userId }: {
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) as TData, ...options });
/**
* Check if user can manage maintenance
* Check if the authenticated user has permission to manage maintenance for the specified resource
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @returns CanManageMaintenanceResponseDto Permission check completed successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceCanManageMaintenance = <TData = Common.ResourceMaintenancesServiceCanManageMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceCanManageMaintenanceKeyFn({ resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.canManageMaintenance({ resourceId }) as TData, ...options });
/**
* Get maintenances for a resource
* Retrieve paginated list of maintenances for a specific resource with optional filtering
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.page Page number for pagination
* @param data.limit Number of items per page
* @param data.includeUpcoming Include upcoming maintenances (start time in the future)
* @param data.includeActive Include active maintenances (currently ongoing)
* @param data.includePast Include past maintenances (already finished)
* @returns PaginatedMaintenanceResponse Maintenances retrieved successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceFindMaintenances = <TData = Common.ResourceMaintenancesServiceFindMaintenancesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean | undefined;
  includePast?: boolean | undefined;
  includeUpcoming?: boolean | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, page, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page, resourceId }) as TData, ...options });
/**
* Get a specific maintenance by ID
* Retrieve details of a specific maintenance
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.maintenanceId The ID of the maintenance
* @returns ResourceMaintenance Maintenance retrieved successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceGetMaintenance = <TData = Common.ResourceMaintenancesServiceGetMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceGetMaintenanceKeyFn({ maintenanceId, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.getMaintenance({ maintenanceId, resourceId }) as TData, ...options });
/**
* List maintenance schedules for a resource
* Get all maintenance schedules for the given resource
* @param data The data for the request.
* @param data.resourceId Resource ID
* @returns ResourceMaintenanceSchedule List of schedules
* @throws ApiError
*/
export const useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules = <TData = Common.ResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKeyFn({ resourceId }, queryKey), queryFn: () => ResourceMaintenanceSchedulesService.findMaintenanceSchedules({ resourceId }) as TData, ...options });
/**
* Get a maintenance schedule by ID
* Get a single maintenance schedule
* @param data The data for the request.
* @param data.resourceId Resource ID
* @param data.scheduleId Schedule ID
* @returns ResourceMaintenanceSchedule Schedule
* @throws ApiError
*/
export const useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule = <TData = Common.ResourceMaintenanceSchedulesServiceGetMaintenanceScheduleDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, scheduleId }: {
  resourceId: number;
  scheduleId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenanceSchedulesServiceGetMaintenanceScheduleKeyFn({ resourceId, scheduleId }, queryKey), queryFn: () => ResourceMaintenanceSchedulesService.getMaintenanceSchedule({ resourceId, scheduleId }) as TData, ...options });
/**
* Get the billing balance for a user
* @param data The data for the request.
* @param data.userId
* @returns BalanceDto The billing balance for the user.
* @throws ApiError
*/
export const useBillingServiceGetBillingBalance = <TData = Common.BillingServiceGetBillingBalanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ userId }: {
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingBalanceKeyFn({ userId }, queryKey), queryFn: () => BillingService.getBillingBalance({ userId }) as TData, ...options });
/**
* Get the billing transactions for a user
* @param data The data for the request.
* @param data.userId
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @returns TransactionsDto The billing transactions for the user.
* @throws ApiError
*/
export const useBillingServiceGetBillingTransactions = <TData = Common.BillingServiceGetBillingTransactionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, userId }: {
  limit?: number | undefined;
  page?: number | undefined;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionsKeyFn({ limit, page, userId }, queryKey), queryFn: () => BillingService.getBillingTransactions({ limit, page, userId }) as TData, ...options });
/**
* Get a billing transaction for a user
* @param data The data for the request.
* @param data.transactionId
* @returns BillingTransaction The billing transaction for the user.
* @throws ApiError
*/
export const useBillingServiceGetBillingTransaction = <TData = Common.BillingServiceGetBillingTransactionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ transactionId }: {
  transactionId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionKeyFn({ transactionId }, queryKey), queryFn: () => BillingService.getBillingTransaction({ transactionId }) as TData, ...options });
/**
* Get the billing configuration for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceBillingConfigurationDto The billing configuration for the resource.
* @throws ApiError
*/
export const useBillingServiceGetResourceBillingConfiguration = <TData = Common.BillingServiceGetResourceBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetResourceBillingConfigurationKeyFn({ resourceId }, queryKey), queryFn: () => BillingService.getResourceBillingConfiguration({ resourceId }) as TData, ...options });
/**
* Get the billing configuration
* @returns BillingConfigurationDto The current billing configuration.
* @throws ApiError
*/
export const useBillingServiceGetBillingConfiguration = <TData = Common.BillingServiceGetBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingConfigurationKeyFn(queryKey), queryFn: () => BillingService.getBillingConfiguration() as TData, ...options });
/**
* Get the SumUp configuration
* @returns SumUpConfigurationDto The current SumUp configuration.
* @throws ApiError
*/
export const useBillingServiceGetSumUpConfiguration = <TData = Common.BillingServiceGetSumUpConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpConfigurationKeyFn(queryKey), queryFn: () => BillingService.getSumUpConfiguration() as TData, ...options });
/**
* Get the linked SumUp readers
* @returns SumUpReaderDto The linked SumUp readers.
* @throws ApiError
*/
export const useBillingServiceGetSumUpReaders = <TData = Common.BillingServiceGetSumUpReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpReadersKeyFn(queryKey), queryFn: () => BillingService.getSumUpReaders() as TData, ...options });
/**
* @throws ApiError
*/
export const useBillingServiceBillingControllerStreamEvents = <TData = Common.BillingServiceBillingControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceBillingControllerStreamEventsKeyFn(queryKey), queryFn: () => BillingService.billingControllerStreamEvents() as TData, ...options });
/**
* Get node schemas
* Get the schemas for all node types
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceFlowNodeSchemaDto Node schemas retrieved successfully
* @throws ApiError
*/
export const useResourceFlowsServiceGetNodeSchemas = <TData = Common.ResourceFlowsServiceGetNodeSchemasDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetNodeSchemasKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getNodeSchemas({ resourceId }) as TData, ...options });
/**
* Get resource flow
* Retrieve the complete flow configuration for a resource, including all nodes and edges. This endpoint returns the workflow definition that determines what actions are triggered when resource usage events occur.
* @param data The data for the request.
* @param data.resourceId The ID of the resource to get the flow for
* @returns ResourceFlowResponseDto Resource flow retrieved successfully
* @throws ApiError
*/
export const useResourceFlowsServiceGetResourceFlow = <TData = Common.ResourceFlowsServiceGetResourceFlowDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) as TData, ...options });
/**
* Get resource flow logs
* Retrieve the latest execution logs for a resource flow. Logs are returned in descending order by creation time (newest first). This endpoint provides insights into flow execution, including node processing status, errors, and execution details.
* @param data The data for the request.
* @param data.resourceId The ID of the resource to get the flow logs for
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @returns ResourceFlowLogsResponseDto Resource flow logs retrieved successfully
* @throws ApiError
*/
export const useResourceFlowsServiceGetResourceFlowLogs = <TData = Common.ResourceFlowsServiceGetResourceFlowLogsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId }: {
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) as TData, ...options });
/**
* @param data The data for the request.
* @param data.resourceId
* @returns unknown
* @throws ApiError
*/
export const useResourceFlowsServiceResourceFlowsControllerStreamEvents = <TData = Common.ResourceFlowsServiceResourceFlowsControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) as TData, ...options });
/**
* Get buttons
* Get buttons for a resource
* @param data The data for the request.
* @param data.resourceId The ID of the resource to get buttons for
* @returns ResourceFlowNode Buttons retrieved successfully
* @throws ApiError
*/
export const useResourceFlowsServiceGetButtons = <TData = Common.ResourceFlowsServiceGetButtonsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetButtonsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getButtons({ resourceId }) as TData, ...options });
/**
* List flow variables for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns FlowVariableDto
* @throws ApiError
*/
export const useFlowVariablesServiceListFlowVariables = <TData = Common.FlowVariablesServiceListFlowVariablesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseFlowVariablesServiceListFlowVariablesKeyFn({ resourceId }, queryKey), queryFn: () => FlowVariablesService.listFlowVariables({ resourceId }) as TData, ...options });
/**
* Get health summary for a resource
* Returns the current health state for the resource, including any per-source entries (e.g. heartbeat, payload-derived). Resources without any health-related flow nodes are reported as healthy.
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceHealthSummaryDto Health summary
* @throws ApiError
*/
export const useResourceHealthServiceGetResourceHealth = <TData = Common.ResourceHealthServiceGetResourceHealthDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceHealthServiceGetResourceHealthKeyFn({ resourceId }, queryKey), queryFn: () => ResourceHealthService.getResourceHealth({ resourceId }) as TData, ...options });
/**
* Find many projects
* @param data The data for the request.
* @param data.page The page number to retrieve
* @param data.limit The number of items per page to retrieve
* @param data.includeArchived Include archived projects (already finished)
* @returns FindManyProjectsResponseDto The list of projects.
* @throws ApiError
*/
export const useProjectsServiceFindManyProjects = <TData = Common.ProjectsServiceFindManyProjectsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeArchived, limit, page }: {
  includeArchived?: boolean | undefined;
  limit?: number | undefined;
  page?: number | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindManyProjectsKeyFn({ includeArchived, limit, page }, queryKey), queryFn: () => ProjectsService.findManyProjects({ includeArchived, limit, page }) as TData, ...options });
/**
* Get one project
* @param data The data for the request.
* @param data.id
* @returns ProjectWithAccessDto The project.
* @throws ApiError
*/
export const useProjectsServiceFindOneProject = <TData = Common.ProjectsServiceFindOneProjectDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindOneProjectKeyFn({ id }, queryKey), queryFn: () => ProjectsService.findOneProject({ id }) as TData, ...options });
/**
* Get usage history for a project
* @param data The data for the request.
* @param data.id
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @param data.startDate Filter history to entries starting after this date (inclusive)
* @param data.endDate Filter history to entries starting before this date (inclusive)
* @returns ProjectUsageHistoryResponseDto Usage history retrieved successfully.
* @throws ApiError
*/
export const useProjectsServiceGetProjectUsageHistory = <TData = Common.ProjectsServiceGetProjectUsageHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, limit, page, startDate }: {
  endDate?: string | undefined;
  id: number;
  limit?: number | undefined;
  page?: number | undefined;
  startDate?: string | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageHistoryKeyFn({ endDate, id, limit, page, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageHistory({ endDate, id, limit, page, startDate }) as TData, ...options });
/**
* Get aggregated usage statistics for a project
* @param data The data for the request.
* @param data.id
* @param data.startDate Calculate statistics starting from this date (inclusive)
* @param data.endDate Calculate statistics up to this date (inclusive)
* @returns ProjectUsageStatsDto Usage statistics retrieved successfully.
* @throws ApiError
*/
export const useProjectsServiceGetProjectUsageStats = <TData = Common.ProjectsServiceGetProjectUsageStatsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, startDate }: {
  endDate?: string | undefined;
  id: number;
  startDate?: string | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageStatsKeyFn({ endDate, id, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageStats({ endDate, id, startDate }) as TData, ...options });
/**
* List project members
* @param data The data for the request.
* @param data.id
* @returns ProjectMembersResponseDto
* @throws ApiError
*/
export const useProjectsServiceListProjectMembers = <TData = Common.ProjectsServiceListProjectMembersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectMembersKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectMembers({ id }) as TData, ...options });
/**
* List project invitations
* @param data The data for the request.
* @param data.id
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectsServiceListProjectInvitations = <TData = Common.ProjectsServiceListProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectInvitationsKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectInvitations({ id }) as TData, ...options });
/**
* List pending project invitations for the authenticated user
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectInvitationsServiceListMyProjectInvitations = <TData = Common.ProjectInvitationsServiceListMyProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectInvitationsServiceListMyProjectInvitationsKeyFn(queryKey), queryFn: () => ProjectInvitationsService.listMyProjectInvitations() as TData, ...options });
/**
* List forms for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns FormResponseDto
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsList = <TData = Common.ResourceFormsServiceResourceFormsListDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsList({ resourceId }) as TData, ...options });
/**
* Get required forms for a resource action
* @param data The data for the request.
* @param data.resourceId
* @param data.action Usage action the forms are required for
* @returns FormResponseDto
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsGetRequirements = <TData = Common.ResourceFormsServiceResourceFormsGetRequirementsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ action, resourceId }: {
  action: "start" | "takeover" | "end";
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetRequirementsKeyFn({ action, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetRequirements({ action, resourceId }) as TData, ...options });
/**
* Get a form by id
* @param data The data for the request.
* @param data.resourceId
* @param data.formId
* @returns FormResponseDto
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsGetOne = <TData = Common.ResourceFormsServiceResourceFormsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ formId, resourceId }: {
  formId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetOneKeyFn({ formId, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetOne({ formId, resourceId }) as TData, ...options });
/**
* Get all plugins
* @returns LoadedPluginManifest The list of all plugins
* @throws ApiError
*/
export const usePluginsServiceGetPlugins = <TData = Common.PluginsServiceGetPluginsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(queryKey), queryFn: () => PluginsService.getPlugins() as TData, ...options });
/**
* Get any frontend plugin file
* @param data The data for the request.
* @param data.pluginName
* @param data.filePath
* @returns string The requested frontend plugin file
* @throws ApiError
*/
export const usePluginsServiceGetFrontendPluginFile = <TData = Common.PluginsServiceGetFrontendPluginFileDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }, queryKey), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) as TData, ...options });
/**
* Get a reader by ID
* @param data The data for the request.
* @param data.readerId The ID of the reader to get
* @returns Attractap The reader
* @throws ApiError
*/
export const useAttractapServiceGetReaderById = <TData = Common.AttractapServiceGetReaderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ readerId }: {
  readerId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }, queryKey), queryFn: () => AttractapService.getReaderById({ readerId }) as TData, ...options });
/**
* Get all readers
* @returns Attractap The list of readers
* @throws ApiError
*/
export const useAttractapServiceGetReaders = <TData = Common.AttractapServiceGetReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(queryKey), queryFn: () => AttractapService.getReaders() as TData, ...options });
/**
* Get all of your cards
* @returns NFCCard The list of all cards
* @throws ApiError
*/
export const useAttractapServiceGetAllCards = <TData = Common.AttractapServiceGetAllCardsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(queryKey), queryFn: () => AttractapService.getAllCards() as TData, ...options });
/**
* Get all firmwares
* @returns AttractapFirmware Firmwares fetched successfully
* @throws ApiError
*/
export const useAttractapServiceGetFirmwares = <TData = Common.AttractapServiceGetFirmwaresDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(queryKey), queryFn: () => AttractapService.getFirmwares() as TData, ...options });
/**
* Download OTA firmware by name and variant
* @param data The data for the request.
* @param data.firmwareName
* @param data.variantName
* @returns string Firmware streamed successfully
* @throws ApiError
*/
export const useAttractapServiceDownloadFirmwareBinary = <TData = Common.AttractapServiceDownloadFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ firmwareName, variantName }: {
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceDownloadFirmwareBinaryKeyFn({ firmwareName, variantName }, queryKey), queryFn: () => AttractapService.downloadFirmwareBinary({ firmwareName, variantName }) as TData, ...options });
/**
* Get a firmware by name and variant
* @param data The data for the request.
* @param data.firmwareName
* @param data.variantName
* @param data.filename
* @returns string Firmware fetched successfully
* @throws ApiError
*/
export const useAttractapServiceGetFirmwareBinary = <TData = Common.AttractapServiceGetFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }, queryKey), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) as TData, ...options });
/**
* Get the resource usage hours in the date range
* @param data The data for the request.
* @param data.start The start date of the range
* @param data.end The end date of the range
* @returns ResourceUsage The resource usage hours in the date range
* @throws ApiError
*/
export const useAnalyticsServiceGetResourceUsageHoursInDateRange = <TData = Common.AnalyticsServiceGetResourceUsageHoursInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetResourceUsageHoursInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getResourceUsageHoursInDateRange({ end, start }) as TData, ...options });
/**
* Get the billing transactions in the date range
* @param data The data for the request.
* @param data.start The start date of the range
* @param data.end The end date of the range
* @returns BillingTransaction The billing transactions in the date range
* @throws ApiError
*/
export const useAnalyticsServiceGetBillingTransactionsInDateRange = <TData = Common.AnalyticsServiceGetBillingTransactionsInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetBillingTransactionsInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getBillingTransactionsInDateRange({ end, start }) as TData, ...options });
/**
* Reboot the host machine (only for balena devices)
* @returns unknown Host rebooted successfully
* @throws ApiError
*/
export const useSystemServiceRebootHost = <TData = Common.SystemServiceRebootHostMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SystemService.rebootHost() as unknown as Promise<TData>, ...options });
/**
* Shutdown the host machine (only for balena devices)
* @returns unknown Host shutdown successfully
* @throws ApiError
*/
export const useSystemServiceShutdownHost = <TData = Common.SystemServiceShutdownHostMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SystemService.shutdownHost() as unknown as Promise<TData>, ...options });
/**
* Set the local signup domain whitelist
* @param data The data for the request.
* @param data.requestBody
* @returns unknown The local signup domain whitelist has been successfully set.
* @throws ApiError
*/
export const useUsersServiceSetLocalSignupDomainWhitelist = <TData = Common.UsersServiceSetLocalSignupDomainWhitelistMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: string[];
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: string[];
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.setLocalSignupDomainWhitelist({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Create a new user
* @param data The data for the request.
* @param data.requestBody
* @returns User The user has been successfully created.
* @throws ApiError
*/
export const useUsersServiceCreateOneUser = <TData = Common.UsersServiceCreateOneUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateUserDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateUserDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.createOneUser({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Invite a new user
* @param data The data for the request.
* @param data.requestBody
* @returns User The user has been successfully invited.
* @throws ApiError
*/
export const useUsersServiceInviteUser = <TData = Common.UsersServiceInviteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: InviteUserDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: InviteUserDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.inviteUser({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Invite multiple users from a CSV file
* @param data The data for the request.
* @param data.formData
* @returns User Users have been successfully invited.
* @throws ApiError
*/
export const useUsersServiceInviteUsersFromCsv = <TData = Common.UsersServiceInviteUsersFromCsvMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CsvInviteUploadDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CsvInviteUploadDto;
}, TContext>({ mutationFn: ({ formData }) => UsersService.inviteUsersFromCsv({ formData }) as unknown as Promise<TData>, ...options });
/**
* Verify a user email address
* @param data The data for the request.
* @param data.requestBody
* @returns unknown Email verified successfully.
* @throws ApiError
*/
export const useUsersServiceVerifyEmail = <TData = Common.UsersServiceVerifyEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: VerifyEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: VerifyEmailDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.verifyEmail({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Resend the email verification link
* @param data The data for the request.
* @param data.requestBody
* @returns unknown If the email exists and is not yet verified, a new verification email will be sent.
* @throws ApiError
*/
export const useUsersServiceResendVerificationEmail = <TData = Common.UsersServiceResendVerificationEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResendVerificationEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResendVerificationEmailDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.resendVerificationEmail({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Accept a user invitation
* @param data The data for the request.
* @param data.requestBody
* @returns User Invitation accepted successfully.
* @throws ApiError
*/
export const useUsersServiceAcceptInvitation = <TData = Common.UsersServiceAcceptInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: AcceptInvitationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: AcceptInvitationDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.acceptInvitation({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Request a password reset
* @param data The data for the request.
* @param data.requestBody
* @returns unknown OK
* @throws ApiError
*/
export const useUsersServiceRequestPasswordReset = <TData = Common.UsersServiceRequestPasswordResetMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResetPasswordDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResetPasswordDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.requestPasswordReset({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Change a user password after password reset
* @param data The data for the request.
* @param data.userId
* @param data.requestBody
* @returns unknown OK
* @throws ApiError
*/
export const useUsersServiceChangePasswordViaResetToken = <TData = Common.UsersServiceChangePasswordViaResetTokenMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangePasswordDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangePasswordDto;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, userId }) => UsersService.changePasswordViaResetToken({ requestBody, userId }) as unknown as Promise<TData>, ...options });
/**
* Request account deletion email
* @returns unknown Delete account confirmation email sent.
* @throws ApiError
*/
export const useUsersServiceRequestDeleteAccount = <TData = Common.UsersServiceRequestDeleteAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => UsersService.requestDeleteAccount() as unknown as Promise<TData>, ...options });
/**
* Confirm account deletion via email token
* @param data The data for the request.
* @param data.requestBody
* @returns unknown Account deleted.
* @throws ApiError
*/
export const useUsersServiceConfirmDeleteAccount = <TData = Common.UsersServiceConfirmDeleteAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: DeleteAccountConfirmDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: DeleteAccountConfirmDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.confirmDeleteAccount({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Bulk update user permissions
* @param data The data for the request.
* @param data.requestBody
* @returns User The user permissions have been successfully updated.
* @throws ApiError
*/
export const useUsersServiceBulkUpdatePermissions = <TData = Common.UsersServiceBulkUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: BulkUpdateUserPermissionsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: BulkUpdateUserPermissionsDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.bulkUpdatePermissions({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Set a user's password directly
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns unknown The password has been successfully updated.
* @throws ApiError
*/
export const useUsersServiceSetUserPassword = <TData = Common.UsersServiceSetUserPasswordMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: SetUserPasswordDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: SetUserPasswordDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.setUserPassword({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Create a new session using local authentication
* @param data The data for the request.
* @param data.requestBody
* @returns CreateSessionResponse The session has been created
* @throws ApiError
*/
export const useAuthenticationServiceCreateSession = <TData = Common.AuthenticationServiceCreateSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: { username?: string; password?: string; twoFactorCode?: string; tokenLocation?: "cookie" | "body"; };
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: { username?: string; password?: string; twoFactorCode?: string; tokenLocation?: "cookie" | "body"; };
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.createSession({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Create a new SSO provider
* @param data The data for the request.
* @param data.requestBody
* @returns SSOProvider The SSO provider has been created
* @throws ApiError
*/
export const useAuthenticationServiceCreateOneSsoProvider = <TData = Common.AuthenticationServiceCreateOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateSSOProviderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateSSOProviderDto;
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.createOneSsoProvider({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Link an account to an SSO identity via a signed token
* @param data The data for the request.
* @param data.requestBody
* @returns unknown The account has been linked to the SSO identity
* @throws ApiError
*/
export const useAuthenticationServiceLinkUserToExternalAccount = <TData = Common.AuthenticationServiceLinkUserToExternalAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.linkUserToExternalAccount({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* SSO-initiated logout
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO client secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO client secret> (or use x-api-key)
* @returns unknown All user sessions have been revoked
* @throws ApiError
*/
export const useAuthenticationServiceSsoOidcLogout = <TData = Common.AuthenticationServiceSsoOidcLogoutMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcLogout({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* SAML-initiated logout
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO provisioning secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO provisioning secret> (or use x-api-key)
* @returns unknown All user sessions have been revoked
* @throws ApiError
*/
export const useAuthenticationServiceSsoSamlLogout = <TData = Common.AuthenticationServiceSsoSamlLogoutMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlLogout({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* SSO-initiated user deletion
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO client secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO client secret> (or use x-api-key)
* @returns unknown The user has been deleted
* @throws ApiError
*/
export const useAuthenticationServiceSsoOidcDeleteUser = <TData = Common.AuthenticationServiceSsoOidcDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcDeleteUser({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* SAML-initiated user deletion
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO provisioning secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO provisioning secret> (or use x-api-key)
* @returns unknown The user has been deleted
* @throws ApiError
*/
export const useAuthenticationServiceSsoSamlDeleteUser = <TData = Common.AuthenticationServiceSsoSamlDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlDeleteUser({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* SSO-initiated permission update
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO client secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO client secret> (or use x-api-key)
* @returns unknown The user permissions have been updated
* @throws ApiError
*/
export const useAuthenticationServiceSsoOidcUpdatePermissions = <TData = Common.AuthenticationServiceSsoOidcUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcUpdatePermissions({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* SAML-initiated permission update
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.requestBody
* @param data.xApiKey SSO provisioning secret (alternative to Authorization header)
* @param data.authorization Bearer <SSO provisioning secret> (or use x-api-key)
* @returns unknown The user permissions have been updated
* @throws ApiError
*/
export const useAuthenticationServiceSsoSamlUpdatePermissions = <TData = Common.AuthenticationServiceSsoSamlUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string | undefined;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string | undefined;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string | undefined;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlUpdatePermissions({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
/**
* Callback for SAML login
* @param data The data for the request.
* @param data.redirectTo
* @param data.relayState
* @param data.providerId The ID of the SSO provider
* @returns CreateSessionResponse The user has been logged in
* @throws ApiError
*/
export const useAuthenticationServiceSamlLoginCallback = <TData = Common.AuthenticationServiceSamlLoginCallbackMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  providerId: string;
  redirectTo: string;
  relayState: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  providerId: string;
  redirectTo: string;
  relayState: string;
}, TContext>({ mutationFn: ({ providerId, redirectTo, relayState }) => AuthenticationService.samlLoginCallback({ providerId, redirectTo, relayState }) as unknown as Promise<TData>, ...options });
/**
* Start 2FA setup for the current user
* @returns TwoFactorSetupResponseDto 2FA setup details (secret and otpauth URL)
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceSetupTwoFactor = <TData = Common.TwoFactorAuthenticationServiceSetupTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => TwoFactorAuthenticationService.setupTwoFactor() as unknown as Promise<TData>, ...options });
/**
* Verify and enable 2FA for the current user
* @param data The data for the request.
* @param data.requestBody
* @returns TwoFactorStatusDto 2FA status after verification
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceVerifyTwoFactor = <TData = Common.TwoFactorAuthenticationServiceVerifyTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.verifyTwoFactor({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Disable 2FA for the current user
* @param data The data for the request.
* @param data.requestBody
* @returns unknown 2FA has been disabled
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceDisableTwoFactor = <TData = Common.TwoFactorAuthenticationServiceDisableTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.disableTwoFactor({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Set the configured 2FA policy
* @param data The data for the request.
* @param data.requestBody
* @returns TwoFactorPolicyDto The configured 2FA policy has been updated
* @throws ApiError
*/
export const useTwoFactorAuthenticationServiceSetTwoFactorPolicy = <TData = Common.TwoFactorAuthenticationServiceSetTwoFactorPolicyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorPolicyDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorPolicyDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.setTwoFactorPolicy({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Preview MJML content as HTML
* @param data The data for the request.
* @param data.requestBody
* @returns PreviewMjmlResponseDto MJML preview result
* @throws ApiError
*/
export const useEmailTemplatesServiceEmailTemplateControllerPreviewMjml = <TData = Common.EmailTemplatesServiceEmailTemplateControllerPreviewMjmlMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: PreviewMjmlDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: PreviewMjmlDto;
}, TContext>({ mutationFn: ({ requestBody }) => EmailTemplatesService.emailTemplateControllerPreviewMjml({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Apply first-time setup settings
* @param data The data for the request.
* @param data.requestBody
* @returns SystemSettingsDto System settings updated.
* @throws ApiError
*/
export const useSettingsServiceApplyFirstTimeSetupSettings = <TData = Common.SettingsServiceApplyFirstTimeSetupSettingsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateSystemSettingsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateSystemSettingsDto;
}, TContext>({ mutationFn: ({ requestBody }) => SettingsService.applyFirstTimeSetupSettings({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Generate a new metrics API key
* @returns GenerateMetricsApiKeyResponseDto Metrics API key generated.
* @throws ApiError
*/
export const useSettingsServiceGenerateMetricsApiKey = <TData = Common.SettingsServiceGenerateMetricsApiKeyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SettingsService.generateMetricsApiKey() as unknown as Promise<TData>, ...options });
/**
* Server-side preview: evaluate a candidate password against the current (or draft) policy
* @param data The data for the request.
* @param data.requestBody
* @returns PreviewPasswordResultDto Full preview result including zxcvbn + HIBP + history checks.
* @throws ApiError
*/
export const usePasswordPolicyAdminServicePreviewAdminPasswordPolicy = <TData = Common.PasswordPolicyAdminServicePreviewAdminPasswordPolicyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: PreviewPasswordDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: PreviewPasswordDto;
}, TContext>({ mutationFn: ({ requestBody }) => PasswordPolicyAdminService.previewAdminPasswordPolicy({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Create a new resource
* @param data The data for the request.
* @param data.formData
* @returns Resource The resource has been successfully created.
* @throws ApiError
*/
export const useResourcesServiceCreateOneResource = <TData = Common.ResourcesServiceCreateOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CreateResourceDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CreateResourceDto;
}, TContext>({ mutationFn: ({ formData }) => ResourcesService.createOneResource({ formData }) as unknown as Promise<TData>, ...options });
/**
* Create a new resource group
* @param data The data for the request.
* @param data.requestBody
* @returns ResourceGroup The resource group has been successfully created.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsCreateOne = <TData = Common.ResourcesServiceResourceGroupsCreateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateResourceGroupDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateResourceGroupDto;
}, TContext>({ mutationFn: ({ requestBody }) => ResourcesService.resourceGroupsCreateOne({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Add a resource to a resource group
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.resourceId The ID of the resource
* @returns unknown The resource has been successfully added to the resource group.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsAddResource = <TData = Common.ResourcesServiceResourceGroupsAddResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ groupId, resourceId }) => ResourcesService.resourceGroupsAddResource({ groupId, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Start a resource usage session
* @param data The data for the request.
* @param data.resourceId
* @param data.requestBody
* @returns ResourceUsage Usage session started successfully.
* @throws ApiError
*/
export const useResourcesServiceResourceUsageStartSession = <TData = Common.ResourcesServiceResourceUsageStartSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: StartUsageSessionDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: StartUsageSessionDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourcesService.resourceUsageStartSession({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Lock a resource of door type
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceUsage Door locked successfully.
* @throws ApiError
*/
export const useResourcesServiceLockDoor = <TData = Common.ResourcesServiceLockDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.lockDoor({ resourceId }) as unknown as Promise<TData>, ...options });
/**
* Unlock a resource of door type
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceUsage Door unlocked successfully.
* @throws ApiError
*/
export const useResourcesServiceUnlockDoor = <TData = Common.ResourcesServiceUnlockDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.unlockDoor({ resourceId }) as unknown as Promise<TData>, ...options });
/**
* Unlatch a resource of door type (if supported)
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceUsage Door unlatch successfully.
* @throws ApiError
*/
export const useResourcesServiceUnlatchDoor = <TData = Common.ResourcesServiceUnlatchDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.unlatchDoor({ resourceId }) as unknown as Promise<TData>, ...options });
/**
* Create new MQTT server
* @param data The data for the request.
* @param data.requestBody
* @returns MqttServer MQTT server created successfully
* @throws ApiError
*/
export const useMqttServiceMqttServersCreateOne = <TData = Common.MqttServiceMqttServersCreateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateMqttServerDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateMqttServerDto;
}, TContext>({ mutationFn: ({ requestBody }) => MqttService.mqttServersCreateOne({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Grant introduction permission for a resource group to a user
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.userId The ID of the user
* @param data.requestBody
* @returns ResourceIntroductionHistoryItem The introduction has been successfully granted.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroductionsGrant = <TData = Common.AccessControlServiceResourceGroupIntroductionsGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, requestBody, userId }) => AccessControlService.resourceGroupIntroductionsGrant({ groupId, requestBody, userId }) as unknown as Promise<TData>, ...options });
/**
* Revoke introduction permission for a resource group from a user
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.userId The ID of the user
* @param data.requestBody
* @returns ResourceIntroductionHistoryItem The introduction has been successfully revoked.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroductionsRevoke = <TData = Common.AccessControlServiceResourceGroupIntroductionsRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, requestBody, userId }) => AccessControlService.resourceGroupIntroductionsRevoke({ groupId, requestBody, userId }) as unknown as Promise<TData>, ...options });
/**
* Grant a user introduction permission for a resource group
* @param data The data for the request.
* @param data.userId The ID of the user
* @param data.groupId The ID of the resource group
* @param data.requestBody
* @returns unknown The introducer has been successfully granted.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroducersGrant = <TData = Common.AccessControlServiceResourceGroupIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  requestBody: GrantIntroducerDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  requestBody: GrantIntroducerDto;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, requestBody, userId }) => AccessControlService.resourceGroupIntroducersGrant({ groupId, requestBody, userId }) as unknown as Promise<TData>, ...options });
/**
* Revoke a user introduction permission for a resource group
* @param data The data for the request.
* @param data.userId The ID of the user
* @param data.groupId The ID of the resource group
* @returns unknown The introducer has been successfully revoked.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroducersRevoke = <TData = Common.AccessControlServiceResourceGroupIntroducersRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, userId }) => AccessControlService.resourceGroupIntroducersRevoke({ groupId, userId }) as unknown as Promise<TData>, ...options });
/**
* Grant a user introduction permission for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @param data.requestBody
* @returns ResourceIntroducer Introduction permissions granted
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersGrant = <TData = Common.AccessControlServiceResourceIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: GrantIntroducerDto;
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: GrantIntroducerDto;
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, userId }) => AccessControlService.resourceIntroducersGrant({ requestBody, resourceId, userId }) as unknown as Promise<TData>, ...options });
/**
* Grant a user usage permission for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @param data.requestBody
* @returns ResourceIntroductionHistoryItem Introduction granted
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroductionsGrant = <TData = Common.AccessControlServiceResourceIntroductionsGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, userId }) => AccessControlService.resourceIntroductionsGrant({ requestBody, resourceId, userId }) as unknown as Promise<TData>, ...options });
/**
* Create a maintenance for a resource
* Create a new maintenance schedule for a specific resource
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.requestBody
* @returns ResourceMaintenance Maintenance created successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceCreateMaintenance = <TData = Common.ResourceMaintenancesServiceCreateMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateMaintenanceDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateMaintenanceDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceMaintenancesService.createMaintenance({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Mark a maintenance as done
* Finish an active maintenance (set end time, completedAt, completedBy). Only maintenance users can call this.
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.maintenanceId The ID of the maintenance
* @param data.requestBody
* @returns ResourceMaintenance Maintenance marked as done successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceFinishMaintenance = <TData = Common.ResourceMaintenancesServiceFinishMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  maintenanceId: number;
  requestBody: FinishMaintenanceDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  maintenanceId: number;
  requestBody: FinishMaintenanceDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ maintenanceId, requestBody, resourceId }) => ResourceMaintenancesService.finishMaintenance({ maintenanceId, requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Create a maintenance schedule
* Create a new maintenance schedule for the resource
* @param data The data for the request.
* @param data.resourceId Resource ID
* @param data.requestBody
* @returns ResourceMaintenanceSchedule Schedule created
* @throws ApiError
*/
export const useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule = <TData = Common.ResourceMaintenanceSchedulesServiceCreateMaintenanceScheduleMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateMaintenanceScheduleDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateMaintenanceScheduleDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceMaintenanceSchedulesService.createMaintenanceSchedule({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Top up or charge the billing balance for a user
* @param data The data for the request.
* @param data.userId
* @param data.requestBody
* @returns number The billing balance for the user has been topped up.
* @throws ApiError
*/
export const useBillingServiceCreateManualTransaction = <TData = Common.BillingServiceCreateManualTransactionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ModifyBalanceDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ModifyBalanceDto;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, userId }) => BillingService.createManualTransaction({ requestBody, userId }) as unknown as Promise<TData>, ...options });
/**
* Update the billing configuration for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.requestBody
* @returns ResourceBillingConfiguration The billing configuration for the resource has been updated.
* @throws ApiError
*/
export const useBillingServiceUpdateResourceBillingConfiguration = <TData = Common.BillingServiceUpdateResourceBillingConfigurationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceBillingConfigurationDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceBillingConfigurationDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => BillingService.updateResourceBillingConfiguration({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Set the SumUp configuration
* @param data The data for the request.
* @param data.requestBody
* @returns string The SumUp apiKey has been set.
* @throws ApiError
*/
export const useBillingServiceSetSumUpApiKey = <TData = Common.BillingServiceSetSumUpApiKeyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SetSumUpApiKeyDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SetSumUpApiKeyDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.setSumUpApiKey({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Set the billing configuration
* @param data The data for the request.
* @param data.requestBody
* @returns BillingConfigurationDto The billing configuration has been set.
* @throws ApiError
*/
export const useBillingServiceSetBillingConfiguration = <TData = Common.BillingServiceSetBillingConfigurationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SetBillingConfigurationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SetBillingConfigurationDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.setBillingConfiguration({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Pair a SumUp reader
* @param data The data for the request.
* @param data.requestBody
* @returns SumUpReaderDto The created SumUp reader.
* @throws ApiError
*/
export const useBillingServicePairSumUpReader = <TData = Common.BillingServicePairSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: PairSumUpReaderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: PairSumUpReaderDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.pairSumUpReader({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Top up using a SumUp reader
* @param data The data for the request.
* @param data.requestBody
* @returns BillingTransaction The billing transaction for the user has been topped up.
* @throws ApiError
*/
export const useBillingServiceTopUpWithSumUpReader = <TData = Common.BillingServiceTopUpWithSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SumupTopUpDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SumupTopUpDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.topUpWithSumUpReader({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Callback from SumUp
* @param data The data for the request.
* @param data.requestBody
* @returns unknown
* @throws ApiError
*/
export const useBillingServiceSumUpTopUpCallback = <TData = Common.BillingServiceSumUpTopUpCallbackMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SumupTransactionCallbackDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SumupTransactionCallbackDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.sumUpTopUpCallback({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Refund a billing transaction
* @param data The data for the request.
* @param data.transactionId
* @param data.requestBody
* @returns BillingTransaction The billing transaction has been refunded.
* @throws ApiError
*/
export const useBillingServiceRefundTransaction = <TData = Common.BillingServiceRefundTransactionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: RefundTransactionDto;
  transactionId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: RefundTransactionDto;
  transactionId: number;
}, TContext>({ mutationFn: ({ requestBody, transactionId }) => BillingService.refundTransaction({ requestBody, transactionId }) as unknown as Promise<TData>, ...options });
/**
* Press a button
* Press a button to trigger the flow
* @param data The data for the request.
* @param data.resourceId
* @param data.buttonId The ID of the button to press
* @returns unknown Button pressed successfully
* @throws ApiError
*/
export const useResourceFlowsServicePressButton = <TData = Common.ResourceFlowsServicePressButtonMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  buttonId: string;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  buttonId: string;
  resourceId: number;
}, TContext>({ mutationFn: ({ buttonId, resourceId }) => ResourceFlowsService.pressButton({ buttonId, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Create a project
* @param data The data for the request.
* @param data.formData
* @returns ProjectWithAccessDto The project was created successfully.
* @throws ApiError
*/
export const useProjectsServiceCreateProject = <TData = Common.ProjectsServiceCreateProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CreateProjectDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CreateProjectDto;
}, TContext>({ mutationFn: ({ formData }) => ProjectsService.createProject({ formData }) as unknown as Promise<TData>, ...options });
/**
* Archive a project
* @param data The data for the request.
* @param data.id
* @returns ProjectWithAccessDto The project was archived successfully.
* @throws ApiError
*/
export const useProjectsServiceArchiveProject = <TData = Common.ProjectsServiceArchiveProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ProjectsService.archiveProject({ id }) as unknown as Promise<TData>, ...options });
/**
* Unarchive a project
* @param data The data for the request.
* @param data.id
* @returns ProjectWithAccessDto The project was unarchived successfully.
* @throws ApiError
*/
export const useProjectsServiceUnarchiveProject = <TData = Common.ProjectsServiceUnarchiveProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ProjectsService.unarchiveProject({ id }) as unknown as Promise<TData>, ...options });
/**
* Create a project invitation
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectsServiceCreateProjectInvitation = <TData = Common.ProjectsServiceCreateProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: CreateProjectInvitationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: CreateProjectInvitationDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => ProjectsService.createProjectInvitation({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Resend a project invitation
* @param data The data for the request.
* @param data.id
* @param data.invitationId
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectsServiceResendProjectInvitation = <TData = Common.ProjectsServiceResendProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>({ mutationFn: ({ id, invitationId }) => ProjectsService.resendProjectInvitation({ id, invitationId }) as unknown as Promise<TData>, ...options });
/**
* Accept a project invitation
* @param data The data for the request.
* @param data.invitationId
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectInvitationsServiceAcceptProjectInvitation = <TData = Common.ProjectInvitationsServiceAcceptProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  invitationId: number;
}, TContext>({ mutationFn: ({ invitationId }) => ProjectInvitationsService.acceptProjectInvitation({ invitationId }) as unknown as Promise<TData>, ...options });
/**
* Decline a project invitation
* @param data The data for the request.
* @param data.invitationId
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectInvitationsServiceDeclineProjectInvitation = <TData = Common.ProjectInvitationsServiceDeclineProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  invitationId: number;
}, TContext>({ mutationFn: ({ invitationId }) => ProjectInvitationsService.declineProjectInvitation({ invitationId }) as unknown as Promise<TData>, ...options });
/**
* Create a form
* @param data The data for the request.
* @param data.resourceId
* @param data.requestBody
* @returns FormResponseDto
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsCreate = <TData = Common.ResourceFormsServiceResourceFormsCreateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateFormDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateFormDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceFormsService.resourceFormsCreate({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Upload a new plugin
* @param data The data for the request.
* @param data.formData
* @throws ApiError
*/
export const usePluginsServiceUploadPlugin = <TData = Common.PluginsServiceUploadPluginMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UploadPluginDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UploadPluginDto;
}, TContext>({ mutationFn: ({ formData }) => PluginsService.uploadPlugin({ formData }) as unknown as Promise<TData>, ...options });
/**
* Enroll a new NFC card
* @param data The data for the request.
* @param data.requestBody
* @returns EnrollNfcCardResponseDto Enrollment initiated, continue on Reader
* @throws ApiError
*/
export const useAttractapServiceEnrollNfcCard = <TData = Common.AttractapServiceEnrollNfcCardMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: EnrollNfcCardDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: EnrollNfcCardDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.enrollNfcCard({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Reset an NFC card
* @param data The data for the request.
* @param data.requestBody
* @returns ResetNfcCardResponseDto Reset initiated, continue on Reader
* @throws ApiError
*/
export const useAttractapServiceResetNfcCard = <TData = Common.AttractapServiceResetNfcCardMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResetNfcCardDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResetNfcCardDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.resetNfcCard({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Get the app key for a card by UID
* @param data The data for the request.
* @param data.requestBody
* @returns AppKeyResponseDto The app key for the card
* @throws ApiError
*/
export const useAttractapServiceGetAppKeyByUid = <TData = Common.AttractapServiceGetAppKeyByUidMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: AppKeyRequestDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: AppKeyRequestDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.getAppKeyByUid({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Symbolicate an ESP32 coredump against its firmware ELF
* @param data The data for the request.
* @param data.formData
* @returns CoredumpSymbolicationResultDto Coredump symbolicated successfully
* @throws ApiError
*/
export const useAttractapServiceSymbolicateCoredump = <TData = Common.AttractapServiceSymbolicateCoredumpMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: SymbolicateCoredumpDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: SymbolicateCoredumpDto;
}, TContext>({ mutationFn: ({ formData }) => AttractapService.symbolicateCoredump({ formData }) as unknown as Promise<TData>, ...options });
/**
* Update an existing SSO provider
* @param data The data for the request.
* @param data.id The ID of the SSO provider
* @param data.requestBody
* @returns SSOProvider The SSO provider has been updated
* @throws ApiError
*/
export const useAuthenticationServiceUpdateOneSsoProvider = <TData = Common.AuthenticationServiceUpdateOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateSSOProviderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateSSOProviderDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => AuthenticationService.updateOneSsoProvider({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Upsert a per-role password policy override
* @param data The data for the request.
* @param data.role
* @param data.requestBody
* @returns PasswordPolicyOverrideDto The saved override row.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride = <TData = Common.PasswordPolicyAdminServiceUpsertPasswordPolicyOverrideMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpsertPasswordPolicyOverrideDto;
  role: PasswordPolicyRole;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpsertPasswordPolicyOverrideDto;
  role: PasswordPolicyRole;
}, TContext>({ mutationFn: ({ requestBody, role }) => PasswordPolicyAdminService.upsertPasswordPolicyOverride({ requestBody, role }) as unknown as Promise<TData>, ...options });
/**
* Update a resource
* @param data The data for the request.
* @param data.id
* @param data.formData
* @returns Resource The resource has been successfully updated.
* @throws ApiError
*/
export const useResourcesServiceUpdateOneResource = <TData = Common.ResourcesServiceUpdateOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UpdateResourceDto;
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UpdateResourceDto;
  id: number;
}, TContext>({ mutationFn: ({ formData, id }) => ResourcesService.updateOneResource({ formData, id }) as unknown as Promise<TData>, ...options });
/**
* Update a resource group by ID
* @param data The data for the request.
* @param data.id The ID of the resource group
* @param data.requestBody
* @returns ResourceGroup The resource group has been successfully updated.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsUpdateOne = <TData = Common.ResourcesServiceResourceGroupsUpdateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateResourceGroupDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateResourceGroupDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => ResourcesService.resourceGroupsUpdateOne({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* End a resource usage session
* @param data The data for the request.
* @param data.resourceId
* @param data.requestBody
* @returns ResourceUsage Usage session ended successfully.
* @throws ApiError
*/
export const useResourcesServiceResourceUsageEndSession = <TData = Common.ResourcesServiceResourceUsageEndSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: EndUsageSessionDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: EndUsageSessionDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourcesService.resourceUsageEndSession({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Update usage session project assignment
* @param data The data for the request.
* @param data.resourceId
* @param data.usageId
* @param data.requestBody
* @returns ResourceUsage Usage session project updated successfully.
* @throws ApiError
*/
export const useResourcesServiceResourceUsageUpdateSessionProject = <TData = Common.ResourcesServiceResourceUsageUpdateSessionProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateUsageSessionProjectDto;
  resourceId: number;
  usageId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateUsageSessionProjectDto;
  resourceId: number;
  usageId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, usageId }) => ResourcesService.resourceUsageUpdateSessionProject({ requestBody, resourceId, usageId }) as unknown as Promise<TData>, ...options });
/**
* Update MQTT server
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns MqttServer MQTT server updated successfully
* @throws ApiError
*/
export const useMqttServiceMqttServersUpdateOne = <TData = Common.MqttServiceMqttServersUpdateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateMqttServerDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateMqttServerDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => MqttService.mqttServersUpdateOne({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update a maintenance schedule
* Update an existing maintenance schedule
* @param data The data for the request.
* @param data.resourceId Resource ID
* @param data.scheduleId Schedule ID
* @param data.requestBody
* @returns ResourceMaintenanceSchedule Schedule updated
* @throws ApiError
*/
export const useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule = <TData = Common.ResourceMaintenanceSchedulesServiceUpdateMaintenanceScheduleMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateMaintenanceScheduleDto;
  resourceId: number;
  scheduleId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateMaintenanceScheduleDto;
  resourceId: number;
  scheduleId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, scheduleId }) => ResourceMaintenanceSchedulesService.updateMaintenanceSchedule({ requestBody, resourceId, scheduleId }) as unknown as Promise<TData>, ...options });
/**
* Save resource flow
* Save the complete flow configuration for a resource. This will replace all existing nodes and edges. The flow defines what actions (HTTP requests, MQTT messages, etc.) are triggered when resource usage events occur.
* @param data The data for the request.
* @param data.resourceId The ID of the resource to save the flow for
* @param data.requestBody
* @returns ResourceFlowResponseDto Resource flow saved successfully. May include validation errors for individual nodes that have invalid configuration.
* @throws ApiError
*/
export const useResourceFlowsServiceSaveResourceFlow = <TData = Common.ResourceFlowsServiceSaveResourceFlowMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResourceFlowSaveDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResourceFlowSaveDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceFlowsService.saveResourceFlow({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Upsert a flow variable
* @param data The data for the request.
* @param data.resourceId
* @param data.key
* @param data.scope
* @param data.requestBody
* @returns void
* @throws ApiError
*/
export const useFlowVariablesServiceUpsertFlowVariable = <TData = Common.FlowVariablesServiceUpsertFlowVariableMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  key: string;
  requestBody: FlowVariableUpsertDto;
  resourceId: number;
  scope: ResourceFlowVariableScope;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  key: string;
  requestBody: FlowVariableUpsertDto;
  resourceId: number;
  scope: ResourceFlowVariableScope;
}, TContext>({ mutationFn: ({ key, requestBody, resourceId, scope }) => FlowVariablesService.upsertFlowVariable({ key, requestBody, resourceId, scope }) as unknown as Promise<TData>, ...options });
/**
* Update a project
* @param data The data for the request.
* @param data.id
* @param data.formData
* @returns ProjectWithAccessDto The project was updated successfully.
* @throws ApiError
*/
export const useProjectsServiceUpdateProject = <TData = Common.ProjectsServiceUpdateProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UpdateProjectDto;
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UpdateProjectDto;
  id: number;
}, TContext>({ mutationFn: ({ formData, id }) => ProjectsService.updateProject({ formData, id }) as unknown as Promise<TData>, ...options });
/**
* Update a form
* @param data The data for the request.
* @param data.resourceId
* @param data.formId
* @param data.requestBody
* @returns FormResponseDto
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsUpdate = <TData = Common.ResourceFormsServiceResourceFormsUpdateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formId: number;
  requestBody: UpdateFormDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formId: number;
  requestBody: UpdateFormDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ formId, requestBody, resourceId }) => ResourceFormsService.resourceFormsUpdate({ formId, requestBody, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Change current user username (limit once per day)
* @param data The data for the request.
* @param data.requestBody
* @returns User Username changed.
* @throws ApiError
*/
export const useUsersServiceChangeMyUsername = <TData = Common.UsersServiceChangeMyUsernameMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangeUsernameDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangeUsernameDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.changeMyUsername({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Change current user email address
* @param data The data for the request.
* @param data.requestBody
* @returns User Email changed.
* @throws ApiError
*/
export const useUsersServiceChangeMyEmail = <TData = Common.UsersServiceChangeMyEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangeEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangeEmailDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.changeMyEmail({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update a user's system permissions
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns User The user permissions have been successfully updated.
* @throws ApiError
*/
export const useUsersServiceUpdatePermissions = <TData = Common.UsersServiceUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateUserPermissionsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateUserPermissionsDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.updatePermissions({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Admin: Change a user's username (no limit)
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns User Username changed.
* @throws ApiError
*/
export const useUsersServiceChangeUserUsername = <TData = Common.UsersServiceChangeUserUsernameMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeUsernameDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeUsernameDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserUsername({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Admin: Change a user's email address
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns User Email changed.
* @throws ApiError
*/
export const useUsersServiceChangeUserEmail = <TData = Common.UsersServiceChangeUserEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeEmailDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserEmail({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Change a user's billing factor
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns User Billing factor changed.
* @throws ApiError
*/
export const useUsersServiceChangeUserBillingFactor = <TData = Common.UsersServiceChangeUserBillingFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeBillingFactorDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeBillingFactorDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserBillingFactor({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update an email template
* @param data The data for the request.
* @param data.type Template type/type
* @param data.requestBody
* @returns EmailTemplate Template updated successfully
* @throws ApiError
*/
export const useEmailTemplatesServiceEmailTemplateControllerUpdate = <TData = Common.EmailTemplatesServiceEmailTemplateControllerUpdateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: EmailTemplateType;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: EmailTemplateType;
}, TContext>({ mutationFn: ({ requestBody, type }) => EmailTemplatesService.emailTemplateControllerUpdate({ requestBody, type }) as unknown as Promise<TData>, ...options });
/**
* Update system settings
* @param data The data for the request.
* @param data.requestBody
* @returns SystemSettingsDto System settings updated.
* @throws ApiError
*/
export const useSettingsServiceUpdateSystemSettings = <TData = Common.SettingsServiceUpdateSystemSettingsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateSystemSettingsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateSystemSettingsDto;
}, TContext>({ mutationFn: ({ requestBody }) => SettingsService.updateSystemSettings({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update metrics settings
* @param data The data for the request.
* @param data.requestBody
* @returns MetricsSettingsDto Metrics settings updated.
* @throws ApiError
*/
export const useSettingsServiceUpdateMetricsSettings = <TData = Common.SettingsServiceUpdateMetricsSettingsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateMetricsSettingsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateMetricsSettingsDto;
}, TContext>({ mutationFn: ({ requestBody }) => SettingsService.updateMetricsSettings({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update auth rate-limit settings
* @param data The data for the request.
* @param data.requestBody
* @returns AuthRateLimitSettingsDto Auth rate-limit settings updated.
* @throws ApiError
*/
export const useSettingsServiceUpdateAuthRateLimitSettings = <TData = Common.SettingsServiceUpdateAuthRateLimitSettingsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateAuthRateLimitSettingsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateAuthRateLimitSettingsDto;
}, TContext>({ mutationFn: ({ requestBody }) => SettingsService.updateAuthRateLimitSettings({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update the global password policy
* @param data The data for the request.
* @param data.requestBody
* @returns PasswordPolicyDto Password policy updated.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy = <TData = Common.PasswordPolicyAdminServiceUpdateAdminPasswordPolicyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdatePasswordPolicyDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdatePasswordPolicyDto;
}, TContext>({ mutationFn: ({ requestBody }) => PasswordPolicyAdminService.updateAdminPasswordPolicy({ requestBody }) as unknown as Promise<TData>, ...options });
/**
* Update reader name and connected resources
* @param data The data for the request.
* @param data.readerId The ID of the reader to update
* @param data.requestBody
* @returns UpdateReaderResponseDto Reader updated successfully
* @throws ApiError
*/
export const useAttractapServiceUpdateReader = <TData = Common.AttractapServiceUpdateReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: number;
  requestBody: UpdateReaderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: number;
  requestBody: UpdateReaderDto;
}, TContext>({ mutationFn: ({ readerId, requestBody }) => AttractapService.updateReader({ readerId, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Activate or deactivate an NFC card
* @param data The data for the request.
* @param data.id
* @param data.requestBody
* @returns NFCCard The updated NFC card
* @throws ApiError
*/
export const useAttractapServiceToggleCardActive = <TData = Common.AttractapServiceToggleCardActiveMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: NfcCardSetActiveStateDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: NfcCardSetActiveStateDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => AttractapService.toggleCardActive({ id, requestBody }) as unknown as Promise<TData>, ...options });
/**
* Delete a user
* @param data The data for the request.
* @param data.id
* @returns unknown User deleted.
* @throws ApiError
*/
export const useUsersServiceDeleteUser = <TData = Common.UsersServiceDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => UsersService.deleteUser({ id }) as unknown as Promise<TData>, ...options });
/**
* Logout and invalidate the current session
* @returns unknown The session has been deleted
* @throws ApiError
*/
export const useAuthenticationServiceEndSession = <TData = Common.AuthenticationServiceEndSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => AuthenticationService.endSession() as unknown as Promise<TData>, ...options });
/**
* Delete an SSO provider
* @param data The data for the request.
* @param data.id The ID of the SSO provider
* @returns unknown The SSO provider has been deleted
* @throws ApiError
*/
export const useAuthenticationServiceDeleteOneSsoProvider = <TData = Common.AuthenticationServiceDeleteOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => AuthenticationService.deleteOneSsoProvider({ id }) as unknown as Promise<TData>, ...options });
/**
* Remove the metrics API key
* @returns MetricsSettingsDto Metrics API key removed.
* @throws ApiError
*/
export const useSettingsServiceDeleteMetricsApiKey = <TData = Common.SettingsServiceDeleteMetricsApiKeyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SettingsService.deleteMetricsApiKey() as unknown as Promise<TData>, ...options });
/**
* Delete a per-role password policy override
* @param data The data for the request.
* @param data.role
* @returns void Override removed.
* @throws ApiError
*/
export const usePasswordPolicyAdminServiceDeletePasswordPolicyOverride = <TData = Common.PasswordPolicyAdminServiceDeletePasswordPolicyOverrideMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  role: PasswordPolicyRole;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  role: PasswordPolicyRole;
}, TContext>({ mutationFn: ({ role }) => PasswordPolicyAdminService.deletePasswordPolicyOverride({ role }) as unknown as Promise<TData>, ...options });
/**
* Delete a resource
* @param data The data for the request.
* @param data.id
* @returns void The resource has been successfully deleted.
* @throws ApiError
*/
export const useResourcesServiceDeleteOneResource = <TData = Common.ResourcesServiceDeleteOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ResourcesService.deleteOneResource({ id }) as unknown as Promise<TData>, ...options });
/**
* Remove a resource from a resource group
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.resourceId The ID of the resource
* @returns unknown The resource has been successfully removed from the resource group.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsRemoveResource = <TData = Common.ResourcesServiceResourceGroupsRemoveResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ groupId, resourceId }) => ResourcesService.resourceGroupsRemoveResource({ groupId, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Delete a resource group by ID
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @returns unknown The resource group has been successfully deleted.
* @throws ApiError
*/
export const useResourcesServiceResourceGroupsDeleteOne = <TData = Common.ResourcesServiceResourceGroupsDeleteOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
}, TContext>({ mutationFn: ({ groupId }) => ResourcesService.resourceGroupsDeleteOne({ groupId }) as unknown as Promise<TData>, ...options });
/**
* Delete MQTT server
* @param data The data for the request.
* @param data.id
* @returns unknown MQTT server deleted successfully
* @throws ApiError
*/
export const useMqttServiceMqttServersDeleteOne = <TData = Common.MqttServiceMqttServersDeleteOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => MqttService.mqttServersDeleteOne({ id }) as unknown as Promise<TData>, ...options });
/**
* Revoke a user introduction permission for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @returns unknown Introduction permissions revoked
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersRevoke = <TData = Common.AccessControlServiceResourceIntroducersRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ resourceId, userId }) => AccessControlService.resourceIntroducersRevoke({ resourceId, userId }) as unknown as Promise<TData>, ...options });
/**
* Revoke a user usage permission for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @param data.requestBody
* @returns ResourceIntroductionHistoryItem Introduction revoked
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroductionsRevoke = <TData = Common.AccessControlServiceResourceIntroductionsRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, userId }) => AccessControlService.resourceIntroductionsRevoke({ requestBody, resourceId, userId }) as unknown as Promise<TData>, ...options });
/**
* Delete a maintenance schedule
* Delete a maintenance schedule
* @param data The data for the request.
* @param data.resourceId Resource ID
* @param data.scheduleId Schedule ID
* @returns void Schedule deleted
* @throws ApiError
*/
export const useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule = <TData = Common.ResourceMaintenanceSchedulesServiceDeleteMaintenanceScheduleMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
  scheduleId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
  scheduleId: number;
}, TContext>({ mutationFn: ({ resourceId, scheduleId }) => ResourceMaintenanceSchedulesService.deleteMaintenanceSchedule({ resourceId, scheduleId }) as unknown as Promise<TData>, ...options });
/**
* Remove a SumUp reader
* @param data The data for the request.
* @param data.readerId
* @throws ApiError
*/
export const useBillingServiceRemoveSumUpReader = <TData = Common.BillingServiceRemoveSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: string;
}, TContext>({ mutationFn: ({ readerId }) => BillingService.removeSumUpReader({ readerId }) as unknown as Promise<TData>, ...options });
/**
* Delete a flow variable
* @param data The data for the request.
* @param data.resourceId
* @param data.key
* @param data.scope
* @returns void
* @throws ApiError
*/
export const useFlowVariablesServiceDeleteFlowVariable = <TData = Common.FlowVariablesServiceDeleteFlowVariableMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  key: string;
  resourceId: number;
  scope: ResourceFlowVariableScope;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  key: string;
  resourceId: number;
  scope: ResourceFlowVariableScope;
}, TContext>({ mutationFn: ({ key, resourceId, scope }) => FlowVariablesService.deleteFlowVariable({ key, resourceId, scope }) as unknown as Promise<TData>, ...options });
/**
* Clear a health entry (manually mark healthy)
* Deletes a single health state entry. Use this to clear a stuck unhealthy state when the originating flow node was deleted or its identifier changed. Requires maintenance management permission.
* @param data The data for the request.
* @param data.resourceId
* @param data.entryId
* @returns void Entry cleared
* @throws ApiError
*/
export const useResourceHealthServiceClearResourceHealthEntry = <TData = Common.ResourceHealthServiceClearResourceHealthEntryMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  entryId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  entryId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ entryId, resourceId }) => ResourceHealthService.clearResourceHealthEntry({ entryId, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Delete a project
* @param data The data for the request.
* @param data.id
* @returns void The project has been successfully deleted.
* @throws ApiError
*/
export const useProjectsServiceDeleteOneProject = <TData = Common.ProjectsServiceDeleteOneProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ProjectsService.deleteOneProject({ id }) as unknown as Promise<TData>, ...options });
/**
* Remove a project member
* @param data The data for the request.
* @param data.id
* @param data.memberId
* @returns void
* @throws ApiError
*/
export const useProjectsServiceRemoveProjectMember = <TData = Common.ProjectsServiceRemoveProjectMemberMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  memberId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  memberId: number;
}, TContext>({ mutationFn: ({ id, memberId }) => ProjectsService.removeProjectMember({ id, memberId }) as unknown as Promise<TData>, ...options });
/**
* Cancel a project invitation
* @param data The data for the request.
* @param data.id
* @param data.invitationId
* @returns ProjectInvitation
* @throws ApiError
*/
export const useProjectsServiceCancelProjectInvitation = <TData = Common.ProjectsServiceCancelProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>({ mutationFn: ({ id, invitationId }) => ProjectsService.cancelProjectInvitation({ id, invitationId }) as unknown as Promise<TData>, ...options });
/**
* Delete a form
* @param data The data for the request.
* @param data.resourceId
* @param data.formId
* @returns void Form deleted
* @throws ApiError
*/
export const useResourceFormsServiceResourceFormsDelete = <TData = Common.ResourceFormsServiceResourceFormsDeleteMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ formId, resourceId }) => ResourceFormsService.resourceFormsDelete({ formId, resourceId }) as unknown as Promise<TData>, ...options });
/**
* Delete a plugin
* @param data The data for the request.
* @param data.pluginId
* @returns unknown The plugin has been deleted
* @throws ApiError
*/
export const usePluginsServiceDeletePlugin = <TData = Common.PluginsServiceDeletePluginMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  pluginId: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  pluginId: string;
}, TContext>({ mutationFn: ({ pluginId }) => PluginsService.deletePlugin({ pluginId }) as unknown as Promise<TData>, ...options });
/**
* Delete a reader
* @param data The data for the request.
* @param data.readerId The ID of the reader to delete
* @returns unknown Reader deleted successfully
* @throws ApiError
*/
export const useAttractapServiceDeleteReader = <TData = Common.AttractapServiceDeleteReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: number;
}, TContext>({ mutationFn: ({ readerId }) => AttractapService.deleteReader({ readerId }) as unknown as Promise<TData>, ...options });
