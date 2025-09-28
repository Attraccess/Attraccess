// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { useMutation, UseMutationOptions, useQuery, UseQueryOptions } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, LicenseService, MqttService, PluginsService, ResourceFlowsService, ResourceMaintenancesService, ResourcesService, SystemService, UsersService } from "../requests/services.gen";
import { AppKeyRequestDto, BulkUpdateUserPermissionsDto, ChangePasswordDto, ChangeUsernameDto, CreateMaintenanceDto, CreateMqttServerDto, CreateResourceDto, CreateResourceGroupDto, CreateSSOProviderDto, CreateUserDto, EndUsageSessionDto, EnrollNfcCardDto, LinkUserToExternalAccountRequestDto, ModifyBalanceDto, NfcCardSetActiveStateDto, PairSumUpReaderDto, PreviewMjmlDto, ResetNfcCardDto, ResetPasswordDto, ResourceFlowSaveDto, SetBillingConfigurationDto, SetSumUpApiKeyDto, SetUserPasswordDto, StartUsageSessionDto, SumupTopUpDto, SumupTransactionCallbackDto, UpdateEmailTemplateDto, UpdateMaintenanceDto, UpdateMqttServerDto, UpdateReaderDto, UpdateResourceBillingConfigurationDto, UpdateResourceDto, UpdateResourceGroupDto, UpdateResourceGroupIntroductionDto, UpdateResourceIntroductionDto, UpdateSSOProviderDto, UpdateUserPermissionsDto, UploadPluginDto, VerifyEmailDto } from "../requests/types.gen";
import * as Common from "./common";
/**
* Return API information
* @returns InfoResponseDto API information
* @throws ApiError
*/
export const useSystemServiceGetSystemInfo = <TData = Common.SystemServiceGetSystemInfoDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSystemServiceGetSystemInfoKeyFn(queryKey), queryFn: () => SystemService.getSystemInfo() as TData, ...options });
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
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }, queryKey), queryFn: () => UsersService.findMany({ ids, limit, page, search }) as TData, ...options });
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
* @returns unknown The user's permissions.
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
  limit?: number;
  page?: number;
  permission?: "canManageResources" | "canManageSystemConfiguration" | "canManageUsers";
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
  type: "verify-email" | "reset-password" | "username-changed" | "password-changed";
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }, queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) as TData, ...options });
/**
* Get license information
* @returns LicenseDataDto The current license data.
* @throws ApiError
*/
export const useLicenseServiceGetLicenseInformation = <TData = Common.LicenseServiceGetLicenseInformationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(queryKey), queryFn: () => LicenseService.getLicenseInformation() as TData, ...options });
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
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
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
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
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
* Get MQTT server connection status and statistics
* @param data The data for the request.
* @param data.id
* @returns MqttServerStatusDto MQTT server connection status and statistics
* @throws ApiError
*/
export const useMqttServiceMqttServersGetStatusOfOne = <TData = Common.MqttServiceMqttServersGetStatusOfOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfOneKeyFn({ id }, queryKey), queryFn: () => MqttService.mqttServersGetStatusOfOne({ id }) as TData, ...options });
/**
* Get all MQTT server connection statuses and statistics
* @returns AllMqttServerStatusesDto All MQTT server connection statuses and statistics
* @throws ApiError
*/
export const useMqttServiceMqttServersGetStatusOfAll = <TData = Common.MqttServiceMqttServersGetStatusOfAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfAllKeyFn(queryKey), queryFn: () => MqttService.mqttServersGetStatusOfAll() as TData, ...options });
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
* @returns ResourceIntroducer All introducers for a resource
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersGetMany = <TData = Common.AccessControlServiceResourceIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId }) as TData, ...options });
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
  includeActive?: boolean;
  includePast?: boolean;
  includeUpcoming?: boolean;
  limit?: number;
  page?: number;
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
  limit?: number;
  page?: number;
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
  limit?: number;
  page?: number;
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
  requestBody: { username?: string; password?: string; tokenLocation?: "cookie" | "body"; };
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: { username?: string; password?: string; tokenLocation?: "cookie" | "body"; };
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
* Link an account to an external identifier
* @param data The data for the request.
* @param data.requestBody
* @returns unknown The account has been linked to the external identifier
* @throws ApiError
*/
export const useAuthenticationServiceLinkUserToExternalAccount = <TData = Common.AuthenticationServiceLinkUserToExternalAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.linkUserToExternalAccount({ requestBody }) as unknown as Promise<TData>, ...options });
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
* Test MQTT server connection
* @param data The data for the request.
* @param data.id
* @returns TestConnectionResponseDto Connection test result
* @throws ApiError
*/
export const useMqttServiceMqttServersTestConnection = <TData = Common.MqttServiceMqttServersTestConnectionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => MqttService.mqttServersTestConnection({ id }) as unknown as Promise<TData>, ...options });
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
* @returns unknown The introducer has been successfully granted.
* @throws ApiError
*/
export const useAccessControlServiceResourceGroupIntroducersGrant = <TData = Common.AccessControlServiceResourceGroupIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, userId }) => AccessControlService.resourceGroupIntroducersGrant({ groupId, userId }) as unknown as Promise<TData>, ...options });
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
* @returns ResourceIntroducer Introduction permissions granted
* @throws ApiError
*/
export const useAccessControlServiceResourceIntroducersGrant = <TData = Common.AccessControlServiceResourceIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ resourceId, userId }) => AccessControlService.resourceIntroducersGrant({ resourceId, userId }) as unknown as Promise<TData>, ...options });
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
* Update a maintenance
* Update a maintenance with new start time, end time, and/or reason
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.maintenanceId The ID of the maintenance
* @param data.requestBody
* @returns ResourceMaintenance Maintenance updated successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceUpdateMaintenance = <TData = Common.ResourceMaintenancesServiceUpdateMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  maintenanceId: number;
  requestBody: UpdateMaintenanceDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  maintenanceId: number;
  requestBody: UpdateMaintenanceDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ maintenanceId, requestBody, resourceId }) => ResourceMaintenancesService.updateMaintenance({ maintenanceId, requestBody, resourceId }) as unknown as Promise<TData>, ...options });
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
* Update an email template
* @param data The data for the request.
* @param data.type Template type/type
* @param data.requestBody
* @returns EmailTemplate Template updated successfully
* @throws ApiError
*/
export const useEmailTemplatesServiceEmailTemplateControllerUpdate = <TData = Common.EmailTemplatesServiceEmailTemplateControllerUpdateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: "verify-email" | "reset-password" | "username-changed" | "password-changed";
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: "verify-email" | "reset-password" | "username-changed" | "password-changed";
}, TContext>({ mutationFn: ({ requestBody, type }) => EmailTemplatesService.emailTemplateControllerUpdate({ requestBody, type }) as unknown as Promise<TData>, ...options });
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
* Cancel a maintenance
* Delete a maintenance (cancel it)
* @param data The data for the request.
* @param data.resourceId The ID of the resource
* @param data.maintenanceId The ID of the maintenance
* @returns void Maintenance cancelled successfully
* @throws ApiError
*/
export const useResourceMaintenancesServiceCancelMaintenance = <TData = Common.ResourceMaintenancesServiceCancelMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  maintenanceId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  maintenanceId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ maintenanceId, resourceId }) => ResourceMaintenancesService.cancelMaintenance({ maintenanceId, resourceId }) as unknown as Promise<TData>, ...options });
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
