// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { type QueryClient } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, EmailTemplatesService, MqttService, PluginsService, ResourceFlowsService, ResourcesService, SystemService, UsersService } from "../requests/services.gen";
import * as Common from "./common";
export const ensureUseSystemServiceInfoData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseSystemServiceInfoKeyFn(), queryFn: () => SystemService.info() });
export const ensureUseUsersServiceFindManyData = (queryClient: QueryClient, { ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}) => queryClient.ensureQueryData({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }), queryFn: () => UsersService.findMany({ ids, limit, page, search }) });
export const ensureUseUsersServiceGetCurrentData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(), queryFn: () => UsersService.getCurrent() });
export const ensureUseUsersServiceGetOneUserByIdData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }), queryFn: () => UsersService.getOneUserById({ id }) });
export const ensureUseUsersServiceGetPermissionsData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }), queryFn: () => UsersService.getPermissions({ id }) });
export const ensureUseUsersServiceGetAllWithPermissionData = (queryClient: QueryClient, { limit, page, permission }: {
  limit?: number;
  page?: number;
  permission?: "canManageResources" | "canManageSystemConfiguration" | "canManageUsers";
} = {}) => queryClient.ensureQueryData({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) });
export const ensureUseAuthenticationServiceRefreshSessionData = (queryClient: QueryClient, { tokenLocation }: {
  tokenLocation: string;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) });
export const ensureUseAuthenticationServiceGetAllSsoProvidersData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(), queryFn: () => AuthenticationService.getAllSsoProviders() });
export const ensureUseAuthenticationServiceGetOneSsoProviderByIdData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) });
export const ensureUseAuthenticationServiceLoginWithOidcData = (queryClient: QueryClient, { providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) });
export const ensureUseAuthenticationServiceOidcLoginCallbackData = (queryClient: QueryClient, { code, iss, providerId, redirectTo, sessionState, state, tokenLocation }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
  tokenLocation: string;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state, tokenLocation }), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state, tokenLocation }) });
export const ensureUseEmailTemplatesServiceEmailTemplateControllerFindAllData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() });
export const ensureUseEmailTemplatesServiceEmailTemplateControllerFindOneData = (queryClient: QueryClient, { type }: {
  type: "verify-email" | "reset-password";
}) => queryClient.ensureQueryData({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) });
export const ensureUseResourcesServiceGetAllResourcesData = (queryClient: QueryClient, { groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
} = {}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) });
export const ensureUseResourcesServiceGetAllResourcesInUseData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(), queryFn: () => ResourcesService.getAllResourcesInUse() });
export const ensureUseResourcesServiceGetOneResourceByIdData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }), queryFn: () => ResourcesService.getOneResourceById({ id }) });
export const ensureUseResourcesServiceSseControllerStreamEventsData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) });
export const ensureUseResourcesServiceResourceGroupsGetManyData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(), queryFn: () => ResourcesService.resourceGroupsGetMany() });
export const ensureUseResourcesServiceResourceGroupsGetOneData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) });
export const ensureUseResourcesServiceResourceUsageGetHistoryData = (queryClient: QueryClient, { limit, page, resourceId, userId }: {
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) });
export const ensureUseResourcesServiceResourceUsageGetActiveSessionData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) });
export const ensureUseResourcesServiceResourceUsageCanControlData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) });
export const ensureUseMqttServiceMqttServersGetAllData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(), queryFn: () => MqttService.mqttServersGetAll() });
export const ensureUseMqttServiceMqttServersGetOneByIdData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }), queryFn: () => MqttService.mqttServersGetOneById({ id }) });
export const ensureUseMqttServiceMqttServersGetStatusOfOneData = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfOneKeyFn({ id }), queryFn: () => MqttService.mqttServersGetStatusOfOne({ id }) });
export const ensureUseMqttServiceMqttServersGetStatusOfAllData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfAllKeyFn(), queryFn: () => MqttService.mqttServersGetStatusOfAll() });
export const ensureUseAccessControlServiceResourceGroupIntroductionsGetManyData = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) });
export const ensureUseAccessControlServiceResourceGroupIntroductionsGetHistoryData = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) });
export const ensureUseAccessControlServiceResourceGroupIntroducersGetManyData = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) });
export const ensureUseAccessControlServiceResourceGroupIntroducersIsIntroducerData = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) });
export const ensureUseAccessControlServiceResourceIntroducersIsIntroducerData = (queryClient: QueryClient, { resourceId, userId }: {
  resourceId: number;
  userId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ resourceId, userId }), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ resourceId, userId }) });
export const ensureUseAccessControlServiceResourceIntroducersGetManyData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId }) });
export const ensureUseAccessControlServiceResourceIntroductionsGetManyData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) });
export const ensureUseAccessControlServiceResourceIntroductionsGetHistoryData = (queryClient: QueryClient, { resourceId, userId }: {
  resourceId: number;
  userId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) });
export const ensureUseResourceFlowsServiceGetResourceFlowData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) });
export const ensureUseResourceFlowsServiceGetResourceFlowLogsData = (queryClient: QueryClient, { limit, page, resourceId }: {
  limit?: number;
  page?: number;
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) });
export const ensureUseResourceFlowsServiceResourceFlowsControllerStreamEventsData = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) });
export const ensureUsePluginsServiceGetPluginsData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(), queryFn: () => PluginsService.getPlugins() });
export const ensureUsePluginsServiceGetFrontendPluginFileData = (queryClient: QueryClient, { filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}) => queryClient.ensureQueryData({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) });
export const ensureUseAttractapServiceGetReaderByIdData = (queryClient: QueryClient, { readerId }: {
  readerId: number;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }), queryFn: () => AttractapService.getReaderById({ readerId }) });
export const ensureUseAttractapServiceGetReadersData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(), queryFn: () => AttractapService.getReaders() });
export const ensureUseAttractapServiceGetAllCardsData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(), queryFn: () => AttractapService.getAllCards() });
export const ensureUseAttractapServiceGetFirmwaresData = (queryClient: QueryClient) => queryClient.ensureQueryData({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(), queryFn: () => AttractapService.getFirmwares() });
export const ensureUseAttractapServiceGetFirmwareBinaryData = (queryClient: QueryClient, { filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) });
export const ensureUseAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeData = (queryClient: QueryClient, { end, start }: {
  end: string;
  start: string;
}) => queryClient.ensureQueryData({ queryKey: Common.UseAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeKeyFn({ end, start }), queryFn: () => AnalyticsService.analyticsControllerGetResourceUsageHoursInDateRange({ end, start }) });
