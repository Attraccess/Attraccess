// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { UseQueryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, LicenseService, MqttService, PluginsService, ProjectInvitationsService, ProjectsService, ResourceFlowsService, ResourceFormsService, ResourceMaintenanceSchedulesService, ResourceMaintenancesService, ResourcesService, SettingsService, SystemService, TwoFactorAuthenticationService, UsersService } from "../requests/services.gen";
import { EmailTemplateType, PermissionFilter } from "../requests/types.gen";
import * as Common from "./common";
export const useSystemServiceInfoSuspense = <TData = Common.SystemServiceInfoDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseSystemServiceInfoKeyFn(queryKey), queryFn: () => SystemService.info() as TData, ...options });
export const useUsersServiceGetLocalSignupDomainWhitelistSuspense = <TData = Common.UsersServiceGetLocalSignupDomainWhitelistDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetLocalSignupDomainWhitelistKeyFn(queryKey), queryFn: () => UsersService.getLocalSignupDomainWhitelist() as TData, ...options });
export const useUsersServiceFindManySuspense = <TData = Common.UsersServiceFindManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }, queryKey), queryFn: () => UsersService.findMany({ ids, limit, page, search }) as TData, ...options });
export const useUsersServiceIsLocalSignupEnabledSuspense = <TData = Common.UsersServiceIsLocalSignupEnabledDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceIsLocalSignupEnabledKeyFn(queryKey), queryFn: () => UsersService.isLocalSignupEnabled() as TData, ...options });
export const useUsersServiceGetCurrentSuspense = <TData = Common.UsersServiceGetCurrentDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(queryKey), queryFn: () => UsersService.getCurrent() as TData, ...options });
export const useUsersServiceGetOneUserByIdSuspense = <TData = Common.UsersServiceGetOneUserByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }, queryKey), queryFn: () => UsersService.getOneUserById({ id }) as TData, ...options });
export const useUsersServiceGetPermissionsSuspense = <TData = Common.UsersServiceGetPermissionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }, queryKey), queryFn: () => UsersService.getPermissions({ id }) as TData, ...options });
export const useUsersServiceGetAllWithPermissionSuspense = <TData = Common.UsersServiceGetAllWithPermissionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, permission }: {
  limit?: number;
  page?: number;
  permission?: PermissionFilter;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }, queryKey), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) as TData, ...options });
export const useAuthenticationServiceRefreshSessionSuspense = <TData = Common.AuthenticationServiceRefreshSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ tokenLocation }: {
  tokenLocation: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }, queryKey), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) as TData, ...options });
export const useAuthenticationServiceGetAllSsoProvidersSuspense = <TData = Common.AuthenticationServiceGetAllSsoProvidersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(queryKey), queryFn: () => AuthenticationService.getAllSsoProviders() as TData, ...options });
export const useAuthenticationServiceGetOneSsoProviderByIdSuspense = <TData = Common.AuthenticationServiceGetOneSsoProviderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }, queryKey), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) as TData, ...options });
export const useAuthenticationServiceDiscoverAuthentikOidcSuspense = <TData = Common.AuthenticationServiceDiscoverAuthentikOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ applicationName, host }: {
  applicationName: string;
  host: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverAuthentikOidcKeyFn({ applicationName, host }, queryKey), queryFn: () => AuthenticationService.discoverAuthentikOidc({ applicationName, host }) as TData, ...options });
export const useAuthenticationServiceDiscoverKeycloakOidcSuspense = <TData = Common.AuthenticationServiceDiscoverKeycloakOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ host, realm }: {
  host: string;
  realm: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverKeycloakOidcKeyFn({ host, realm }, queryKey), queryFn: () => AuthenticationService.discoverKeycloakOidc({ host, realm }) as TData, ...options });
export const useAuthenticationServiceLoginWithOidcSuspense = <TData = Common.AuthenticationServiceLoginWithOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) as TData, ...options });
export const useAuthenticationServiceOidcLoginCallbackSuspense = <TData = Common.AuthenticationServiceOidcLoginCallbackDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state }, queryKey), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state }) as TData, ...options });
export const useAuthenticationServiceLoginWithSamlSuspense = <TData = Common.AuthenticationServiceLoginWithSamlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithSamlKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithSaml({ providerId, redirectTo }) as TData, ...options });
export const useTwoFactorAuthenticationServiceGetTwoFactorStatusSuspense = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorStatusKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorStatus() as TData, ...options });
export const useTwoFactorAuthenticationServiceGetTwoFactorPolicySuspense = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorPolicyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorPolicy() as TData, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerFindAllSuspense = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() as TData, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerFindOneSuspense = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ type }: {
  type: EmailTemplateType;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }, queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) as TData, ...options });
export const useSettingsServiceGetSystemSettingsSuspense = <TData = Common.SettingsServiceGetSystemSettingsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetSystemSettingsKeyFn(queryKey), queryFn: () => SettingsService.getSystemSettings() as TData, ...options });
export const useSettingsServiceGetFirstTimeSetupStatusSuspense = <TData = Common.SettingsServiceGetFirstTimeSetupStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetFirstTimeSetupStatusKeyFn(queryKey), queryFn: () => SettingsService.getFirstTimeSetupStatus() as TData, ...options });
export const useSettingsServiceGetMetricsSettingsSuspense = <TData = Common.SettingsServiceGetMetricsSettingsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseSettingsServiceGetMetricsSettingsKeyFn(queryKey), queryFn: () => SettingsService.getMetricsSettings() as TData, ...options });
export const useLicenseServiceGetLicenseInformationSuspense = <TData = Common.LicenseServiceGetLicenseInformationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(queryKey), queryFn: () => LicenseService.getLicenseInformation() as TData, ...options });
export const useResourcesServiceGetAllResourcesSuspense = <TData = Common.ResourcesServiceGetAllResourcesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }, queryKey), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) as TData, ...options });
export const useResourcesServiceGetAllResourcesInUseSuspense = <TData = Common.ResourcesServiceGetAllResourcesInUseDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(queryKey), queryFn: () => ResourcesService.getAllResourcesInUse() as TData, ...options });
export const useResourcesServiceGetOneResourceByIdSuspense = <TData = Common.ResourcesServiceGetOneResourceByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }, queryKey), queryFn: () => ResourcesService.getOneResourceById({ id }) as TData, ...options });
export const useResourcesServiceSseControllerStreamEventsSuspense = <TData = Common.ResourcesServiceSseControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) as TData, ...options });
export const useResourcesServiceResourceGroupsGetManySuspense = <TData = Common.ResourcesServiceResourceGroupsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(queryKey), queryFn: () => ResourcesService.resourceGroupsGetMany() as TData, ...options });
export const useResourcesServiceResourceGroupsGetOneSuspense = <TData = Common.ResourcesServiceResourceGroupsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }, queryKey), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) as TData, ...options });
export const useResourcesServiceResourceUsageGetHistorySuspense = <TData = Common.ResourcesServiceResourceUsageGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId, userId }: {
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) as TData, ...options });
export const useResourcesServiceResourceUsageGetActiveSessionSuspense = <TData = Common.ResourcesServiceResourceUsageGetActiveSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) as TData, ...options });
export const useResourcesServiceResourceUsageCanControlSuspense = <TData = Common.ResourcesServiceResourceUsageCanControlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) as TData, ...options });
export const useMqttServiceMqttServersGetAllSuspense = <TData = Common.MqttServiceMqttServersGetAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(queryKey), queryFn: () => MqttService.mqttServersGetAll() as TData, ...options });
export const useMqttServiceMqttServersGetOneByIdSuspense = <TData = Common.MqttServiceMqttServersGetOneByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }, queryKey), queryFn: () => MqttService.mqttServersGetOneById({ id }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroductionsGetManySuspense = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroductionsGetHistorySuspense = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroducersGetManySuspense = <TData = Common.AccessControlServiceResourceGroupIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroducersIsIntroducerSuspense = <TData = Common.AccessControlServiceResourceGroupIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) as TData, ...options });
export const useAccessControlServiceResourceIntroducersIsIntroducerSuspense = <TData = Common.AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ includeGroups, resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ includeGroups, resourceId, userId }) as TData, ...options });
export const useAccessControlServiceResourceIntroducersGetManySuspense = <TData = Common.AccessControlServiceResourceIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId }) as TData, ...options });
export const useAccessControlServiceResourceIntroductionsGetManySuspense = <TData = Common.AccessControlServiceResourceIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) as TData, ...options });
export const useAccessControlServiceResourceIntroductionsGetHistorySuspense = <TData = Common.AccessControlServiceResourceIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, userId }: {
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) as TData, ...options });
export const useResourceMaintenancesServiceCanManageMaintenanceSuspense = <TData = Common.ResourceMaintenancesServiceCanManageMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceCanManageMaintenanceKeyFn({ resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.canManageMaintenance({ resourceId }) as TData, ...options });
export const useResourceMaintenancesServiceFindMaintenancesSuspense = <TData = Common.ResourceMaintenancesServiceFindMaintenancesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean;
  includePast?: boolean;
  includeUpcoming?: boolean;
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, page, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page, resourceId }) as TData, ...options });
export const useResourceMaintenancesServiceGetMaintenanceSuspense = <TData = Common.ResourceMaintenancesServiceGetMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceGetMaintenanceKeyFn({ maintenanceId, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.getMaintenance({ maintenanceId, resourceId }) as TData, ...options });
export const useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesSuspense = <TData = Common.ResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKeyFn({ resourceId }, queryKey), queryFn: () => ResourceMaintenanceSchedulesService.findMaintenanceSchedules({ resourceId }) as TData, ...options });
export const useResourceMaintenanceSchedulesServiceGetMaintenanceScheduleSuspense = <TData = Common.ResourceMaintenanceSchedulesServiceGetMaintenanceScheduleDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, scheduleId }: {
  resourceId: number;
  scheduleId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceMaintenanceSchedulesServiceGetMaintenanceScheduleKeyFn({ resourceId, scheduleId }, queryKey), queryFn: () => ResourceMaintenanceSchedulesService.getMaintenanceSchedule({ resourceId, scheduleId }) as TData, ...options });
export const useBillingServiceGetBillingBalanceSuspense = <TData = Common.BillingServiceGetBillingBalanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ userId }: {
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingBalanceKeyFn({ userId }, queryKey), queryFn: () => BillingService.getBillingBalance({ userId }) as TData, ...options });
export const useBillingServiceGetBillingTransactionsSuspense = <TData = Common.BillingServiceGetBillingTransactionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, userId }: {
  limit?: number;
  page?: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionsKeyFn({ limit, page, userId }, queryKey), queryFn: () => BillingService.getBillingTransactions({ limit, page, userId }) as TData, ...options });
export const useBillingServiceGetBillingTransactionSuspense = <TData = Common.BillingServiceGetBillingTransactionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ transactionId }: {
  transactionId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionKeyFn({ transactionId }, queryKey), queryFn: () => BillingService.getBillingTransaction({ transactionId }) as TData, ...options });
export const useBillingServiceGetResourceBillingConfigurationSuspense = <TData = Common.BillingServiceGetResourceBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetResourceBillingConfigurationKeyFn({ resourceId }, queryKey), queryFn: () => BillingService.getResourceBillingConfiguration({ resourceId }) as TData, ...options });
export const useBillingServiceGetBillingConfigurationSuspense = <TData = Common.BillingServiceGetBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingConfigurationKeyFn(queryKey), queryFn: () => BillingService.getBillingConfiguration() as TData, ...options });
export const useBillingServiceGetSumUpConfigurationSuspense = <TData = Common.BillingServiceGetSumUpConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpConfigurationKeyFn(queryKey), queryFn: () => BillingService.getSumUpConfiguration() as TData, ...options });
export const useBillingServiceGetSumUpReadersSuspense = <TData = Common.BillingServiceGetSumUpReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpReadersKeyFn(queryKey), queryFn: () => BillingService.getSumUpReaders() as TData, ...options });
export const useBillingServiceBillingControllerStreamEventsSuspense = <TData = Common.BillingServiceBillingControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseBillingServiceBillingControllerStreamEventsKeyFn(queryKey), queryFn: () => BillingService.billingControllerStreamEvents() as TData, ...options });
export const useResourceFlowsServiceGetNodeSchemasSuspense = <TData = Common.ResourceFlowsServiceGetNodeSchemasDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetNodeSchemasKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getNodeSchemas({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetResourceFlowSuspense = <TData = Common.ResourceFlowsServiceGetResourceFlowDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetResourceFlowLogsSuspense = <TData = Common.ResourceFlowsServiceGetResourceFlowLogsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId }: {
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) as TData, ...options });
export const useResourceFlowsServiceResourceFlowsControllerStreamEventsSuspense = <TData = Common.ResourceFlowsServiceResourceFlowsControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetButtonsSuspense = <TData = Common.ResourceFlowsServiceGetButtonsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetButtonsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getButtons({ resourceId }) as TData, ...options });
export const useProjectsServiceFindManyProjectsSuspense = <TData = Common.ProjectsServiceFindManyProjectsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeArchived, limit, page }: {
  includeArchived?: boolean;
  limit?: number;
  page?: number;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindManyProjectsKeyFn({ includeArchived, limit, page }, queryKey), queryFn: () => ProjectsService.findManyProjects({ includeArchived, limit, page }) as TData, ...options });
export const useProjectsServiceFindOneProjectSuspense = <TData = Common.ProjectsServiceFindOneProjectDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindOneProjectKeyFn({ id }, queryKey), queryFn: () => ProjectsService.findOneProject({ id }) as TData, ...options });
export const useProjectsServiceGetProjectUsageHistorySuspense = <TData = Common.ProjectsServiceGetProjectUsageHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, limit, page, startDate }: {
  endDate?: string;
  id: number;
  limit?: number;
  page?: number;
  startDate?: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageHistoryKeyFn({ endDate, id, limit, page, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageHistory({ endDate, id, limit, page, startDate }) as TData, ...options });
export const useProjectsServiceGetProjectUsageStatsSuspense = <TData = Common.ProjectsServiceGetProjectUsageStatsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, startDate }: {
  endDate?: string;
  id: number;
  startDate?: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageStatsKeyFn({ endDate, id, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageStats({ endDate, id, startDate }) as TData, ...options });
export const useProjectsServiceListProjectMembersSuspense = <TData = Common.ProjectsServiceListProjectMembersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectMembersKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectMembers({ id }) as TData, ...options });
export const useProjectsServiceListProjectInvitationsSuspense = <TData = Common.ProjectsServiceListProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectInvitationsKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectInvitations({ id }) as TData, ...options });
export const useProjectInvitationsServiceListMyProjectInvitationsSuspense = <TData = Common.ProjectInvitationsServiceListMyProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseProjectInvitationsServiceListMyProjectInvitationsKeyFn(queryKey), queryFn: () => ProjectInvitationsService.listMyProjectInvitations() as TData, ...options });
export const useResourceFormsServiceResourceFormsListSuspense = <TData = Common.ResourceFormsServiceResourceFormsListDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsList({ resourceId }) as TData, ...options });
export const useResourceFormsServiceResourceFormsGetRequirementsSuspense = <TData = Common.ResourceFormsServiceResourceFormsGetRequirementsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ action, resourceId }: {
  action: "start" | "takeover" | "end";
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetRequirementsKeyFn({ action, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetRequirements({ action, resourceId }) as TData, ...options });
export const useResourceFormsServiceResourceFormsGetOneSuspense = <TData = Common.ResourceFormsServiceResourceFormsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ formId, resourceId }: {
  formId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetOneKeyFn({ formId, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetOne({ formId, resourceId }) as TData, ...options });
export const usePluginsServiceGetPluginsSuspense = <TData = Common.PluginsServiceGetPluginsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(queryKey), queryFn: () => PluginsService.getPlugins() as TData, ...options });
export const usePluginsServiceGetFrontendPluginFileSuspense = <TData = Common.PluginsServiceGetFrontendPluginFileDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }, queryKey), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) as TData, ...options });
export const useAttractapServiceGetReaderByIdSuspense = <TData = Common.AttractapServiceGetReaderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ readerId }: {
  readerId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }, queryKey), queryFn: () => AttractapService.getReaderById({ readerId }) as TData, ...options });
export const useAttractapServiceGetReadersSuspense = <TData = Common.AttractapServiceGetReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(queryKey), queryFn: () => AttractapService.getReaders() as TData, ...options });
export const useAttractapServiceGetAllCardsSuspense = <TData = Common.AttractapServiceGetAllCardsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(queryKey), queryFn: () => AttractapService.getAllCards() as TData, ...options });
export const useAttractapServiceGetFirmwaresSuspense = <TData = Common.AttractapServiceGetFirmwaresDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(queryKey), queryFn: () => AttractapService.getFirmwares() as TData, ...options });
export const useAttractapServiceDownloadFirmwareBinarySuspense = <TData = Common.AttractapServiceDownloadFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ firmwareName, variantName }: {
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceDownloadFirmwareBinaryKeyFn({ firmwareName, variantName }, queryKey), queryFn: () => AttractapService.downloadFirmwareBinary({ firmwareName, variantName }) as TData, ...options });
export const useAttractapServiceGetFirmwareBinarySuspense = <TData = Common.AttractapServiceGetFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }, queryKey), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) as TData, ...options });
export const useAnalyticsServiceGetResourceUsageHoursInDateRangeSuspense = <TData = Common.AnalyticsServiceGetResourceUsageHoursInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetResourceUsageHoursInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getResourceUsageHoursInDateRange({ end, start }) as TData, ...options });
export const useAnalyticsServiceGetBillingTransactionsInDateRangeSuspense = <TData = Common.AnalyticsServiceGetBillingTransactionsInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetBillingTransactionsInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getBillingTransactionsInDateRange({ end, start }) as TData, ...options });
