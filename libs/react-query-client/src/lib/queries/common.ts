// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { UseQueryResult } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, LicenseService, MqttService, PluginsService, ProjectInvitationsService, ProjectsService, ResourceFlowsService, ResourceFormsService, ResourceMaintenancesService, ResourcesService, SystemService, TwoFactorAuthenticationService, UsersService } from "../requests/services.gen";
import { EmailTemplateType, PermissionFilter } from "../requests/types.gen";
export type SystemServiceInfoDefaultResponse = Awaited<ReturnType<typeof SystemService.info>>;
export type SystemServiceInfoQueryResult<TData = SystemServiceInfoDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useSystemServiceInfoKey = "SystemServiceInfo";
export const UseSystemServiceInfoKeyFn = (queryKey?: Array<unknown>) => [useSystemServiceInfoKey, ...(queryKey ?? [])];
export type UsersServiceGetLocalSignupDomainWhitelistDefaultResponse = Awaited<ReturnType<typeof UsersService.getLocalSignupDomainWhitelist>>;
export type UsersServiceGetLocalSignupDomainWhitelistQueryResult<TData = UsersServiceGetLocalSignupDomainWhitelistDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceGetLocalSignupDomainWhitelistKey = "UsersServiceGetLocalSignupDomainWhitelist";
export const UseUsersServiceGetLocalSignupDomainWhitelistKeyFn = (queryKey?: Array<unknown>) => [useUsersServiceGetLocalSignupDomainWhitelistKey, ...(queryKey ?? [])];
export type UsersServiceFindManyDefaultResponse = Awaited<ReturnType<typeof UsersService.findMany>>;
export type UsersServiceFindManyQueryResult<TData = UsersServiceFindManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceFindManyKey = "UsersServiceFindMany";
export const UseUsersServiceFindManyKeyFn = ({ ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}, queryKey?: Array<unknown>) => [useUsersServiceFindManyKey, ...(queryKey ?? [{ ids, limit, page, search }])];
export type UsersServiceIsLocalSignupEnabledDefaultResponse = Awaited<ReturnType<typeof UsersService.isLocalSignupEnabled>>;
export type UsersServiceIsLocalSignupEnabledQueryResult<TData = UsersServiceIsLocalSignupEnabledDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceIsLocalSignupEnabledKey = "UsersServiceIsLocalSignupEnabled";
export const UseUsersServiceIsLocalSignupEnabledKeyFn = (queryKey?: Array<unknown>) => [useUsersServiceIsLocalSignupEnabledKey, ...(queryKey ?? [])];
export type UsersServiceGetCurrentDefaultResponse = Awaited<ReturnType<typeof UsersService.getCurrent>>;
export type UsersServiceGetCurrentQueryResult<TData = UsersServiceGetCurrentDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceGetCurrentKey = "UsersServiceGetCurrent";
export const UseUsersServiceGetCurrentKeyFn = (queryKey?: Array<unknown>) => [useUsersServiceGetCurrentKey, ...(queryKey ?? [])];
export type UsersServiceGetOneUserByIdDefaultResponse = Awaited<ReturnType<typeof UsersService.getOneUserById>>;
export type UsersServiceGetOneUserByIdQueryResult<TData = UsersServiceGetOneUserByIdDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceGetOneUserByIdKey = "UsersServiceGetOneUserById";
export const UseUsersServiceGetOneUserByIdKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useUsersServiceGetOneUserByIdKey, ...(queryKey ?? [{ id }])];
export type UsersServiceGetPermissionsDefaultResponse = Awaited<ReturnType<typeof UsersService.getPermissions>>;
export type UsersServiceGetPermissionsQueryResult<TData = UsersServiceGetPermissionsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceGetPermissionsKey = "UsersServiceGetPermissions";
export const UseUsersServiceGetPermissionsKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useUsersServiceGetPermissionsKey, ...(queryKey ?? [{ id }])];
export type UsersServiceGetAllWithPermissionDefaultResponse = Awaited<ReturnType<typeof UsersService.getAllWithPermission>>;
export type UsersServiceGetAllWithPermissionQueryResult<TData = UsersServiceGetAllWithPermissionDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useUsersServiceGetAllWithPermissionKey = "UsersServiceGetAllWithPermission";
export const UseUsersServiceGetAllWithPermissionKeyFn = ({ limit, page, permission }: {
  limit?: number;
  page?: number;
  permission?: PermissionFilter;
} = {}, queryKey?: Array<unknown>) => [useUsersServiceGetAllWithPermissionKey, ...(queryKey ?? [{ limit, page, permission }])];
export type AuthenticationServiceRefreshSessionDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.refreshSession>>;
export type AuthenticationServiceRefreshSessionQueryResult<TData = AuthenticationServiceRefreshSessionDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceRefreshSessionKey = "AuthenticationServiceRefreshSession";
export const UseAuthenticationServiceRefreshSessionKeyFn = ({ tokenLocation }: {
  tokenLocation: string;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceRefreshSessionKey, ...(queryKey ?? [{ tokenLocation }])];
export type AuthenticationServiceGetAllSsoProvidersDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.getAllSsoProviders>>;
export type AuthenticationServiceGetAllSsoProvidersQueryResult<TData = AuthenticationServiceGetAllSsoProvidersDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceGetAllSsoProvidersKey = "AuthenticationServiceGetAllSsoProviders";
export const UseAuthenticationServiceGetAllSsoProvidersKeyFn = (queryKey?: Array<unknown>) => [useAuthenticationServiceGetAllSsoProvidersKey, ...(queryKey ?? [])];
export type AuthenticationServiceGetOneSsoProviderByIdDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.getOneSsoProviderById>>;
export type AuthenticationServiceGetOneSsoProviderByIdQueryResult<TData = AuthenticationServiceGetOneSsoProviderByIdDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceGetOneSsoProviderByIdKey = "AuthenticationServiceGetOneSsoProviderById";
export const UseAuthenticationServiceGetOneSsoProviderByIdKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceGetOneSsoProviderByIdKey, ...(queryKey ?? [{ id }])];
export type AuthenticationServiceDiscoverAuthentikOidcDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.discoverAuthentikOidc>>;
export type AuthenticationServiceDiscoverAuthentikOidcQueryResult<TData = AuthenticationServiceDiscoverAuthentikOidcDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceDiscoverAuthentikOidcKey = "AuthenticationServiceDiscoverAuthentikOidc";
export const UseAuthenticationServiceDiscoverAuthentikOidcKeyFn = ({ applicationName, host }: {
  applicationName: string;
  host: string;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceDiscoverAuthentikOidcKey, ...(queryKey ?? [{ applicationName, host }])];
export type AuthenticationServiceDiscoverKeycloakOidcDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.discoverKeycloakOidc>>;
export type AuthenticationServiceDiscoverKeycloakOidcQueryResult<TData = AuthenticationServiceDiscoverKeycloakOidcDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceDiscoverKeycloakOidcKey = "AuthenticationServiceDiscoverKeycloakOidc";
export const UseAuthenticationServiceDiscoverKeycloakOidcKeyFn = ({ host, realm }: {
  host: string;
  realm: string;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceDiscoverKeycloakOidcKey, ...(queryKey ?? [{ host, realm }])];
export type AuthenticationServiceLoginWithOidcDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.loginWithOidc>>;
export type AuthenticationServiceLoginWithOidcQueryResult<TData = AuthenticationServiceLoginWithOidcDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceLoginWithOidcKey = "AuthenticationServiceLoginWithOidc";
export const UseAuthenticationServiceLoginWithOidcKeyFn = ({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceLoginWithOidcKey, ...(queryKey ?? [{ providerId, redirectTo }])];
export type AuthenticationServiceOidcLoginCallbackDefaultResponse = Awaited<ReturnType<typeof AuthenticationService.oidcLoginCallback>>;
export type AuthenticationServiceOidcLoginCallbackQueryResult<TData = AuthenticationServiceOidcLoginCallbackDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAuthenticationServiceOidcLoginCallbackKey = "AuthenticationServiceOidcLoginCallback";
export const UseAuthenticationServiceOidcLoginCallbackKeyFn = ({ code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}, queryKey?: Array<unknown>) => [useAuthenticationServiceOidcLoginCallbackKey, ...(queryKey ?? [{ code, iss, providerId, redirectTo, sessionState, state }])];
export type TwoFactorAuthenticationServiceGetTwoFactorStatusDefaultResponse = Awaited<ReturnType<typeof TwoFactorAuthenticationService.getTwoFactorStatus>>;
export type TwoFactorAuthenticationServiceGetTwoFactorStatusQueryResult<TData = TwoFactorAuthenticationServiceGetTwoFactorStatusDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useTwoFactorAuthenticationServiceGetTwoFactorStatusKey = "TwoFactorAuthenticationServiceGetTwoFactorStatus";
export const UseTwoFactorAuthenticationServiceGetTwoFactorStatusKeyFn = (queryKey?: Array<unknown>) => [useTwoFactorAuthenticationServiceGetTwoFactorStatusKey, ...(queryKey ?? [])];
export type TwoFactorAuthenticationServiceGetTwoFactorPolicyDefaultResponse = Awaited<ReturnType<typeof TwoFactorAuthenticationService.getTwoFactorPolicy>>;
export type TwoFactorAuthenticationServiceGetTwoFactorPolicyQueryResult<TData = TwoFactorAuthenticationServiceGetTwoFactorPolicyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useTwoFactorAuthenticationServiceGetTwoFactorPolicyKey = "TwoFactorAuthenticationServiceGetTwoFactorPolicy";
export const UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn = (queryKey?: Array<unknown>) => [useTwoFactorAuthenticationServiceGetTwoFactorPolicyKey, ...(queryKey ?? [])];
export type EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse = Awaited<ReturnType<typeof EmailTemplatesService.emailTemplateControllerFindAll>>;
export type EmailTemplatesServiceEmailTemplateControllerFindAllQueryResult<TData = EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useEmailTemplatesServiceEmailTemplateControllerFindAllKey = "EmailTemplatesServiceEmailTemplateControllerFindAll";
export const UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn = (queryKey?: Array<unknown>) => [useEmailTemplatesServiceEmailTemplateControllerFindAllKey, ...(queryKey ?? [])];
export type EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse = Awaited<ReturnType<typeof EmailTemplatesService.emailTemplateControllerFindOne>>;
export type EmailTemplatesServiceEmailTemplateControllerFindOneQueryResult<TData = EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useEmailTemplatesServiceEmailTemplateControllerFindOneKey = "EmailTemplatesServiceEmailTemplateControllerFindOne";
export const UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn = ({ type }: {
  type: EmailTemplateType;
}, queryKey?: Array<unknown>) => [useEmailTemplatesServiceEmailTemplateControllerFindOneKey, ...(queryKey ?? [{ type }])];
export type LicenseServiceGetLicenseInformationDefaultResponse = Awaited<ReturnType<typeof LicenseService.getLicenseInformation>>;
export type LicenseServiceGetLicenseInformationQueryResult<TData = LicenseServiceGetLicenseInformationDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useLicenseServiceGetLicenseInformationKey = "LicenseServiceGetLicenseInformation";
export const UseLicenseServiceGetLicenseInformationKeyFn = (queryKey?: Array<unknown>) => [useLicenseServiceGetLicenseInformationKey, ...(queryKey ?? [])];
export type ResourcesServiceGetAllResourcesDefaultResponse = Awaited<ReturnType<typeof ResourcesService.getAllResources>>;
export type ResourcesServiceGetAllResourcesQueryResult<TData = ResourcesServiceGetAllResourcesDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceGetAllResourcesKey = "ResourcesServiceGetAllResources";
export const UseResourcesServiceGetAllResourcesKeyFn = ({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
} = {}, queryKey?: Array<unknown>) => [useResourcesServiceGetAllResourcesKey, ...(queryKey ?? [{ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }])];
export type ResourcesServiceGetAllResourcesInUseDefaultResponse = Awaited<ReturnType<typeof ResourcesService.getAllResourcesInUse>>;
export type ResourcesServiceGetAllResourcesInUseQueryResult<TData = ResourcesServiceGetAllResourcesInUseDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceGetAllResourcesInUseKey = "ResourcesServiceGetAllResourcesInUse";
export const UseResourcesServiceGetAllResourcesInUseKeyFn = (queryKey?: Array<unknown>) => [useResourcesServiceGetAllResourcesInUseKey, ...(queryKey ?? [])];
export type ResourcesServiceGetOneResourceByIdDefaultResponse = Awaited<ReturnType<typeof ResourcesService.getOneResourceById>>;
export type ResourcesServiceGetOneResourceByIdQueryResult<TData = ResourcesServiceGetOneResourceByIdDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceGetOneResourceByIdKey = "ResourcesServiceGetOneResourceById";
export const UseResourcesServiceGetOneResourceByIdKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceGetOneResourceByIdKey, ...(queryKey ?? [{ id }])];
export type ResourcesServiceSseControllerStreamEventsDefaultResponse = Awaited<ReturnType<typeof ResourcesService.sseControllerStreamEvents>>;
export type ResourcesServiceSseControllerStreamEventsQueryResult<TData = ResourcesServiceSseControllerStreamEventsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceSseControllerStreamEventsKey = "ResourcesServiceSseControllerStreamEvents";
export const UseResourcesServiceSseControllerStreamEventsKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceSseControllerStreamEventsKey, ...(queryKey ?? [{ resourceId }])];
export type ResourcesServiceResourceGroupsGetManyDefaultResponse = Awaited<ReturnType<typeof ResourcesService.resourceGroupsGetMany>>;
export type ResourcesServiceResourceGroupsGetManyQueryResult<TData = ResourcesServiceResourceGroupsGetManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceResourceGroupsGetManyKey = "ResourcesServiceResourceGroupsGetMany";
export const UseResourcesServiceResourceGroupsGetManyKeyFn = (queryKey?: Array<unknown>) => [useResourcesServiceResourceGroupsGetManyKey, ...(queryKey ?? [])];
export type ResourcesServiceResourceGroupsGetOneDefaultResponse = Awaited<ReturnType<typeof ResourcesService.resourceGroupsGetOne>>;
export type ResourcesServiceResourceGroupsGetOneQueryResult<TData = ResourcesServiceResourceGroupsGetOneDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceResourceGroupsGetOneKey = "ResourcesServiceResourceGroupsGetOne";
export const UseResourcesServiceResourceGroupsGetOneKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceResourceGroupsGetOneKey, ...(queryKey ?? [{ id }])];
export type ResourcesServiceResourceUsageGetHistoryDefaultResponse = Awaited<ReturnType<typeof ResourcesService.resourceUsageGetHistory>>;
export type ResourcesServiceResourceUsageGetHistoryQueryResult<TData = ResourcesServiceResourceUsageGetHistoryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceResourceUsageGetHistoryKey = "ResourcesServiceResourceUsageGetHistory";
export const UseResourcesServiceResourceUsageGetHistoryKeyFn = ({ limit, page, resourceId, userId }: {
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceResourceUsageGetHistoryKey, ...(queryKey ?? [{ limit, page, resourceId, userId }])];
export type ResourcesServiceResourceUsageGetActiveSessionDefaultResponse = Awaited<ReturnType<typeof ResourcesService.resourceUsageGetActiveSession>>;
export type ResourcesServiceResourceUsageGetActiveSessionQueryResult<TData = ResourcesServiceResourceUsageGetActiveSessionDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceResourceUsageGetActiveSessionKey = "ResourcesServiceResourceUsageGetActiveSession";
export const UseResourcesServiceResourceUsageGetActiveSessionKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceResourceUsageGetActiveSessionKey, ...(queryKey ?? [{ resourceId }])];
export type ResourcesServiceResourceUsageCanControlDefaultResponse = Awaited<ReturnType<typeof ResourcesService.resourceUsageCanControl>>;
export type ResourcesServiceResourceUsageCanControlQueryResult<TData = ResourcesServiceResourceUsageCanControlDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourcesServiceResourceUsageCanControlKey = "ResourcesServiceResourceUsageCanControl";
export const UseResourcesServiceResourceUsageCanControlKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourcesServiceResourceUsageCanControlKey, ...(queryKey ?? [{ resourceId }])];
export type MqttServiceMqttServersGetAllDefaultResponse = Awaited<ReturnType<typeof MqttService.mqttServersGetAll>>;
export type MqttServiceMqttServersGetAllQueryResult<TData = MqttServiceMqttServersGetAllDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useMqttServiceMqttServersGetAllKey = "MqttServiceMqttServersGetAll";
export const UseMqttServiceMqttServersGetAllKeyFn = (queryKey?: Array<unknown>) => [useMqttServiceMqttServersGetAllKey, ...(queryKey ?? [])];
export type MqttServiceMqttServersGetOneByIdDefaultResponse = Awaited<ReturnType<typeof MqttService.mqttServersGetOneById>>;
export type MqttServiceMqttServersGetOneByIdQueryResult<TData = MqttServiceMqttServersGetOneByIdDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useMqttServiceMqttServersGetOneByIdKey = "MqttServiceMqttServersGetOneById";
export const UseMqttServiceMqttServersGetOneByIdKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useMqttServiceMqttServersGetOneByIdKey, ...(queryKey ?? [{ id }])];
export type AccessControlServiceResourceGroupIntroductionsGetManyDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroductionsGetMany>>;
export type AccessControlServiceResourceGroupIntroductionsGetManyQueryResult<TData = AccessControlServiceResourceGroupIntroductionsGetManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceGroupIntroductionsGetManyKey = "AccessControlServiceResourceGroupIntroductionsGetMany";
export const UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn = ({ groupId }: {
  groupId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceGroupIntroductionsGetManyKey, ...(queryKey ?? [{ groupId }])];
export type AccessControlServiceResourceGroupIntroductionsGetHistoryDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroductionsGetHistory>>;
export type AccessControlServiceResourceGroupIntroductionsGetHistoryQueryResult<TData = AccessControlServiceResourceGroupIntroductionsGetHistoryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceGroupIntroductionsGetHistoryKey = "AccessControlServiceResourceGroupIntroductionsGetHistory";
export const UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn = ({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceGroupIntroductionsGetHistoryKey, ...(queryKey ?? [{ groupId, userId }])];
export type AccessControlServiceResourceGroupIntroducersGetManyDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroducersGetMany>>;
export type AccessControlServiceResourceGroupIntroducersGetManyQueryResult<TData = AccessControlServiceResourceGroupIntroducersGetManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceGroupIntroducersGetManyKey = "AccessControlServiceResourceGroupIntroducersGetMany";
export const UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn = ({ groupId }: {
  groupId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceGroupIntroducersGetManyKey, ...(queryKey ?? [{ groupId }])];
export type AccessControlServiceResourceGroupIntroducersIsIntroducerDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroducersIsIntroducer>>;
export type AccessControlServiceResourceGroupIntroducersIsIntroducerQueryResult<TData = AccessControlServiceResourceGroupIntroducersIsIntroducerDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceGroupIntroducersIsIntroducerKey = "AccessControlServiceResourceGroupIntroducersIsIntroducer";
export const UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn = ({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceGroupIntroducersIsIntroducerKey, ...(queryKey ?? [{ groupId, userId }])];
export type AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceIntroducersIsIntroducer>>;
export type AccessControlServiceResourceIntroducersIsIntroducerQueryResult<TData = AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceIntroducersIsIntroducerKey = "AccessControlServiceResourceIntroducersIsIntroducer";
export const UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn = ({ includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceIntroducersIsIntroducerKey, ...(queryKey ?? [{ includeGroups, resourceId, userId }])];
export type AccessControlServiceResourceIntroducersGetManyDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceIntroducersGetMany>>;
export type AccessControlServiceResourceIntroducersGetManyQueryResult<TData = AccessControlServiceResourceIntroducersGetManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceIntroducersGetManyKey = "AccessControlServiceResourceIntroducersGetMany";
export const UseAccessControlServiceResourceIntroducersGetManyKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceIntroducersGetManyKey, ...(queryKey ?? [{ resourceId }])];
export type AccessControlServiceResourceIntroductionsGetManyDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceIntroductionsGetMany>>;
export type AccessControlServiceResourceIntroductionsGetManyQueryResult<TData = AccessControlServiceResourceIntroductionsGetManyDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceIntroductionsGetManyKey = "AccessControlServiceResourceIntroductionsGetMany";
export const UseAccessControlServiceResourceIntroductionsGetManyKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceIntroductionsGetManyKey, ...(queryKey ?? [{ resourceId }])];
export type AccessControlServiceResourceIntroductionsGetHistoryDefaultResponse = Awaited<ReturnType<typeof AccessControlService.resourceIntroductionsGetHistory>>;
export type AccessControlServiceResourceIntroductionsGetHistoryQueryResult<TData = AccessControlServiceResourceIntroductionsGetHistoryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAccessControlServiceResourceIntroductionsGetHistoryKey = "AccessControlServiceResourceIntroductionsGetHistory";
export const UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn = ({ resourceId, userId }: {
  resourceId: number;
  userId: number;
}, queryKey?: Array<unknown>) => [useAccessControlServiceResourceIntroductionsGetHistoryKey, ...(queryKey ?? [{ resourceId, userId }])];
export type ResourceMaintenancesServiceCanManageMaintenanceDefaultResponse = Awaited<ReturnType<typeof ResourceMaintenancesService.canManageMaintenance>>;
export type ResourceMaintenancesServiceCanManageMaintenanceQueryResult<TData = ResourceMaintenancesServiceCanManageMaintenanceDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceMaintenancesServiceCanManageMaintenanceKey = "ResourceMaintenancesServiceCanManageMaintenance";
export const UseResourceMaintenancesServiceCanManageMaintenanceKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceMaintenancesServiceCanManageMaintenanceKey, ...(queryKey ?? [{ resourceId }])];
export type ResourceMaintenancesServiceFindMaintenancesDefaultResponse = Awaited<ReturnType<typeof ResourceMaintenancesService.findMaintenances>>;
export type ResourceMaintenancesServiceFindMaintenancesQueryResult<TData = ResourceMaintenancesServiceFindMaintenancesDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceMaintenancesServiceFindMaintenancesKey = "ResourceMaintenancesServiceFindMaintenances";
export const UseResourceMaintenancesServiceFindMaintenancesKeyFn = ({ includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean;
  includePast?: boolean;
  includeUpcoming?: boolean;
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceMaintenancesServiceFindMaintenancesKey, ...(queryKey ?? [{ includeActive, includePast, includeUpcoming, limit, page, resourceId }])];
export type ResourceMaintenancesServiceGetMaintenanceDefaultResponse = Awaited<ReturnType<typeof ResourceMaintenancesService.getMaintenance>>;
export type ResourceMaintenancesServiceGetMaintenanceQueryResult<TData = ResourceMaintenancesServiceGetMaintenanceDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceMaintenancesServiceGetMaintenanceKey = "ResourceMaintenancesServiceGetMaintenance";
export const UseResourceMaintenancesServiceGetMaintenanceKeyFn = ({ maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceMaintenancesServiceGetMaintenanceKey, ...(queryKey ?? [{ maintenanceId, resourceId }])];
export type BillingServiceGetBillingBalanceDefaultResponse = Awaited<ReturnType<typeof BillingService.getBillingBalance>>;
export type BillingServiceGetBillingBalanceQueryResult<TData = BillingServiceGetBillingBalanceDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetBillingBalanceKey = "BillingServiceGetBillingBalance";
export const UseBillingServiceGetBillingBalanceKeyFn = ({ userId }: {
  userId: number;
}, queryKey?: Array<unknown>) => [useBillingServiceGetBillingBalanceKey, ...(queryKey ?? [{ userId }])];
export type BillingServiceGetBillingTransactionsDefaultResponse = Awaited<ReturnType<typeof BillingService.getBillingTransactions>>;
export type BillingServiceGetBillingTransactionsQueryResult<TData = BillingServiceGetBillingTransactionsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetBillingTransactionsKey = "BillingServiceGetBillingTransactions";
export const UseBillingServiceGetBillingTransactionsKeyFn = ({ limit, page, userId }: {
  limit?: number;
  page?: number;
  userId: number;
}, queryKey?: Array<unknown>) => [useBillingServiceGetBillingTransactionsKey, ...(queryKey ?? [{ limit, page, userId }])];
export type BillingServiceGetBillingTransactionDefaultResponse = Awaited<ReturnType<typeof BillingService.getBillingTransaction>>;
export type BillingServiceGetBillingTransactionQueryResult<TData = BillingServiceGetBillingTransactionDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetBillingTransactionKey = "BillingServiceGetBillingTransaction";
export const UseBillingServiceGetBillingTransactionKeyFn = ({ transactionId }: {
  transactionId: number;
}, queryKey?: Array<unknown>) => [useBillingServiceGetBillingTransactionKey, ...(queryKey ?? [{ transactionId }])];
export type BillingServiceGetResourceBillingConfigurationDefaultResponse = Awaited<ReturnType<typeof BillingService.getResourceBillingConfiguration>>;
export type BillingServiceGetResourceBillingConfigurationQueryResult<TData = BillingServiceGetResourceBillingConfigurationDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetResourceBillingConfigurationKey = "BillingServiceGetResourceBillingConfiguration";
export const UseBillingServiceGetResourceBillingConfigurationKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useBillingServiceGetResourceBillingConfigurationKey, ...(queryKey ?? [{ resourceId }])];
export type BillingServiceGetBillingConfigurationDefaultResponse = Awaited<ReturnType<typeof BillingService.getBillingConfiguration>>;
export type BillingServiceGetBillingConfigurationQueryResult<TData = BillingServiceGetBillingConfigurationDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetBillingConfigurationKey = "BillingServiceGetBillingConfiguration";
export const UseBillingServiceGetBillingConfigurationKeyFn = (queryKey?: Array<unknown>) => [useBillingServiceGetBillingConfigurationKey, ...(queryKey ?? [])];
export type BillingServiceGetSumUpConfigurationDefaultResponse = Awaited<ReturnType<typeof BillingService.getSumUpConfiguration>>;
export type BillingServiceGetSumUpConfigurationQueryResult<TData = BillingServiceGetSumUpConfigurationDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetSumUpConfigurationKey = "BillingServiceGetSumUpConfiguration";
export const UseBillingServiceGetSumUpConfigurationKeyFn = (queryKey?: Array<unknown>) => [useBillingServiceGetSumUpConfigurationKey, ...(queryKey ?? [])];
export type BillingServiceGetSumUpReadersDefaultResponse = Awaited<ReturnType<typeof BillingService.getSumUpReaders>>;
export type BillingServiceGetSumUpReadersQueryResult<TData = BillingServiceGetSumUpReadersDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceGetSumUpReadersKey = "BillingServiceGetSumUpReaders";
export const UseBillingServiceGetSumUpReadersKeyFn = (queryKey?: Array<unknown>) => [useBillingServiceGetSumUpReadersKey, ...(queryKey ?? [])];
export type BillingServiceBillingControllerStreamEventsDefaultResponse = Awaited<ReturnType<typeof BillingService.billingControllerStreamEvents>>;
export type BillingServiceBillingControllerStreamEventsQueryResult<TData = BillingServiceBillingControllerStreamEventsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useBillingServiceBillingControllerStreamEventsKey = "BillingServiceBillingControllerStreamEvents";
export const UseBillingServiceBillingControllerStreamEventsKeyFn = (queryKey?: Array<unknown>) => [useBillingServiceBillingControllerStreamEventsKey, ...(queryKey ?? [])];
export type ResourceFlowsServiceGetNodeSchemasDefaultResponse = Awaited<ReturnType<typeof ResourceFlowsService.getNodeSchemas>>;
export type ResourceFlowsServiceGetNodeSchemasQueryResult<TData = ResourceFlowsServiceGetNodeSchemasDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFlowsServiceGetNodeSchemasKey = "ResourceFlowsServiceGetNodeSchemas";
export const UseResourceFlowsServiceGetNodeSchemasKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFlowsServiceGetNodeSchemasKey, ...(queryKey ?? [{ resourceId }])];
export type ResourceFlowsServiceGetResourceFlowDefaultResponse = Awaited<ReturnType<typeof ResourceFlowsService.getResourceFlow>>;
export type ResourceFlowsServiceGetResourceFlowQueryResult<TData = ResourceFlowsServiceGetResourceFlowDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFlowsServiceGetResourceFlowKey = "ResourceFlowsServiceGetResourceFlow";
export const UseResourceFlowsServiceGetResourceFlowKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFlowsServiceGetResourceFlowKey, ...(queryKey ?? [{ resourceId }])];
export type ResourceFlowsServiceGetResourceFlowLogsDefaultResponse = Awaited<ReturnType<typeof ResourceFlowsService.getResourceFlowLogs>>;
export type ResourceFlowsServiceGetResourceFlowLogsQueryResult<TData = ResourceFlowsServiceGetResourceFlowLogsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFlowsServiceGetResourceFlowLogsKey = "ResourceFlowsServiceGetResourceFlowLogs";
export const UseResourceFlowsServiceGetResourceFlowLogsKeyFn = ({ limit, page, resourceId }: {
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFlowsServiceGetResourceFlowLogsKey, ...(queryKey ?? [{ limit, page, resourceId }])];
export type ResourceFlowsServiceResourceFlowsControllerStreamEventsDefaultResponse = Awaited<ReturnType<typeof ResourceFlowsService.resourceFlowsControllerStreamEvents>>;
export type ResourceFlowsServiceResourceFlowsControllerStreamEventsQueryResult<TData = ResourceFlowsServiceResourceFlowsControllerStreamEventsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFlowsServiceResourceFlowsControllerStreamEventsKey = "ResourceFlowsServiceResourceFlowsControllerStreamEvents";
export const UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFlowsServiceResourceFlowsControllerStreamEventsKey, ...(queryKey ?? [{ resourceId }])];
export type ResourceFlowsServiceGetButtonsDefaultResponse = Awaited<ReturnType<typeof ResourceFlowsService.getButtons>>;
export type ResourceFlowsServiceGetButtonsQueryResult<TData = ResourceFlowsServiceGetButtonsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFlowsServiceGetButtonsKey = "ResourceFlowsServiceGetButtons";
export const UseResourceFlowsServiceGetButtonsKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFlowsServiceGetButtonsKey, ...(queryKey ?? [{ resourceId }])];
export type ProjectsServiceFindManyProjectsDefaultResponse = Awaited<ReturnType<typeof ProjectsService.findManyProjects>>;
export type ProjectsServiceFindManyProjectsQueryResult<TData = ProjectsServiceFindManyProjectsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceFindManyProjectsKey = "ProjectsServiceFindManyProjects";
export const UseProjectsServiceFindManyProjectsKeyFn = ({ limit, page }: {
  limit?: number;
  page?: number;
} = {}, queryKey?: Array<unknown>) => [useProjectsServiceFindManyProjectsKey, ...(queryKey ?? [{ limit, page }])];
export type ProjectsServiceFindOneProjectDefaultResponse = Awaited<ReturnType<typeof ProjectsService.findOneProject>>;
export type ProjectsServiceFindOneProjectQueryResult<TData = ProjectsServiceFindOneProjectDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceFindOneProjectKey = "ProjectsServiceFindOneProject";
export const UseProjectsServiceFindOneProjectKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useProjectsServiceFindOneProjectKey, ...(queryKey ?? [{ id }])];
export type ProjectsServiceGetProjectUsageHistoryDefaultResponse = Awaited<ReturnType<typeof ProjectsService.getProjectUsageHistory>>;
export type ProjectsServiceGetProjectUsageHistoryQueryResult<TData = ProjectsServiceGetProjectUsageHistoryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceGetProjectUsageHistoryKey = "ProjectsServiceGetProjectUsageHistory";
export const UseProjectsServiceGetProjectUsageHistoryKeyFn = ({ endDate, id, limit, page, startDate }: {
  endDate?: string;
  id: number;
  limit?: number;
  page?: number;
  startDate?: string;
}, queryKey?: Array<unknown>) => [useProjectsServiceGetProjectUsageHistoryKey, ...(queryKey ?? [{ endDate, id, limit, page, startDate }])];
export type ProjectsServiceGetProjectUsageStatsDefaultResponse = Awaited<ReturnType<typeof ProjectsService.getProjectUsageStats>>;
export type ProjectsServiceGetProjectUsageStatsQueryResult<TData = ProjectsServiceGetProjectUsageStatsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceGetProjectUsageStatsKey = "ProjectsServiceGetProjectUsageStats";
export const UseProjectsServiceGetProjectUsageStatsKeyFn = ({ endDate, id, startDate }: {
  endDate?: string;
  id: number;
  startDate?: string;
}, queryKey?: Array<unknown>) => [useProjectsServiceGetProjectUsageStatsKey, ...(queryKey ?? [{ endDate, id, startDate }])];
export type ProjectsServiceListProjectMembersDefaultResponse = Awaited<ReturnType<typeof ProjectsService.listProjectMembers>>;
export type ProjectsServiceListProjectMembersQueryResult<TData = ProjectsServiceListProjectMembersDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceListProjectMembersKey = "ProjectsServiceListProjectMembers";
export const UseProjectsServiceListProjectMembersKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useProjectsServiceListProjectMembersKey, ...(queryKey ?? [{ id }])];
export type ProjectsServiceListProjectInvitationsDefaultResponse = Awaited<ReturnType<typeof ProjectsService.listProjectInvitations>>;
export type ProjectsServiceListProjectInvitationsQueryResult<TData = ProjectsServiceListProjectInvitationsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectsServiceListProjectInvitationsKey = "ProjectsServiceListProjectInvitations";
export const UseProjectsServiceListProjectInvitationsKeyFn = ({ id }: {
  id: number;
}, queryKey?: Array<unknown>) => [useProjectsServiceListProjectInvitationsKey, ...(queryKey ?? [{ id }])];
export type ProjectInvitationsServiceListMyProjectInvitationsDefaultResponse = Awaited<ReturnType<typeof ProjectInvitationsService.listMyProjectInvitations>>;
export type ProjectInvitationsServiceListMyProjectInvitationsQueryResult<TData = ProjectInvitationsServiceListMyProjectInvitationsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useProjectInvitationsServiceListMyProjectInvitationsKey = "ProjectInvitationsServiceListMyProjectInvitations";
export const UseProjectInvitationsServiceListMyProjectInvitationsKeyFn = (queryKey?: Array<unknown>) => [useProjectInvitationsServiceListMyProjectInvitationsKey, ...(queryKey ?? [])];
export type ResourceFormsServiceResourceFormsListDefaultResponse = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsList>>;
export type ResourceFormsServiceResourceFormsListQueryResult<TData = ResourceFormsServiceResourceFormsListDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFormsServiceResourceFormsListKey = "ResourceFormsServiceResourceFormsList";
export const UseResourceFormsServiceResourceFormsListKeyFn = ({ resourceId }: {
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFormsServiceResourceFormsListKey, ...(queryKey ?? [{ resourceId }])];
export type ResourceFormsServiceResourceFormsGetRequirementsDefaultResponse = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsGetRequirements>>;
export type ResourceFormsServiceResourceFormsGetRequirementsQueryResult<TData = ResourceFormsServiceResourceFormsGetRequirementsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFormsServiceResourceFormsGetRequirementsKey = "ResourceFormsServiceResourceFormsGetRequirements";
export const UseResourceFormsServiceResourceFormsGetRequirementsKeyFn = ({ action, resourceId }: {
  action: "start" | "takeover" | "end";
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFormsServiceResourceFormsGetRequirementsKey, ...(queryKey ?? [{ action, resourceId }])];
export type ResourceFormsServiceResourceFormsGetOneDefaultResponse = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsGetOne>>;
export type ResourceFormsServiceResourceFormsGetOneQueryResult<TData = ResourceFormsServiceResourceFormsGetOneDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useResourceFormsServiceResourceFormsGetOneKey = "ResourceFormsServiceResourceFormsGetOne";
export const UseResourceFormsServiceResourceFormsGetOneKeyFn = ({ formId, resourceId }: {
  formId: number;
  resourceId: number;
}, queryKey?: Array<unknown>) => [useResourceFormsServiceResourceFormsGetOneKey, ...(queryKey ?? [{ formId, resourceId }])];
export type PluginsServiceGetPluginsDefaultResponse = Awaited<ReturnType<typeof PluginsService.getPlugins>>;
export type PluginsServiceGetPluginsQueryResult<TData = PluginsServiceGetPluginsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const usePluginsServiceGetPluginsKey = "PluginsServiceGetPlugins";
export const UsePluginsServiceGetPluginsKeyFn = (queryKey?: Array<unknown>) => [usePluginsServiceGetPluginsKey, ...(queryKey ?? [])];
export type PluginsServiceGetFrontendPluginFileDefaultResponse = Awaited<ReturnType<typeof PluginsService.getFrontendPluginFile>>;
export type PluginsServiceGetFrontendPluginFileQueryResult<TData = PluginsServiceGetFrontendPluginFileDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const usePluginsServiceGetFrontendPluginFileKey = "PluginsServiceGetFrontendPluginFile";
export const UsePluginsServiceGetFrontendPluginFileKeyFn = ({ filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}, queryKey?: Array<unknown>) => [usePluginsServiceGetFrontendPluginFileKey, ...(queryKey ?? [{ filePath, pluginName }])];
export type AttractapServiceGetReaderByIdDefaultResponse = Awaited<ReturnType<typeof AttractapService.getReaderById>>;
export type AttractapServiceGetReaderByIdQueryResult<TData = AttractapServiceGetReaderByIdDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceGetReaderByIdKey = "AttractapServiceGetReaderById";
export const UseAttractapServiceGetReaderByIdKeyFn = ({ readerId }: {
  readerId: number;
}, queryKey?: Array<unknown>) => [useAttractapServiceGetReaderByIdKey, ...(queryKey ?? [{ readerId }])];
export type AttractapServiceGetReadersDefaultResponse = Awaited<ReturnType<typeof AttractapService.getReaders>>;
export type AttractapServiceGetReadersQueryResult<TData = AttractapServiceGetReadersDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceGetReadersKey = "AttractapServiceGetReaders";
export const UseAttractapServiceGetReadersKeyFn = (queryKey?: Array<unknown>) => [useAttractapServiceGetReadersKey, ...(queryKey ?? [])];
export type AttractapServiceGetAllCardsDefaultResponse = Awaited<ReturnType<typeof AttractapService.getAllCards>>;
export type AttractapServiceGetAllCardsQueryResult<TData = AttractapServiceGetAllCardsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceGetAllCardsKey = "AttractapServiceGetAllCards";
export const UseAttractapServiceGetAllCardsKeyFn = (queryKey?: Array<unknown>) => [useAttractapServiceGetAllCardsKey, ...(queryKey ?? [])];
export type AttractapServiceGetFirmwaresDefaultResponse = Awaited<ReturnType<typeof AttractapService.getFirmwares>>;
export type AttractapServiceGetFirmwaresQueryResult<TData = AttractapServiceGetFirmwaresDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceGetFirmwaresKey = "AttractapServiceGetFirmwares";
export const UseAttractapServiceGetFirmwaresKeyFn = (queryKey?: Array<unknown>) => [useAttractapServiceGetFirmwaresKey, ...(queryKey ?? [])];
export type AttractapServiceDownloadFirmwareBinaryDefaultResponse = Awaited<ReturnType<typeof AttractapService.downloadFirmwareBinary>>;
export type AttractapServiceDownloadFirmwareBinaryQueryResult<TData = AttractapServiceDownloadFirmwareBinaryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceDownloadFirmwareBinaryKey = "AttractapServiceDownloadFirmwareBinary";
export const UseAttractapServiceDownloadFirmwareBinaryKeyFn = ({ firmwareName, variantName }: {
  firmwareName: string;
  variantName: string;
}, queryKey?: Array<unknown>) => [useAttractapServiceDownloadFirmwareBinaryKey, ...(queryKey ?? [{ firmwareName, variantName }])];
export type AttractapServiceGetFirmwareBinaryDefaultResponse = Awaited<ReturnType<typeof AttractapService.getFirmwareBinary>>;
export type AttractapServiceGetFirmwareBinaryQueryResult<TData = AttractapServiceGetFirmwareBinaryDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAttractapServiceGetFirmwareBinaryKey = "AttractapServiceGetFirmwareBinary";
export const UseAttractapServiceGetFirmwareBinaryKeyFn = ({ filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}, queryKey?: Array<unknown>) => [useAttractapServiceGetFirmwareBinaryKey, ...(queryKey ?? [{ filename, firmwareName, variantName }])];
export type AnalyticsServiceGetResourceUsageHoursInDateRangeDefaultResponse = Awaited<ReturnType<typeof AnalyticsService.getResourceUsageHoursInDateRange>>;
export type AnalyticsServiceGetResourceUsageHoursInDateRangeQueryResult<TData = AnalyticsServiceGetResourceUsageHoursInDateRangeDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAnalyticsServiceGetResourceUsageHoursInDateRangeKey = "AnalyticsServiceGetResourceUsageHoursInDateRange";
export const UseAnalyticsServiceGetResourceUsageHoursInDateRangeKeyFn = ({ end, start }: {
  end: string;
  start: string;
}, queryKey?: Array<unknown>) => [useAnalyticsServiceGetResourceUsageHoursInDateRangeKey, ...(queryKey ?? [{ end, start }])];
export type AnalyticsServiceGetBillingTransactionsInDateRangeDefaultResponse = Awaited<ReturnType<typeof AnalyticsService.getBillingTransactionsInDateRange>>;
export type AnalyticsServiceGetBillingTransactionsInDateRangeQueryResult<TData = AnalyticsServiceGetBillingTransactionsInDateRangeDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;
export const useAnalyticsServiceGetBillingTransactionsInDateRangeKey = "AnalyticsServiceGetBillingTransactionsInDateRange";
export const UseAnalyticsServiceGetBillingTransactionsInDateRangeKeyFn = ({ end, start }: {
  end: string;
  start: string;
}, queryKey?: Array<unknown>) => [useAnalyticsServiceGetBillingTransactionsInDateRangeKey, ...(queryKey ?? [{ end, start }])];
export type SystemServiceRebootHostMutationResult = Awaited<ReturnType<typeof SystemService.rebootHost>>;
export type SystemServiceShutdownHostMutationResult = Awaited<ReturnType<typeof SystemService.shutdownHost>>;
export type UsersServiceSetLocalSignupDomainWhitelistMutationResult = Awaited<ReturnType<typeof UsersService.setLocalSignupDomainWhitelist>>;
export type UsersServiceCreateOneUserMutationResult = Awaited<ReturnType<typeof UsersService.createOneUser>>;
export type UsersServiceInviteUserMutationResult = Awaited<ReturnType<typeof UsersService.inviteUser>>;
export type UsersServiceInviteUsersFromCsvMutationResult = Awaited<ReturnType<typeof UsersService.inviteUsersFromCsv>>;
export type UsersServiceVerifyEmailMutationResult = Awaited<ReturnType<typeof UsersService.verifyEmail>>;
export type UsersServiceAcceptInvitationMutationResult = Awaited<ReturnType<typeof UsersService.acceptInvitation>>;
export type UsersServiceRequestPasswordResetMutationResult = Awaited<ReturnType<typeof UsersService.requestPasswordReset>>;
export type UsersServiceChangePasswordViaResetTokenMutationResult = Awaited<ReturnType<typeof UsersService.changePasswordViaResetToken>>;
export type UsersServiceRequestDeleteAccountMutationResult = Awaited<ReturnType<typeof UsersService.requestDeleteAccount>>;
export type UsersServiceConfirmDeleteAccountMutationResult = Awaited<ReturnType<typeof UsersService.confirmDeleteAccount>>;
export type UsersServiceBulkUpdatePermissionsMutationResult = Awaited<ReturnType<typeof UsersService.bulkUpdatePermissions>>;
export type UsersServiceSetUserPasswordMutationResult = Awaited<ReturnType<typeof UsersService.setUserPassword>>;
export type AuthenticationServiceCreateSessionMutationResult = Awaited<ReturnType<typeof AuthenticationService.createSession>>;
export type AuthenticationServiceCreateOneSsoProviderMutationResult = Awaited<ReturnType<typeof AuthenticationService.createOneSsoProvider>>;
export type AuthenticationServiceLinkUserToExternalAccountMutationResult = Awaited<ReturnType<typeof AuthenticationService.linkUserToExternalAccount>>;
export type TwoFactorAuthenticationServiceSetupTwoFactorMutationResult = Awaited<ReturnType<typeof TwoFactorAuthenticationService.setupTwoFactor>>;
export type TwoFactorAuthenticationServiceVerifyTwoFactorMutationResult = Awaited<ReturnType<typeof TwoFactorAuthenticationService.verifyTwoFactor>>;
export type TwoFactorAuthenticationServiceDisableTwoFactorMutationResult = Awaited<ReturnType<typeof TwoFactorAuthenticationService.disableTwoFactor>>;
export type TwoFactorAuthenticationServiceSetTwoFactorPolicyMutationResult = Awaited<ReturnType<typeof TwoFactorAuthenticationService.setTwoFactorPolicy>>;
export type EmailTemplatesServiceEmailTemplateControllerPreviewMjmlMutationResult = Awaited<ReturnType<typeof EmailTemplatesService.emailTemplateControllerPreviewMjml>>;
export type ResourcesServiceCreateOneResourceMutationResult = Awaited<ReturnType<typeof ResourcesService.createOneResource>>;
export type ResourcesServiceResourceGroupsCreateOneMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceGroupsCreateOne>>;
export type ResourcesServiceResourceGroupsAddResourceMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceGroupsAddResource>>;
export type ResourcesServiceResourceUsageStartSessionMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceUsageStartSession>>;
export type ResourcesServiceLockDoorMutationResult = Awaited<ReturnType<typeof ResourcesService.lockDoor>>;
export type ResourcesServiceUnlockDoorMutationResult = Awaited<ReturnType<typeof ResourcesService.unlockDoor>>;
export type ResourcesServiceUnlatchDoorMutationResult = Awaited<ReturnType<typeof ResourcesService.unlatchDoor>>;
export type MqttServiceMqttServersCreateOneMutationResult = Awaited<ReturnType<typeof MqttService.mqttServersCreateOne>>;
export type AccessControlServiceResourceGroupIntroductionsGrantMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroductionsGrant>>;
export type AccessControlServiceResourceGroupIntroductionsRevokeMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroductionsRevoke>>;
export type AccessControlServiceResourceGroupIntroducersGrantMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroducersGrant>>;
export type AccessControlServiceResourceGroupIntroducersRevokeMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceGroupIntroducersRevoke>>;
export type AccessControlServiceResourceIntroducersGrantMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceIntroducersGrant>>;
export type AccessControlServiceResourceIntroductionsGrantMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceIntroductionsGrant>>;
export type ResourceMaintenancesServiceCreateMaintenanceMutationResult = Awaited<ReturnType<typeof ResourceMaintenancesService.createMaintenance>>;
export type BillingServiceCreateManualTransactionMutationResult = Awaited<ReturnType<typeof BillingService.createManualTransaction>>;
export type BillingServiceUpdateResourceBillingConfigurationMutationResult = Awaited<ReturnType<typeof BillingService.updateResourceBillingConfiguration>>;
export type BillingServiceSetSumUpApiKeyMutationResult = Awaited<ReturnType<typeof BillingService.setSumUpApiKey>>;
export type BillingServiceSetBillingConfigurationMutationResult = Awaited<ReturnType<typeof BillingService.setBillingConfiguration>>;
export type BillingServicePairSumUpReaderMutationResult = Awaited<ReturnType<typeof BillingService.pairSumUpReader>>;
export type BillingServiceTopUpWithSumUpReaderMutationResult = Awaited<ReturnType<typeof BillingService.topUpWithSumUpReader>>;
export type BillingServiceSumUpTopUpCallbackMutationResult = Awaited<ReturnType<typeof BillingService.sumUpTopUpCallback>>;
export type BillingServiceRefundTransactionMutationResult = Awaited<ReturnType<typeof BillingService.refundTransaction>>;
export type ResourceFlowsServicePressButtonMutationResult = Awaited<ReturnType<typeof ResourceFlowsService.pressButton>>;
export type ProjectsServiceCreateProjectMutationResult = Awaited<ReturnType<typeof ProjectsService.createProject>>;
export type ProjectsServiceCreateProjectInvitationMutationResult = Awaited<ReturnType<typeof ProjectsService.createProjectInvitation>>;
export type ProjectsServiceResendProjectInvitationMutationResult = Awaited<ReturnType<typeof ProjectsService.resendProjectInvitation>>;
export type ProjectInvitationsServiceAcceptProjectInvitationMutationResult = Awaited<ReturnType<typeof ProjectInvitationsService.acceptProjectInvitation>>;
export type ProjectInvitationsServiceDeclineProjectInvitationMutationResult = Awaited<ReturnType<typeof ProjectInvitationsService.declineProjectInvitation>>;
export type ResourceFormsServiceResourceFormsCreateMutationResult = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsCreate>>;
export type PluginsServiceUploadPluginMutationResult = Awaited<ReturnType<typeof PluginsService.uploadPlugin>>;
export type AttractapServiceEnrollNfcCardMutationResult = Awaited<ReturnType<typeof AttractapService.enrollNfcCard>>;
export type AttractapServiceResetNfcCardMutationResult = Awaited<ReturnType<typeof AttractapService.resetNfcCard>>;
export type AttractapServiceGetAppKeyByUidMutationResult = Awaited<ReturnType<typeof AttractapService.getAppKeyByUid>>;
export type AuthenticationServiceUpdateOneSsoProviderMutationResult = Awaited<ReturnType<typeof AuthenticationService.updateOneSsoProvider>>;
export type ResourcesServiceUpdateOneResourceMutationResult = Awaited<ReturnType<typeof ResourcesService.updateOneResource>>;
export type ResourcesServiceResourceGroupsUpdateOneMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceGroupsUpdateOne>>;
export type ResourcesServiceResourceUsageEndSessionMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceUsageEndSession>>;
export type ResourcesServiceResourceUsageUpdateSessionProjectMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceUsageUpdateSessionProject>>;
export type MqttServiceMqttServersUpdateOneMutationResult = Awaited<ReturnType<typeof MqttService.mqttServersUpdateOne>>;
export type ResourceMaintenancesServiceUpdateMaintenanceMutationResult = Awaited<ReturnType<typeof ResourceMaintenancesService.updateMaintenance>>;
export type ResourceFlowsServiceSaveResourceFlowMutationResult = Awaited<ReturnType<typeof ResourceFlowsService.saveResourceFlow>>;
export type ProjectsServiceUpdateProjectMutationResult = Awaited<ReturnType<typeof ProjectsService.updateProject>>;
export type ResourceFormsServiceResourceFormsUpdateMutationResult = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsUpdate>>;
export type UsersServiceChangeMyUsernameMutationResult = Awaited<ReturnType<typeof UsersService.changeMyUsername>>;
export type UsersServiceUpdatePermissionsMutationResult = Awaited<ReturnType<typeof UsersService.updatePermissions>>;
export type UsersServiceChangeUserUsernameMutationResult = Awaited<ReturnType<typeof UsersService.changeUserUsername>>;
export type UsersServiceChangeUserBillingFactorMutationResult = Awaited<ReturnType<typeof UsersService.changeUserBillingFactor>>;
export type EmailTemplatesServiceEmailTemplateControllerUpdateMutationResult = Awaited<ReturnType<typeof EmailTemplatesService.emailTemplateControllerUpdate>>;
export type AttractapServiceUpdateReaderMutationResult = Awaited<ReturnType<typeof AttractapService.updateReader>>;
export type AttractapServiceToggleCardActiveMutationResult = Awaited<ReturnType<typeof AttractapService.toggleCardActive>>;
export type UsersServiceDeleteUserMutationResult = Awaited<ReturnType<typeof UsersService.deleteUser>>;
export type AuthenticationServiceEndSessionMutationResult = Awaited<ReturnType<typeof AuthenticationService.endSession>>;
export type AuthenticationServiceDeleteOneSsoProviderMutationResult = Awaited<ReturnType<typeof AuthenticationService.deleteOneSsoProvider>>;
export type ResourcesServiceDeleteOneResourceMutationResult = Awaited<ReturnType<typeof ResourcesService.deleteOneResource>>;
export type ResourcesServiceResourceGroupsRemoveResourceMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceGroupsRemoveResource>>;
export type ResourcesServiceResourceGroupsDeleteOneMutationResult = Awaited<ReturnType<typeof ResourcesService.resourceGroupsDeleteOne>>;
export type MqttServiceMqttServersDeleteOneMutationResult = Awaited<ReturnType<typeof MqttService.mqttServersDeleteOne>>;
export type AccessControlServiceResourceIntroducersRevokeMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceIntroducersRevoke>>;
export type AccessControlServiceResourceIntroductionsRevokeMutationResult = Awaited<ReturnType<typeof AccessControlService.resourceIntroductionsRevoke>>;
export type ResourceMaintenancesServiceCancelMaintenanceMutationResult = Awaited<ReturnType<typeof ResourceMaintenancesService.cancelMaintenance>>;
export type BillingServiceRemoveSumUpReaderMutationResult = Awaited<ReturnType<typeof BillingService.removeSumUpReader>>;
export type ProjectsServiceDeleteOneProjectMutationResult = Awaited<ReturnType<typeof ProjectsService.deleteOneProject>>;
export type ProjectsServiceRemoveProjectMemberMutationResult = Awaited<ReturnType<typeof ProjectsService.removeProjectMember>>;
export type ProjectsServiceCancelProjectInvitationMutationResult = Awaited<ReturnType<typeof ProjectsService.cancelProjectInvitation>>;
export type ResourceFormsServiceResourceFormsDeleteMutationResult = Awaited<ReturnType<typeof ResourceFormsService.resourceFormsDelete>>;
export type PluginsServiceDeletePluginMutationResult = Awaited<ReturnType<typeof PluginsService.deletePlugin>>;
export type AttractapServiceDeleteReaderMutationResult = Awaited<ReturnType<typeof AttractapService.deleteReader>>;
