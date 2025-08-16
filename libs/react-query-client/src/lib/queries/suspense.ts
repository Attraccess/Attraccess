// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { UseQueryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, EmailTemplatesService, LicenseService, MqttService, PluginsService, ResourceFlowsService, ResourceMaintenancesService, ResourcesService, SystemService, UsersService } from "../requests/services.gen";
import * as Common from "./common";
export const useSystemServiceInfoSuspense = <TData = Common.SystemServiceInfoDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseSystemServiceInfoKeyFn(queryKey), queryFn: () => SystemService.info() as TData, ...options });
export const useUsersServiceFindManySuspense = <TData = Common.UsersServiceFindManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }, queryKey), queryFn: () => UsersService.findMany({ ids, limit, page, search }) as TData, ...options });
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
  permission?: "canManageResources" | "canManageSystemConfiguration" | "canManageUsers";
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
export const useEmailTemplatesServiceEmailTemplateControllerFindAllSuspense = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() as TData, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerFindOneSuspense = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ type }: {
  type: "verify-email" | "reset-password" | "username-changed" | "password-changed";
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }, queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) as TData, ...options });
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
export const useMqttServiceMqttServersGetStatusOfOneSuspense = <TData = Common.MqttServiceMqttServersGetStatusOfOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfOneKeyFn({ id }, queryKey), queryFn: () => MqttService.mqttServersGetStatusOfOne({ id }) as TData, ...options });
export const useMqttServiceMqttServersGetStatusOfAllSuspense = <TData = Common.MqttServiceMqttServersGetStatusOfAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfAllKeyFn(queryKey), queryFn: () => MqttService.mqttServersGetStatusOfAll() as TData, ...options });
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
export const useAccessControlServiceResourceIntroducersIsIntroducerSuspense = <TData = Common.AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, userId }: {
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ resourceId, userId }) as TData, ...options });
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
export const useAttractapServiceGetFirmwareBinarySuspense = <TData = Common.AttractapServiceGetFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }, queryKey), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) as TData, ...options });
export const useAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeSuspense = <TData = Common.AnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useSuspenseQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.analyticsControllerGetResourceUsageHoursInDateRange({ end, start }) as TData, ...options });
