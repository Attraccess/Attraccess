// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { type QueryClient } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, EmailTemplatesService, LicenseService, MqttService, PluginsService, ResourceFlowsService, ResourceMaintenancesService, ResourcesService, SystemService, UsersService } from "../requests/services.gen";
import * as Common from "./common";
export const prefetchUseSystemServiceInfo = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseSystemServiceInfoKeyFn(), queryFn: () => SystemService.info() });
export const prefetchUseUsersServiceFindMany = (queryClient: QueryClient, { ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }), queryFn: () => UsersService.findMany({ ids, limit, page, search }) });
export const prefetchUseUsersServiceGetCurrent = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(), queryFn: () => UsersService.getCurrent() });
export const prefetchUseUsersServiceGetOneUserById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }), queryFn: () => UsersService.getOneUserById({ id }) });
export const prefetchUseUsersServiceGetPermissions = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }), queryFn: () => UsersService.getPermissions({ id }) });
export const prefetchUseUsersServiceGetAllWithPermission = (queryClient: QueryClient, { limit, page, permission }: {
  limit?: number;
  page?: number;
  permission?: "canManageResources" | "canManageSystemConfiguration" | "canManageUsers";
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) });
export const prefetchUseAuthenticationServiceRefreshSession = (queryClient: QueryClient, { tokenLocation }: {
  tokenLocation: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) });
export const prefetchUseAuthenticationServiceGetAllSsoProviders = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(), queryFn: () => AuthenticationService.getAllSsoProviders() });
export const prefetchUseAuthenticationServiceGetOneSsoProviderById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) });
export const prefetchUseAuthenticationServiceDiscoverAuthentikOidc = (queryClient: QueryClient, { applicationName, host }: {
  applicationName: string;
  host: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceDiscoverAuthentikOidcKeyFn({ applicationName, host }), queryFn: () => AuthenticationService.discoverAuthentikOidc({ applicationName, host }) });
export const prefetchUseAuthenticationServiceDiscoverKeycloakOidc = (queryClient: QueryClient, { host, realm }: {
  host: string;
  realm: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceDiscoverKeycloakOidcKeyFn({ host, realm }), queryFn: () => AuthenticationService.discoverKeycloakOidc({ host, realm }) });
export const prefetchUseAuthenticationServiceLoginWithOidc = (queryClient: QueryClient, { providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) });
export const prefetchUseAuthenticationServiceOidcLoginCallback = (queryClient: QueryClient, { code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state }), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state }) });
export const prefetchUseEmailTemplatesServiceEmailTemplateControllerFindAll = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() });
export const prefetchUseEmailTemplatesServiceEmailTemplateControllerFindOne = (queryClient: QueryClient, { type }: {
  type: "verify-email" | "reset-password" | "username-changed" | "password-changed";
}) => queryClient.prefetchQuery({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) });
export const prefetchUseLicenseServiceGetLicenseInformation = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(), queryFn: () => LicenseService.getLicenseInformation() });
export const prefetchUseResourcesServiceGetAllResources = (queryClient: QueryClient, { groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
} = {}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) });
export const prefetchUseResourcesServiceGetAllResourcesInUse = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(), queryFn: () => ResourcesService.getAllResourcesInUse() });
export const prefetchUseResourcesServiceGetOneResourceById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }), queryFn: () => ResourcesService.getOneResourceById({ id }) });
export const prefetchUseResourcesServiceSseControllerStreamEvents = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) });
export const prefetchUseResourcesServiceResourceGroupsGetMany = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(), queryFn: () => ResourcesService.resourceGroupsGetMany() });
export const prefetchUseResourcesServiceResourceGroupsGetOne = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) });
export const prefetchUseResourcesServiceResourceUsageGetHistory = (queryClient: QueryClient, { limit, page, resourceId, userId }: {
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) });
export const prefetchUseResourcesServiceResourceUsageGetActiveSession = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) });
export const prefetchUseResourcesServiceResourceUsageCanControl = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) });
export const prefetchUseMqttServiceMqttServersGetAll = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(), queryFn: () => MqttService.mqttServersGetAll() });
export const prefetchUseMqttServiceMqttServersGetOneById = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }), queryFn: () => MqttService.mqttServersGetOneById({ id }) });
export const prefetchUseMqttServiceMqttServersGetStatusOfOne = (queryClient: QueryClient, { id }: {
  id: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfOneKeyFn({ id }), queryFn: () => MqttService.mqttServersGetStatusOfOne({ id }) });
export const prefetchUseMqttServiceMqttServersGetStatusOfAll = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseMqttServiceMqttServersGetStatusOfAllKeyFn(), queryFn: () => MqttService.mqttServersGetStatusOfAll() });
export const prefetchUseAccessControlServiceResourceGroupIntroductionsGetMany = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) });
export const prefetchUseAccessControlServiceResourceGroupIntroductionsGetHistory = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) });
export const prefetchUseAccessControlServiceResourceGroupIntroducersGetMany = (queryClient: QueryClient, { groupId }: {
  groupId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) });
export const prefetchUseAccessControlServiceResourceGroupIntroducersIsIntroducer = (queryClient: QueryClient, { groupId, userId }: {
  groupId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) });
export const prefetchUseAccessControlServiceResourceIntroducersIsIntroducer = (queryClient: QueryClient, { includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ includeGroups, resourceId, userId }), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ includeGroups, resourceId, userId }) });
export const prefetchUseAccessControlServiceResourceIntroducersGetMany = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId }) });
export const prefetchUseAccessControlServiceResourceIntroductionsGetMany = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) });
export const prefetchUseAccessControlServiceResourceIntroductionsGetHistory = (queryClient: QueryClient, { resourceId, userId }: {
  resourceId: number;
  userId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) });
export const prefetchUseResourceMaintenancesServiceCanManageMaintenance = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceCanManageMaintenanceKeyFn({ resourceId }), queryFn: () => ResourceMaintenancesService.canManageMaintenance({ resourceId }) });
export const prefetchUseResourceMaintenancesServiceFindMaintenances = (queryClient: QueryClient, { includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean;
  includePast?: boolean;
  includeUpcoming?: boolean;
  limit?: number;
  page?: number;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, page, resourceId }), queryFn: () => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page, resourceId }) });
export const prefetchUseResourceMaintenancesServiceGetMaintenance = (queryClient: QueryClient, { maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceMaintenancesServiceGetMaintenanceKeyFn({ maintenanceId, resourceId }), queryFn: () => ResourceMaintenancesService.getMaintenance({ maintenanceId, resourceId }) });
export const prefetchUseResourceFlowsServiceGetNodeSchemas = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetNodeSchemasKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getNodeSchemas({ resourceId }) });
export const prefetchUseResourceFlowsServiceGetResourceFlow = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) });
export const prefetchUseResourceFlowsServiceGetResourceFlowLogs = (queryClient: QueryClient, { limit, page, resourceId }: {
  limit?: number;
  page?: number;
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) });
export const prefetchUseResourceFlowsServiceResourceFlowsControllerStreamEvents = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) });
export const prefetchUseResourceFlowsServiceGetButtons = (queryClient: QueryClient, { resourceId }: {
  resourceId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseResourceFlowsServiceGetButtonsKeyFn({ resourceId }), queryFn: () => ResourceFlowsService.getButtons({ resourceId }) });
export const prefetchUsePluginsServiceGetPlugins = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(), queryFn: () => PluginsService.getPlugins() });
export const prefetchUsePluginsServiceGetFrontendPluginFile = (queryClient: QueryClient, { filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) });
export const prefetchUseAttractapServiceGetReaderById = (queryClient: QueryClient, { readerId }: {
  readerId: number;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }), queryFn: () => AttractapService.getReaderById({ readerId }) });
export const prefetchUseAttractapServiceGetReaders = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(), queryFn: () => AttractapService.getReaders() });
export const prefetchUseAttractapServiceGetAllCards = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(), queryFn: () => AttractapService.getAllCards() });
export const prefetchUseAttractapServiceGetFirmwares = (queryClient: QueryClient) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(), queryFn: () => AttractapService.getFirmwares() });
export const prefetchUseAttractapServiceGetFirmwareBinary = (queryClient: QueryClient, { filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) });
export const prefetchUseAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRange = (queryClient: QueryClient, { end, start }: {
  end: string;
  start: string;
}) => queryClient.prefetchQuery({ queryKey: Common.UseAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRangeKeyFn({ end, start }), queryFn: () => AnalyticsService.analyticsControllerGetResourceUsageHoursInDateRange({ end, start }) });
