// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { type QueryClient } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, FlowVariablesService, LicenseService, MessagingService, MqttService, PasswordPolicyAdminService, PasswordPolicyService, PluginsService, ProjectInvitationsService, ProjectsService, ResourceFlowsService, ResourceFormsService, ResourceHealthService, ResourceMaintenanceSchedulesService, ResourceMaintenancesService, ResourcesService, SettingsService, SystemService, TwoFactorAuthenticationService, UsersService } from "../requests/services.gen";
import { EmailTemplateType, MaintenanceRequestStatus, PasswordPolicyRole, PermissionFilter, ResourceIntroducerType } from "../requests/types.gen";
import * as Common from "./common";
/**
* Return API information
* @returns unknown API information
* @throws ApiError
*/
export const prefetchUseSystemServiceInfo = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSystemServiceInfoKeyFn(), queryFn: () => SystemService.info() });
/**
* Return the currently running Attraccess version
* @returns VersionInfoDto The currently running version.
* @throws ApiError
*/
export const prefetchUseSystemServiceGetCurrentVersion = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSystemServiceGetCurrentVersionKeyFn(), queryFn: () => SystemService.getCurrentVersion() });
/**
* Check whether a newer Attraccess release is available on GitHub
* Compares the currently running version against the highest stable GitHub release. Results are cached for one hour to avoid hitting the GitHub API rate limit.
* @param data The data for the request.
* @param data.refresh Set to "true" or "1" to bypass the 1-hour server-side cache and re-query GitHub immediately.
* @returns UpdateStatusDto Update availability status.
* @throws ApiError
*/
export const prefetchUseSystemServiceGetUpdateStatus = (queryClient: QueryClient, { refresh }: {
  refresh?: string | undefined;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseSystemServiceGetUpdateStatusKeyFn({ refresh }), queryFn: () => SystemService.getUpdateStatus({ refresh }) });
/**
* Get the local signup domain whitelist
* @returns string The local signup domain whitelist.
* @throws ApiError
*/
export const prefetchUseUsersServiceGetLocalSignupDomainWhitelist = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetLocalSignupDomainWhitelistKeyFn(), queryFn: () => UsersService.getLocalSignupDomainWhitelist() });
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
export const prefetchUseUsersServiceFindMany = (queryClient: QueryClient, { ids, limit, page, search }: {
  ids?: number[] | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  search?: string | undefined;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }), queryFn: () => UsersService.findMany({ ids, limit, page, search }) });
/**
* Check if local signup is enabled
* @returns BooleanDto Local signup is enabled.
* @throws ApiError
*/
export const prefetchUseUsersServiceIsLocalSignupEnabled = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceIsLocalSignupEnabledKeyFn(), queryFn: () => UsersService.isLocalSignupEnabled() });
/**
* Get the current authenticated user
* @returns User The current user.
* @throws ApiError
*/
export const prefetchUseUsersServiceGetCurrent = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(), queryFn: () => UsersService.getCurrent() });
/**
* Get a user by ID
* @param data The data for the request.
* @param data.id
* @returns User The user with the specified ID.
* @throws ApiError
*/
export const prefetchUseUsersServiceGetOneUserById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }), queryFn: () => UsersService.getOneUserById({ id }) });
/**
* Get a user's system permissions
* @param data The data for the request.
* @param data.id
* @returns SystemPermissions The user's permissions.
* @throws ApiError
*/
export const prefetchUseUsersServiceGetPermissions = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }), queryFn: () => UsersService.getPermissions({ id }) });
/**
* Get users with a specific permission
* @param data The data for the request.
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @param data.permission Filter users by permission
* @returns PaginatedUsersResponseDto List of users with the specified permission.
* @throws ApiError
*/
export const prefetchUseUsersServiceGetAllWithPermission = (queryClient: QueryClient, { limit, page, permission }: {
  limit?: number | undefined;
  page?: number | undefined;
  permission?: PermissionFilter | undefined;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) });
/**
* Refresh the current session
* @param data The data for the request.
* @param data.tokenLocation
* @returns CreateSessionResponse The session has been refreshed
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceRefreshSession = (queryClient: QueryClient, { tokenLocation }: {
  tokenLocation: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) });
/**
* Get all SSO providers
* @returns SSOProvider The list of SSO providers
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceGetAllSsoProviders = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(), queryFn: () => AuthenticationService.getAllSsoProviders() });
/**
* Get SSO provider by ID with full configuration
* @param data The data for the request.
* @param data.id The ID of the SSO provider
* @returns SSOProvider The SSO provider with full configuration
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceGetOneSsoProviderById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) });
/**
* Proxy Authentik OIDC well-known discovery
* @param data The data for the request.
* @param data.host Authentik host, e.g. http://localhost:9000
* @param data.applicationName Authentik application slug
* @returns unknown OIDC configuration JSON
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceDiscoverAuthentikOidc = (queryClient: QueryClient, { applicationName, host }: {
  applicationName: string;
  host: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceDiscoverAuthentikOidcKeyFn({ applicationName, host }), queryFn: () => AuthenticationService.discoverAuthentikOidc({ applicationName, host }) });
/**
* Proxy Keycloak OIDC well-known discovery
* @param data The data for the request.
* @param data.host Keycloak host, e.g. http://localhost:8080
* @param data.realm Keycloak realm name
* @returns unknown OIDC configuration JSON
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceDiscoverKeycloakOidc = (queryClient: QueryClient, { host, realm }: {
  host: string;
  realm: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceDiscoverKeycloakOidcKeyFn({ host, realm }), queryFn: () => AuthenticationService.discoverKeycloakOidc({ host, realm }) });
/**
* Login with OIDC
* Login with OIDC and redirect to the callback URL (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.redirectTo The URL to redirect to after login (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
* @returns unknown The user has been logged in
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceLoginWithOidc = (queryClient: QueryClient, { providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) });
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
export const prefetchUseAuthenticationServiceOidcLoginCallback = (queryClient: QueryClient, { code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state }), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state }) });
/**
* Login with SAML
* Initiate a SAML authentication request. Redirect the resulting browser request back to the callback endpoint to mint an API session token.
* @param data The data for the request.
* @param data.providerId The ID of the SSO provider
* @param data.redirectTo URL that should receive the resulting session payload after authentication succeeds.
* @returns unknown SAML authentication initiated
* @throws ApiError
*/
export const prefetchUseAuthenticationServiceLoginWithSaml = (queryClient: QueryClient, { providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceLoginWithSamlKeyFn({ providerId, redirectTo }), queryFn: () => AuthenticationService.loginWithSaml({ providerId, redirectTo }) });
/**
* Get 2FA status for the current user
* @returns TwoFactorStatusDto 2FA status for the current user
* @throws ApiError
*/
export const prefetchUseTwoFactorAuthenticationServiceGetTwoFactorStatus = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorStatusKeyFn(), queryFn: () => TwoFactorAuthenticationService.getTwoFactorStatus() });
/**
* Get the configured 2FA policy
* @returns TwoFactorPolicyDto The configured 2FA policy
* @throws ApiError
*/
export const prefetchUseTwoFactorAuthenticationServiceGetTwoFactorPolicy = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn(), queryFn: () => TwoFactorAuthenticationService.getTwoFactorPolicy() });
/**
* List all email templates
* @returns EmailTemplate List of email templates
* @throws ApiError
*/
export const prefetchUseEmailTemplatesServiceEmailTemplateControllerFindAll = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() });
/**
* Get an email template by type
* @param data The data for the request.
* @param data.type Template type/type
* @returns EmailTemplate Email template found
* @throws ApiError
*/
export const prefetchUseEmailTemplatesServiceEmailTemplateControllerFindOne = (queryClient: QueryClient, { type }: {
  type: EmailTemplateType;
}) => queryClient.prefetchQuery({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) });
/**
* Get system settings
* @returns SystemSettingsDto Current system settings.
* @throws ApiError
*/
export const prefetchUseSettingsServiceGetSystemSettings = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSettingsServiceGetSystemSettingsKeyFn(), queryFn: () => SettingsService.getSystemSettings() });
/**
* Get first-time setup status
* Returns whether first-time setup is available and which wizard steps are already completed. Unauthenticated.
* @returns FirstTimeSetupStatusDto First-time setup status and steps completed.
* @throws ApiError
*/
export const prefetchUseSettingsServiceGetFirstTimeSetupStatus = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSettingsServiceGetFirstTimeSetupStatusKeyFn(), queryFn: () => SettingsService.getFirstTimeSetupStatus() });
/**
* Get metrics settings
* @returns MetricsSettingsDto Current metrics settings.
* @throws ApiError
*/
export const prefetchUseSettingsServiceGetMetricsSettings = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSettingsServiceGetMetricsSettingsKeyFn(), queryFn: () => SettingsService.getMetricsSettings() });
/**
* Get auth rate-limit settings
* @returns AuthRateLimitSettingsDto Current auth rate-limit settings.
* @throws ApiError
*/
export const prefetchUseSettingsServiceGetAuthRateLimitSettings = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSettingsServiceGetAuthRateLimitSettingsKeyFn(), queryFn: () => SettingsService.getAuthRateLimitSettings() });
/**
* Get license information
* @returns LicenseDataDto The current license data.
* @throws ApiError
*/
export const prefetchUseLicenseServiceGetLicenseInformation = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(), queryFn: () => LicenseService.getLicenseInformation() });
/**
* Get the public password policy
* @returns PublicPasswordPolicyDto The currently active public password policy
* @throws ApiError
*/
export const prefetchUsePasswordPolicyServiceGetPublicPasswordPolicy = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UsePasswordPolicyServiceGetPublicPasswordPolicyKeyFn(), queryFn: () => PasswordPolicyService.getPublicPasswordPolicy() });
/**
* Get the global password policy
* @returns PasswordPolicyDto The global password policy.
* @throws ApiError
*/
export const prefetchUsePasswordPolicyAdminServiceGetAdminPasswordPolicy = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn(), queryFn: () => PasswordPolicyAdminService.getAdminPasswordPolicy() });
/**
* List all per-role password policy overrides
* @returns PasswordPolicyOverrideDto All defined overrides.
* @throws ApiError
*/
export const prefetchUsePasswordPolicyAdminServiceListPasswordPolicyOverrides = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn(), queryFn: () => PasswordPolicyAdminService.listPasswordPolicyOverrides() });
/**
* Get the per-role override for a single role
* @param data The data for the request.
* @param data.role
* @returns unknown The override row, or null if unset.
* @throws ApiError
*/
export const prefetchUsePasswordPolicyAdminServiceGetPasswordPolicyOverride = (queryClient: QueryClient, { role }: {
  role: PasswordPolicyRole;
}) => queryClient.prefetchQuery({ queryKey: Common.UsePasswordPolicyAdminServiceGetPasswordPolicyOverrideKeyFn({ role }), queryFn: () => PasswordPolicyAdminService.getPasswordPolicyOverride({ role }) });
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
export const prefetchUseResourcesServiceGetAllResources = (queryClient: QueryClient, { groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number | undefined;
  ids?: number[] | undefined;
  limit?: number | undefined;
  onlyInUseByMe?: boolean | undefined;
  onlyWithPermissions?: boolean | undefined;
  page?: number | undefined;
  search?: string | undefined;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) });
/**
* Get all resources in use
* @returns Resource List of resources in use.
* @throws ApiError
*/
export const prefetchUseResourcesServiceGetAllResourcesInUse = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(), queryFn: () => ResourcesService.getAllResourcesInUse() });
/**
* Get a resource by ID
* @param data The data for the request.
* @param data.id
* @returns Resource The found resource.
* @throws ApiError
*/
export const prefetchUseResourcesServiceGetOneResourceById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }), queryFn: () => ResourcesService.getOneResourceById({ id }) });
/**
* @param data The data for the request.
* @param data.resourceId
* @returns unknown
* @throws ApiError
*/
export const prefetchUseResourcesServiceSseControllerStreamEvents = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) });
/**
* Get many resource groups
* @returns ResourceGroup The resource groups have been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseResourcesServiceResourceGroupsGetMany = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(), queryFn: () => ResourcesService.resourceGroupsGetMany() });
/**
* Get a resource group by ID
* @param data The data for the request.
* @param data.id The ID of the resource group
* @returns ResourceGroup The resource group has been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseResourcesServiceResourceGroupsGetOne = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) });
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
export const prefetchUseResourcesServiceResourceUsageGetHistory = (queryClient: QueryClient, { limit, page, resourceId, userId }: {
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
  userId?: number | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) });
/**
* Get active usage session for current user
* @param data The data for the request.
* @param data.resourceId
* @returns GetActiveUsageSessionDto Active session retrieved successfully.
* @throws ApiError
*/
export const prefetchUseResourcesServiceResourceUsageGetActiveSession = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) });
/**
* Check if the current user can control a resource
* @param data The data for the request.
* @param data.resourceId
* @returns CanControlResponseDto User can control resource
* @throws ApiError
*/
export const prefetchUseResourcesServiceResourceUsageCanControl = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) });
/**
* Get the retraining status of the current user for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns RetrainingStatusResponseDto Retraining status retrieved successfully.
* @throws ApiError
*/
export const prefetchUseResourcesServiceResourceRetrainingGetStatus = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceRetrainingGetStatusKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceRetrainingGetStatus({ resourceId }) });
/**
* Get all MQTT servers
* @returns MqttServer Returns all MQTT servers
* @throws ApiError
*/
export const prefetchUseMqttServiceMqttServersGetAll = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(), queryFn: () => MqttService.mqttServersGetAll() });
/**
* Get MQTT server by ID
* @param data The data for the request.
* @param data.id
* @returns MqttServer Returns the MQTT server with the specified ID
* @throws ApiError
*/
export const prefetchUseMqttServiceMqttServersGetOneById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }), queryFn: () => MqttService.mqttServersGetOneById({ id }) });
/**
* Get many introductions by group ID
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @returns ResourceIntroduction The introductions have been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceGroupIntroductionsGetMany = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) });
/**
* Get history of introductions by group ID and user ID
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @param data.userId The ID of the user
* @returns ResourceIntroductionHistoryItem The history has been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceGroupIntroductionsGetHistory = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) });
/**
* Get all introducers for a resource group
* @param data The data for the request.
* @param data.groupId The ID of the resource group
* @returns ResourceIntroducer The introducers have been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceGroupIntroducersGetMany = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) });
/**
* Check if a user is an introducer for a resource group
* @param data The data for the request.
* @param data.userId The ID of the user
* @param data.groupId The ID of the resource group
* @returns IsResourceGroupIntroducerResponseDto The user is an introducer for the resource group.
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceGroupIntroducersIsIntroducer = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) });
/**
* Check if a user is an introducer for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.userId
* @param data.includeGroups
* @returns IsResourceIntroducerResponseDto User is an introducer for the resource
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceIntroducersIsIntroducer = (queryClient: QueryClient, { includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ includeGroups, resourceId, userId }), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ includeGroups, resourceId, userId }) });
/**
* Get all introducers for a resource
* @param data The data for the request.
* @param data.resourceId
* @param data.type Filter by access type. Omit to return both introducers and maintainers.
* @returns ResourceIntroducer All introducers for a resource
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceIntroducersGetMany = (queryClient: QueryClient, { resourceId, type }: {
  resourceId: number;
  type?: ResourceIntroducerType | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId, type }), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId, type }) });
/**
* Get all introductions for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceIntroduction All introductions for a resource
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceIntroductionsGetMany = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) });
/**
* Get history of introductions by resource ID and user ID
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.userId The ID of the user
* @returns ResourceIntroductionHistoryItem The history has been successfully retrieved.
* @throws ApiError
*/
export const prefetchUseAccessControlServiceResourceIntroductionsGetHistory = (queryClient: QueryClient, { resourceId, userId }: {
  resourceId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) });
/**
* Check if user can manage maintenance
* Check if the authenticated user has permission to manage maintenance for the specified resource
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @returns CanManageMaintenanceResponseDto Permission check completed successfully
* @throws ApiError
*/
export const prefetchUseResourceMaintenancesServiceCanManageMaintenance = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceCanManageMaintenanceKeyFn({ resourceId }), queryFn: () => ResourceMaintenancesService.canManageMaintenance({ resourceId }) });
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
export const prefetchUseResourceMaintenancesServiceFindMaintenances = (queryClient: QueryClient, { includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean | undefined;
  includePast?: boolean | undefined;
  includeUpcoming?: boolean | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, page, resourceId }), queryFn: () => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page, resourceId }) });
/**
* Get a specific maintenance by ID
* Retrieve details of a specific maintenance
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.maintenanceId The ID of the maintenance
* @returns ResourceMaintenance Maintenance retrieved successfully
* @throws ApiError
*/
export const prefetchUseResourceMaintenancesServiceGetMaintenance = (queryClient: QueryClient, { maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceGetMaintenanceKeyFn({ maintenanceId, resourceId }), queryFn: () => ResourceMaintenancesService.getMaintenance({ maintenanceId, resourceId }) });
/**
* List maintenance requests for a resource
* Retrieve paginated maintenance requests. Only maintenance users can call this.
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.page Page number for pagination
* @param data.limit Number of items per page
* @param data.status Filter by request status (defaults to open requests only)
* @returns PaginatedMaintenanceRequestResponse Requests retrieved
* @throws ApiError
*/
export const prefetchUseResourceMaintenancesServiceListMaintenanceRequests = (queryClient: QueryClient, { limit, page, resourceId, status }: {
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
  status?: MaintenanceRequestStatus | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceListMaintenanceRequestsKeyFn({ limit, page, resourceId, status }), queryFn: () => ResourceMaintenancesService.listMaintenanceRequests({ limit, page, resourceId, status }) });
/**
* List maintenance schedules for a resource
* Get all maintenance schedules for the given resource
* @param data The data for the request.
* @param data.resourceId Resource ID
* @returns ResourceMaintenanceSchedule List of schedules
* @throws ApiError
*/
export const prefetchUseResourceMaintenanceSchedulesServiceFindMaintenanceSchedules = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKeyFn({ resourceId }), queryFn: () => ResourceMaintenanceSchedulesService.findMaintenanceSchedules({ resourceId }) });
/**
* Get a maintenance schedule by ID
* Get a single maintenance schedule
* @param data The data for the request.
* @param data.resourceId Resource ID
* @param data.scheduleId Schedule ID
* @returns ResourceMaintenanceSchedule Schedule
* @throws ApiError
*/
export const prefetchUseResourceMaintenanceSchedulesServiceGetMaintenanceSchedule = (queryClient: QueryClient, { resourceId, scheduleId }: {
  resourceId: number;
  scheduleId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenanceSchedulesServiceGetMaintenanceScheduleKeyFn({ resourceId, scheduleId }), queryFn: () => ResourceMaintenanceSchedulesService.getMaintenanceSchedule({ resourceId, scheduleId }) });
/**
* Get the billing balance for a user
* @param data The data for the request.
* @param data.userId
* @returns BalanceDto The billing balance for the user.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetBillingBalance = (queryClient: QueryClient, { userId }: {
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetBillingBalanceKeyFn({ userId }), queryFn: () => BillingService.getBillingBalance({ userId }) });
/**
* Get the billing transactions for a user
* @param data The data for the request.
* @param data.userId
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @returns TransactionsDto The billing transactions for the user.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetBillingTransactions = (queryClient: QueryClient, { limit, page, userId }: {
  limit?: number | undefined;
  page?: number | undefined;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetBillingTransactionsKeyFn({ limit, page, userId }), queryFn: () => BillingService.getBillingTransactions({ limit, page, userId }) });
/**
* Get a billing transaction for a user
* @param data The data for the request.
* @param data.transactionId
* @returns BillingTransaction The billing transaction for the user.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetBillingTransaction = (queryClient: QueryClient, { transactionId }: {
  transactionId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetBillingTransactionKeyFn({ transactionId }), queryFn: () => BillingService.getBillingTransaction({ transactionId }) });
/**
* Get the billing configuration for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceBillingConfigurationDto The billing configuration for the resource.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetResourceBillingConfiguration = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetResourceBillingConfigurationKeyFn({ resourceId }), queryFn: () => BillingService.getResourceBillingConfiguration({ resourceId }) });
/**
* Get the billing configuration
* @returns BillingConfigurationDto The current billing configuration.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetBillingConfiguration = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetBillingConfigurationKeyFn(), queryFn: () => BillingService.getBillingConfiguration() });
/**
* Get the SumUp configuration
* @returns SumUpConfigurationDto The current SumUp configuration.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetSumUpConfiguration = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetSumUpConfigurationKeyFn(), queryFn: () => BillingService.getSumUpConfiguration() });
/**
* Get the linked SumUp readers
* @returns SumUpReaderDto The linked SumUp readers.
* @throws ApiError
*/
export const prefetchUseBillingServiceGetSumUpReaders = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceGetSumUpReadersKeyFn(), queryFn: () => BillingService.getSumUpReaders() });
/**
* @throws ApiError
*/
export const prefetchUseBillingServiceBillingControllerStreamEvents = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseBillingServiceBillingControllerStreamEventsKeyFn(), queryFn: () => BillingService.billingControllerStreamEvents() });
/**
* Get node schemas
* Get the schemas for all node types
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceFlowNodeSchemaDto Node schemas retrieved successfully
* @throws ApiError
*/
export const prefetchUseResourceFlowsServiceGetNodeSchemas = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetNodeSchemasKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getNodeSchemas({ resourceId }) });
/**
* Get resource flow
* Retrieve the complete flow configuration for a resource, including all nodes and edges. This endpoint returns the workflow definition that determines what actions are triggered when resource usage events occur.
* @param data The data for the request.
* @param data.resourceId The ID of the resource to get the flow for
* @returns ResourceFlowResponseDto Resource flow retrieved successfully
* @throws ApiError
*/
export const prefetchUseResourceFlowsServiceGetResourceFlow = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) });
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
export const prefetchUseResourceFlowsServiceGetResourceFlowLogs = (queryClient: QueryClient, { limit, page, resourceId }: {
  limit?: number | undefined;
  page?: number | undefined;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) });
/**
* @param data The data for the request.
* @param data.resourceId
* @returns unknown
* @throws ApiError
*/
export const prefetchUseResourceFlowsServiceResourceFlowsControllerStreamEvents = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) });
/**
* Get buttons
* Get buttons for a resource
* @param data The data for the request.
* @param data.resourceId The ID of the resource to get buttons for
* @returns ResourceFlowNode Buttons retrieved successfully
* @throws ApiError
*/
export const prefetchUseResourceFlowsServiceGetButtons = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetButtonsKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getButtons({ resourceId }) });
/**
* List flow variables for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns FlowVariableDto
* @throws ApiError
*/
export const prefetchUseFlowVariablesServiceListFlowVariables = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseFlowVariablesServiceListFlowVariablesKeyFn({ resourceId }), queryFn: () => FlowVariablesService.listFlowVariables({ resourceId }) });
/**
* Get health summary for a resource
* Returns the current health state for the resource, including any per-source entries (e.g. heartbeat, payload-derived). Resources without any health-related flow nodes are reported as healthy.
* @param data The data for the request.
* @param data.resourceId
* @returns ResourceHealthSummaryDto Health summary
* @throws ApiError
*/
export const prefetchUseResourceHealthServiceGetResourceHealth = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceHealthServiceGetResourceHealthKeyFn({ resourceId }), queryFn: () => ResourceHealthService.getResourceHealth({ resourceId }) });
/**
* Find many projects
* @param data The data for the request.
* @param data.page The page number to retrieve
* @param data.limit The number of items per page to retrieve
* @param data.includeArchived Include archived projects (already finished)
* @returns FindManyProjectsResponseDto The list of projects.
* @throws ApiError
*/
export const prefetchUseProjectsServiceFindManyProjects = (queryClient: QueryClient, { includeArchived, limit, page }: {
  includeArchived?: boolean | undefined;
  limit?: number | undefined;
  page?: number | undefined;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceFindManyProjectsKeyFn({ includeArchived, limit, page }), queryFn: () => ProjectsService.findManyProjects({ includeArchived, limit, page }) });
/**
* Get one project
* @param data The data for the request.
* @param data.id
* @returns ProjectWithAccessDto The project.
* @throws ApiError
*/
export const prefetchUseProjectsServiceFindOneProject = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceFindOneProjectKeyFn({ id }), queryFn: () => ProjectsService.findOneProject({ id }) });
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
export const prefetchUseProjectsServiceGetProjectUsageHistory = (queryClient: QueryClient, { endDate, id, limit, page, startDate }: {
  endDate?: string | undefined;
  id: number;
  limit?: number | undefined;
  page?: number | undefined;
  startDate?: string | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceGetProjectUsageHistoryKeyFn({ endDate, id, limit, page, startDate }), queryFn: () => ProjectsService.getProjectUsageHistory({ endDate, id, limit, page, startDate }) });
/**
* Get aggregated usage statistics for a project
* @param data The data for the request.
* @param data.id
* @param data.startDate Calculate statistics starting from this date (inclusive)
* @param data.endDate Calculate statistics up to this date (inclusive)
* @returns ProjectUsageStatsDto Usage statistics retrieved successfully.
* @throws ApiError
*/
export const prefetchUseProjectsServiceGetProjectUsageStats = (queryClient: QueryClient, { endDate, id, startDate }: {
  endDate?: string | undefined;
  id: number;
  startDate?: string | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceGetProjectUsageStatsKeyFn({ endDate, id, startDate }), queryFn: () => ProjectsService.getProjectUsageStats({ endDate, id, startDate }) });
/**
* List project members
* @param data The data for the request.
* @param data.id
* @returns ProjectMembersResponseDto
* @throws ApiError
*/
export const prefetchUseProjectsServiceListProjectMembers = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceListProjectMembersKeyFn({ id }), queryFn: () => ProjectsService.listProjectMembers({ id }) });
/**
* List project invitations
* @param data The data for the request.
* @param data.id
* @returns ProjectInvitation
* @throws ApiError
*/
export const prefetchUseProjectsServiceListProjectInvitations = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseProjectsServiceListProjectInvitationsKeyFn({ id }), queryFn: () => ProjectsService.listProjectInvitations({ id }) });
/**
* List pending project invitations for the authenticated user
* @returns ProjectInvitation
* @throws ApiError
*/
export const prefetchUseProjectInvitationsServiceListMyProjectInvitations = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseProjectInvitationsServiceListMyProjectInvitationsKeyFn(), queryFn: () => ProjectInvitationsService.listMyProjectInvitations() });
/**
* List forms for a resource
* @param data The data for the request.
* @param data.resourceId
* @returns FormResponseDto
* @throws ApiError
*/
export const prefetchUseResourceFormsServiceResourceFormsList = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }), queryFn: () => ResourceFormsService.resourceFormsList({ resourceId }) });
/**
* Get required forms for a resource action
* @param data The data for the request.
* @param data.resourceId
* @param data.action Usage action the forms are required for
* @returns FormResponseDto
* @throws ApiError
*/
export const prefetchUseResourceFormsServiceResourceFormsGetRequirements = (queryClient: QueryClient, { action, resourceId }: {
  action: "start" | "takeover" | "end";
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFormsServiceResourceFormsGetRequirementsKeyFn({ action, resourceId }), queryFn: () => ResourceFormsService.resourceFormsGetRequirements({ action, resourceId }) });
/**
* Get a form by id
* @param data The data for the request.
* @param data.resourceId
* @param data.formId
* @returns FormResponseDto
* @throws ApiError
*/
export const prefetchUseResourceFormsServiceResourceFormsGetOne = (queryClient: QueryClient, { formId, resourceId }: {
  formId: number;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFormsServiceResourceFormsGetOneKeyFn({ formId, resourceId }), queryFn: () => ResourceFormsService.resourceFormsGetOne({ formId, resourceId }) });
/**
* Get all plugins
* @returns LoadedPluginManifest The list of all plugins
* @throws ApiError
*/
export const prefetchUsePluginsServiceGetPlugins = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(), queryFn: () => PluginsService.getPlugins() });
/**
* Get any frontend plugin file
* @param data The data for the request.
* @param data.pluginName
* @param data.filePath
* @returns string The requested frontend plugin file
* @throws ApiError
*/
export const prefetchUsePluginsServiceGetFrontendPluginFile = (queryClient: QueryClient, { filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) });
/**
* Get a reader by ID
* @param data The data for the request.
* @param data.readerId The ID of the reader to get
* @returns Attractap The reader
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetReaderById = (queryClient: QueryClient, { readerId }: {
  readerId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }), queryFn: () => AttractapService.getReaderById({ readerId }) });
/**
* Get all readers
* @returns Attractap The list of readers
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetReaders = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(), queryFn: () => AttractapService.getReaders() });
/**
* Get crash reports for a reader
* @param data The data for the request.
* @param data.readerId The ID of the reader
* @returns AttractapCrashReport The list of crash reports for the reader, newest first
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetReaderCrashReports = (queryClient: QueryClient, { readerId }: {
  readerId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReaderCrashReportsKeyFn({ readerId }), queryFn: () => AttractapService.getReaderCrashReports({ readerId }) });
/**
* Download the coredump blob of a crash report
* @param data The data for the request.
* @param data.readerId The ID of the reader
* @param data.reportId The ID of the crash report
* @returns unknown The coredump binary blob
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetReaderCrashReportCoredump = (queryClient: QueryClient, { readerId, reportId }: {
  readerId: number;
  reportId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReaderCrashReportCoredumpKeyFn({ readerId, reportId }), queryFn: () => AttractapService.getReaderCrashReportCoredump({ readerId, reportId }) });
/**
* Get all of your cards
* @returns NFCCard The list of all cards
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetAllCards = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(), queryFn: () => AttractapService.getAllCards() });
/**
* Get all firmwares
* @returns AttractapFirmware Firmwares fetched successfully
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetFirmwares = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(), queryFn: () => AttractapService.getFirmwares() });
/**
* Download OTA firmware by name and variant
* @param data The data for the request.
* @param data.firmwareName
* @param data.variantName
* @returns string Firmware streamed successfully
* @throws ApiError
*/
export const prefetchUseAttractapServiceDownloadFirmwareBinary = (queryClient: QueryClient, { firmwareName, variantName }: {
  firmwareName: string;
  variantName: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceDownloadFirmwareBinaryKeyFn({ firmwareName, variantName }), queryFn: () => AttractapService.downloadFirmwareBinary({ firmwareName, variantName }) });
/**
* Get a firmware by name and variant
* @param data The data for the request.
* @param data.firmwareName
* @param data.variantName
* @param data.filename
* @returns string Firmware fetched successfully
* @throws ApiError
*/
export const prefetchUseAttractapServiceGetFirmwareBinary = (queryClient: QueryClient, { filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) });
/**
* Get the resource usage hours in the date range
* @param data The data for the request.
* @param data.start The start date of the range
* @param data.end The end date of the range
* @returns ResourceUsage The resource usage hours in the date range
* @throws ApiError
*/
export const prefetchUseAnalyticsServiceGetResourceUsageHoursInDateRange = (queryClient: QueryClient, { end, start }: {
  end: string;
  start: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAnalyticsServiceGetResourceUsageHoursInDateRangeKeyFn({ end, start }), queryFn: () => AnalyticsService.getResourceUsageHoursInDateRange({ end, start }) });
/**
* Get the billing transactions in the date range
* @param data The data for the request.
* @param data.start The start date of the range
* @param data.end The end date of the range
* @returns BillingTransaction The billing transactions in the date range
* @throws ApiError
*/
export const prefetchUseAnalyticsServiceGetBillingTransactionsInDateRange = (queryClient: QueryClient, { end, start }: {
  end: string;
  start: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAnalyticsServiceGetBillingTransactionsInDateRangeKeyFn({ end, start }), queryFn: () => AnalyticsService.getBillingTransactionsInDateRange({ end, start }) });
/**
* Subscribe to live new messages for the authenticated user
* @throws ApiError
*/
export const prefetchUseMessagingServiceMessagingLive = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMessagingServiceMessagingLiveKeyFn(), queryFn: () => MessagingService.messagingLive() });
/**
* List the authenticated user inbox conversations
* @returns ConversationListItemDto The inbox conversations
* @throws ApiError
*/
export const prefetchUseMessagingServiceMessagingListConversations = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMessagingServiceMessagingListConversationsKeyFn(), queryFn: () => MessagingService.messagingListConversations() });
/**
* Get the total number of unread messages for the authenticated user
* @returns UnreadCountResponseDto The total unread message count
* @throws ApiError
*/
export const prefetchUseMessagingServiceMessagingGetUnreadCount = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMessagingServiceMessagingGetUnreadCountKeyFn(), queryFn: () => MessagingService.messagingGetUnreadCount() });
/**
* List paginated messages of a conversation
* @param data The data for the request.
* @param data.id
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @returns ListMessagesResponseDto The paginated messages
* @throws ApiError
*/
export const prefetchUseMessagingServiceMessagingListMessages = (queryClient: QueryClient, { id, limit, page }: {
  id: number;
  limit?: number | undefined;
  page?: number | undefined;
}) => queryClient.prefetchQuery({ queryKey: Common.UseMessagingServiceMessagingListMessagesKeyFn({ id, limit, page }), queryFn: () => MessagingService.messagingListMessages({ id, limit, page }) });
/**
* Get the authenticated user notification preferences
* @returns NotificationPreferenceDto The notification preferences
* @throws ApiError
*/
export const prefetchUseMessagingServiceMessagingGetNotificationPreferences = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMessagingServiceMessagingGetNotificationPreferencesKeyFn(), queryFn: () => MessagingService.messagingGetNotificationPreferences() });
