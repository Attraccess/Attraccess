// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { UseMutationOptions, UseQueryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { AccessControlService, AnalyticsService, AttractapService, AuthenticationService, BillingService, EmailTemplatesService, LicenseService, MqttService, PluginsService, PositionalTrackingService, ProjectInvitationsService, ProjectsService, ResourceFlowsService, ResourceFormsService, ResourceMaintenancesService, ResourcesService, SystemService, TwoFactorAuthenticationService, UsersService } from "../requests/services.gen";
import { AcceptInvitationDto, AppKeyRequestDto, BulkUpdateUserPermissionsDto, ChangeBillingFactorDto, ChangeEmailDto, ChangePasswordDto, ChangeUsernameDto, CreateFormDto, CreateMaintenanceDto, CreateMqttServerDto, CreateProjectDto, CreateProjectInvitationDto, CreateResourceDto, CreateResourceGroupDto, CreateSSOProviderDto, CreateUserDto, CsvInviteUploadDto, DeleteAccountConfirmDto, EmailTemplateType, EndUsageSessionDto, EnrollNfcCardDto, InviteUserDto, LinkUserToExternalAccountRequestDto, ModifyBalanceDto, NfcCardSetActiveStateDto, PairSumUpReaderDto, PermissionFilter, PreviewMjmlDto, RefundTransactionDto, ResetNfcCardDto, ResetPasswordDto, ResourceFlowSaveDto, SSOProvisioningPermissionsDto, SSOProvisioningUserDto, SetBillingConfigurationDto, SetSumUpApiKeyDto, SetUserPasswordDto, StartUsageSessionDto, SumupTopUpDto, SumupTransactionCallbackDto, TwoFactorCodeDto, TwoFactorPolicyDto, UpdateEmailTemplateDto, UpdateFormDto, UpdateMaintenanceDto, UpdateMqttServerDto, UpdateProjectDto, UpdateReaderDto, UpdateResourceBillingConfigurationDto, UpdateResourceDto, UpdateResourceGroupDto, UpdateResourceGroupIntroductionDto, UpdateResourceIntroductionDto, UpdateSSOProviderDto, UpdateUsageSessionProjectDto, UpdateUserPermissionsDto, UploadPluginDto, VerifyEmailDto } from "../requests/types.gen";
import * as Common from "./common";
export const useSystemServiceInfo = <TData = Common.SystemServiceInfoDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseSystemServiceInfoKeyFn(queryKey), queryFn: () => SystemService.info() as TData, ...options });
export const useUsersServiceGetLocalSignupDomainWhitelist = <TData = Common.UsersServiceGetLocalSignupDomainWhitelistDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetLocalSignupDomainWhitelistKeyFn(queryKey), queryFn: () => UsersService.getLocalSignupDomainWhitelist() as TData, ...options });
export const useUsersServiceFindMany = <TData = Common.UsersServiceFindManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, page, search }: {
  ids?: number[];
  limit?: number;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, page, search }, queryKey), queryFn: () => UsersService.findMany({ ids, limit, page, search }) as TData, ...options });
export const useUsersServiceIsLocalSignupEnabled = <TData = Common.UsersServiceIsLocalSignupEnabledDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceIsLocalSignupEnabledKeyFn(queryKey), queryFn: () => UsersService.isLocalSignupEnabled() as TData, ...options });
export const useUsersServiceGetCurrent = <TData = Common.UsersServiceGetCurrentDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetCurrentKeyFn(queryKey), queryFn: () => UsersService.getCurrent() as TData, ...options });
export const useUsersServiceGetOneUserById = <TData = Common.UsersServiceGetOneUserByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetOneUserByIdKeyFn({ id }, queryKey), queryFn: () => UsersService.getOneUserById({ id }) as TData, ...options });
export const useUsersServiceGetPermissions = <TData = Common.UsersServiceGetPermissionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetPermissionsKeyFn({ id }, queryKey), queryFn: () => UsersService.getPermissions({ id }) as TData, ...options });
export const useUsersServiceGetAllWithPermission = <TData = Common.UsersServiceGetAllWithPermissionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, permission }: {
  limit?: number;
  page?: number;
  permission?: PermissionFilter;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, page, permission }, queryKey), queryFn: () => UsersService.getAllWithPermission({ limit, page, permission }) as TData, ...options });
export const useAuthenticationServiceRefreshSession = <TData = Common.AuthenticationServiceRefreshSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ tokenLocation }: {
  tokenLocation: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceRefreshSessionKeyFn({ tokenLocation }, queryKey), queryFn: () => AuthenticationService.refreshSession({ tokenLocation }) as TData, ...options });
export const useAuthenticationServiceGetAllSsoProviders = <TData = Common.AuthenticationServiceGetAllSsoProvidersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetAllSsoProvidersKeyFn(queryKey), queryFn: () => AuthenticationService.getAllSsoProviders() as TData, ...options });
export const useAuthenticationServiceGetOneSsoProviderById = <TData = Common.AuthenticationServiceGetOneSsoProviderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceGetOneSsoProviderByIdKeyFn({ id }, queryKey), queryFn: () => AuthenticationService.getOneSsoProviderById({ id }) as TData, ...options });
export const useAuthenticationServiceDiscoverAuthentikOidc = <TData = Common.AuthenticationServiceDiscoverAuthentikOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ applicationName, host }: {
  applicationName: string;
  host: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverAuthentikOidcKeyFn({ applicationName, host }, queryKey), queryFn: () => AuthenticationService.discoverAuthentikOidc({ applicationName, host }) as TData, ...options });
export const useAuthenticationServiceDiscoverKeycloakOidc = <TData = Common.AuthenticationServiceDiscoverKeycloakOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ host, realm }: {
  host: string;
  realm: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceDiscoverKeycloakOidcKeyFn({ host, realm }, queryKey), queryFn: () => AuthenticationService.discoverKeycloakOidc({ host, realm }) as TData, ...options });
export const useAuthenticationServiceLoginWithOidc = <TData = Common.AuthenticationServiceLoginWithOidcDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithOidcKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithOidc({ providerId, redirectTo }) as TData, ...options });
export const useAuthenticationServiceOidcLoginCallback = <TData = Common.AuthenticationServiceOidcLoginCallbackDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ code, iss, providerId, redirectTo, sessionState, state }: {
  code: unknown;
  iss: unknown;
  providerId: string;
  redirectTo: string;
  sessionState: unknown;
  state: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceOidcLoginCallbackKeyFn({ code, iss, providerId, redirectTo, sessionState, state }, queryKey), queryFn: () => AuthenticationService.oidcLoginCallback({ code, iss, providerId, redirectTo, sessionState, state }) as TData, ...options });
export const useAuthenticationServiceLoginWithSaml = <TData = Common.AuthenticationServiceLoginWithSamlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ providerId, redirectTo }: {
  providerId: string;
  redirectTo?: unknown;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAuthenticationServiceLoginWithSamlKeyFn({ providerId, redirectTo }, queryKey), queryFn: () => AuthenticationService.loginWithSaml({ providerId, redirectTo }) as TData, ...options });
export const useTwoFactorAuthenticationServiceGetTwoFactorStatus = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorStatusDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorStatusKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorStatus() as TData, ...options });
export const useTwoFactorAuthenticationServiceGetTwoFactorPolicy = <TData = Common.TwoFactorAuthenticationServiceGetTwoFactorPolicyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn(queryKey), queryFn: () => TwoFactorAuthenticationService.getTwoFactorPolicy() as TData, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerFindAll = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindAllKeyFn(queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindAll() as TData, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerFindOne = <TData = Common.EmailTemplatesServiceEmailTemplateControllerFindOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ type }: {
  type: EmailTemplateType;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseEmailTemplatesServiceEmailTemplateControllerFindOneKeyFn({ type }, queryKey), queryFn: () => EmailTemplatesService.emailTemplateControllerFindOne({ type }) as TData, ...options });
export const useLicenseServiceGetLicenseInformation = <TData = Common.LicenseServiceGetLicenseInformationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseLicenseServiceGetLicenseInformationKeyFn(queryKey), queryFn: () => LicenseService.getLicenseInformation() as TData, ...options });
export const useResourcesServiceGetAllResources = <TData = Common.ResourcesServiceGetAllResourcesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  page?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }, queryKey), queryFn: () => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page, search }) as TData, ...options });
export const useResourcesServiceGetAllResourcesInUse = <TData = Common.ResourcesServiceGetAllResourcesInUseDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetAllResourcesInUseKeyFn(queryKey), queryFn: () => ResourcesService.getAllResourcesInUse() as TData, ...options });
export const useResourcesServiceGetOneResourceById = <TData = Common.ResourcesServiceGetOneResourceByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceGetOneResourceByIdKeyFn({ id }, queryKey), queryFn: () => ResourcesService.getOneResourceById({ id }) as TData, ...options });
export const useResourcesServiceSseControllerStreamEvents = <TData = Common.ResourcesServiceSseControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceSseControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.sseControllerStreamEvents({ resourceId }) as TData, ...options });
export const useResourcesServiceResourceGroupsGetMany = <TData = Common.ResourcesServiceResourceGroupsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetManyKeyFn(queryKey), queryFn: () => ResourcesService.resourceGroupsGetMany() as TData, ...options });
export const useResourcesServiceResourceGroupsGetOne = <TData = Common.ResourcesServiceResourceGroupsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceGroupsGetOneKeyFn({ id }, queryKey), queryFn: () => ResourcesService.resourceGroupsGetOne({ id }) as TData, ...options });
export const useResourcesServiceResourceUsageGetHistory = <TData = Common.ResourcesServiceResourceUsageGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId, userId }: {
  limit?: number;
  page?: number;
  resourceId: number;
  userId?: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, page, resourceId, userId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetHistory({ limit, page, resourceId, userId }) as TData, ...options });
export const useResourcesServiceResourceUsageGetActiveSession = <TData = Common.ResourcesServiceResourceUsageGetActiveSessionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageGetActiveSession({ resourceId }) as TData, ...options });
export const useResourcesServiceResourceUsageCanControl = <TData = Common.ResourcesServiceResourceUsageCanControlDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourcesServiceResourceUsageCanControlKeyFn({ resourceId }, queryKey), queryFn: () => ResourcesService.resourceUsageCanControl({ resourceId }) as TData, ...options });
export const useMqttServiceMqttServersGetAll = <TData = Common.MqttServiceMqttServersGetAllDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetAllKeyFn(queryKey), queryFn: () => MqttService.mqttServersGetAll() as TData, ...options });
export const useMqttServiceMqttServersGetOneById = <TData = Common.MqttServiceMqttServersGetOneByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseMqttServiceMqttServersGetOneByIdKeyFn({ id }, queryKey), queryFn: () => MqttService.mqttServersGetOneById({ id }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroductionsGetMany = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetMany({ groupId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroductionsGetHistory = <TData = Common.AccessControlServiceResourceGroupIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroductionsGetHistory({ groupId, userId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroducersGetMany = <TData = Common.AccessControlServiceResourceGroupIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId }: {
  groupId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersGetMany({ groupId }) as TData, ...options });
export const useAccessControlServiceResourceGroupIntroducersIsIntroducer = <TData = Common.AccessControlServiceResourceGroupIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, userId }: {
  groupId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceGroupIntroducersIsIntroducerKeyFn({ groupId, userId }, queryKey), queryFn: () => AccessControlService.resourceGroupIntroducersIsIntroducer({ groupId, userId }) as TData, ...options });
export const useAccessControlServiceResourceIntroducersIsIntroducer = <TData = Common.AccessControlServiceResourceIntroducersIsIntroducerDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeGroups, resourceId, userId }: {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersIsIntroducerKeyFn({ includeGroups, resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersIsIntroducer({ includeGroups, resourceId, userId }) as TData, ...options });
export const useAccessControlServiceResourceIntroducersGetMany = <TData = Common.AccessControlServiceResourceIntroducersGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroducersGetMany({ resourceId }) as TData, ...options });
export const useAccessControlServiceResourceIntroductionsGetMany = <TData = Common.AccessControlServiceResourceIntroductionsGetManyDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetMany({ resourceId }) as TData, ...options });
export const useAccessControlServiceResourceIntroductionsGetHistory = <TData = Common.AccessControlServiceResourceIntroductionsGetHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId, userId }: {
  resourceId: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }, queryKey), queryFn: () => AccessControlService.resourceIntroductionsGetHistory({ resourceId, userId }) as TData, ...options });
export const useResourceMaintenancesServiceCanManageMaintenance = <TData = Common.ResourceMaintenancesServiceCanManageMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceCanManageMaintenanceKeyFn({ resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.canManageMaintenance({ resourceId }) as TData, ...options });
export const useResourceMaintenancesServiceFindMaintenances = <TData = Common.ResourceMaintenancesServiceFindMaintenancesDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeActive, includePast, includeUpcoming, limit, page, resourceId }: {
  includeActive?: boolean;
  includePast?: boolean;
  includeUpcoming?: boolean;
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, page, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page, resourceId }) as TData, ...options });
export const useResourceMaintenancesServiceGetMaintenance = <TData = Common.ResourceMaintenancesServiceGetMaintenanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ maintenanceId, resourceId }: {
  maintenanceId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceMaintenancesServiceGetMaintenanceKeyFn({ maintenanceId, resourceId }, queryKey), queryFn: () => ResourceMaintenancesService.getMaintenance({ maintenanceId, resourceId }) as TData, ...options });
export const useBillingServiceGetBillingBalance = <TData = Common.BillingServiceGetBillingBalanceDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ userId }: {
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingBalanceKeyFn({ userId }, queryKey), queryFn: () => BillingService.getBillingBalance({ userId }) as TData, ...options });
export const useBillingServiceGetBillingTransactions = <TData = Common.BillingServiceGetBillingTransactionsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, userId }: {
  limit?: number;
  page?: number;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionsKeyFn({ limit, page, userId }, queryKey), queryFn: () => BillingService.getBillingTransactions({ limit, page, userId }) as TData, ...options });
export const useBillingServiceGetBillingTransaction = <TData = Common.BillingServiceGetBillingTransactionDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ transactionId }: {
  transactionId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingTransactionKeyFn({ transactionId }, queryKey), queryFn: () => BillingService.getBillingTransaction({ transactionId }) as TData, ...options });
export const useBillingServiceGetResourceBillingConfiguration = <TData = Common.BillingServiceGetResourceBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetResourceBillingConfigurationKeyFn({ resourceId }, queryKey), queryFn: () => BillingService.getResourceBillingConfiguration({ resourceId }) as TData, ...options });
export const useBillingServiceGetBillingConfiguration = <TData = Common.BillingServiceGetBillingConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetBillingConfigurationKeyFn(queryKey), queryFn: () => BillingService.getBillingConfiguration() as TData, ...options });
export const useBillingServiceGetSumUpConfiguration = <TData = Common.BillingServiceGetSumUpConfigurationDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpConfigurationKeyFn(queryKey), queryFn: () => BillingService.getSumUpConfiguration() as TData, ...options });
export const useBillingServiceGetSumUpReaders = <TData = Common.BillingServiceGetSumUpReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceGetSumUpReadersKeyFn(queryKey), queryFn: () => BillingService.getSumUpReaders() as TData, ...options });
export const useBillingServiceBillingControllerStreamEvents = <TData = Common.BillingServiceBillingControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseBillingServiceBillingControllerStreamEventsKeyFn(queryKey), queryFn: () => BillingService.billingControllerStreamEvents() as TData, ...options });
export const useResourceFlowsServiceGetNodeSchemas = <TData = Common.ResourceFlowsServiceGetNodeSchemasDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetNodeSchemasKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getNodeSchemas({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetResourceFlow = <TData = Common.ResourceFlowsServiceGetResourceFlowDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlow({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetResourceFlowLogs = <TData = Common.ResourceFlowsServiceGetResourceFlowLogsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page, resourceId }: {
  limit?: number;
  page?: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, page, resourceId }, queryKey), queryFn: () => ResourceFlowsService.getResourceFlowLogs({ limit, page, resourceId }) as TData, ...options });
export const useResourceFlowsServiceResourceFlowsControllerStreamEvents = <TData = Common.ResourceFlowsServiceResourceFlowsControllerStreamEventsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceResourceFlowsControllerStreamEventsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.resourceFlowsControllerStreamEvents({ resourceId }) as TData, ...options });
export const useResourceFlowsServiceGetButtons = <TData = Common.ResourceFlowsServiceGetButtonsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFlowsServiceGetButtonsKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFlowsService.getButtons({ resourceId }) as TData, ...options });
export const useProjectsServiceFindManyProjects = <TData = Common.ProjectsServiceFindManyProjectsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, page }: {
  limit?: number;
  page?: number;
} = {}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindManyProjectsKeyFn({ limit, page }, queryKey), queryFn: () => ProjectsService.findManyProjects({ limit, page }) as TData, ...options });
export const useProjectsServiceFindOneProject = <TData = Common.ProjectsServiceFindOneProjectDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceFindOneProjectKeyFn({ id }, queryKey), queryFn: () => ProjectsService.findOneProject({ id }) as TData, ...options });
export const useProjectsServiceGetProjectUsageHistory = <TData = Common.ProjectsServiceGetProjectUsageHistoryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, limit, page, startDate }: {
  endDate?: string;
  id: number;
  limit?: number;
  page?: number;
  startDate?: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageHistoryKeyFn({ endDate, id, limit, page, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageHistory({ endDate, id, limit, page, startDate }) as TData, ...options });
export const useProjectsServiceGetProjectUsageStats = <TData = Common.ProjectsServiceGetProjectUsageStatsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, startDate }: {
  endDate?: string;
  id: number;
  startDate?: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceGetProjectUsageStatsKeyFn({ endDate, id, startDate }, queryKey), queryFn: () => ProjectsService.getProjectUsageStats({ endDate, id, startDate }) as TData, ...options });
export const useProjectsServiceListProjectMembers = <TData = Common.ProjectsServiceListProjectMembersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectMembersKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectMembers({ id }) as TData, ...options });
export const useProjectsServiceListProjectInvitations = <TData = Common.ProjectsServiceListProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id }: {
  id: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectsServiceListProjectInvitationsKeyFn({ id }, queryKey), queryFn: () => ProjectsService.listProjectInvitations({ id }) as TData, ...options });
export const useProjectInvitationsServiceListMyProjectInvitations = <TData = Common.ProjectInvitationsServiceListMyProjectInvitationsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseProjectInvitationsServiceListMyProjectInvitationsKeyFn(queryKey), queryFn: () => ProjectInvitationsService.listMyProjectInvitations() as TData, ...options });
export const useResourceFormsServiceResourceFormsList = <TData = Common.ResourceFormsServiceResourceFormsListDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ resourceId }: {
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsList({ resourceId }) as TData, ...options });
export const useResourceFormsServiceResourceFormsGetRequirements = <TData = Common.ResourceFormsServiceResourceFormsGetRequirementsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ action, resourceId }: {
  action: "start" | "takeover" | "end";
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetRequirementsKeyFn({ action, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetRequirements({ action, resourceId }) as TData, ...options });
export const useResourceFormsServiceResourceFormsGetOne = <TData = Common.ResourceFormsServiceResourceFormsGetOneDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ formId, resourceId }: {
  formId: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseResourceFormsServiceResourceFormsGetOneKeyFn({ formId, resourceId }, queryKey), queryFn: () => ResourceFormsService.resourceFormsGetOne({ formId, resourceId }) as TData, ...options });
export const usePositionalTrackingServicePositionalTrackingControllerStreamDebug = <TData = Common.PositionalTrackingServicePositionalTrackingControllerStreamDebugDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePositionalTrackingServicePositionalTrackingControllerStreamDebugKeyFn(queryKey), queryFn: () => PositionalTrackingService.positionalTrackingControllerStreamDebug() as TData, ...options });
export const usePluginsServiceGetPlugins = <TData = Common.PluginsServiceGetPluginsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetPluginsKeyFn(queryKey), queryFn: () => PluginsService.getPlugins() as TData, ...options });
export const usePluginsServiceGetFrontendPluginFile = <TData = Common.PluginsServiceGetFrontendPluginFileDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filePath, pluginName }: {
  filePath: string;
  pluginName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UsePluginsServiceGetFrontendPluginFileKeyFn({ filePath, pluginName }, queryKey), queryFn: () => PluginsService.getFrontendPluginFile({ filePath, pluginName }) as TData, ...options });
export const useAttractapServiceGetReaderById = <TData = Common.AttractapServiceGetReaderByIdDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ readerId }: {
  readerId: number;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReaderByIdKeyFn({ readerId }, queryKey), queryFn: () => AttractapService.getReaderById({ readerId }) as TData, ...options });
export const useAttractapServiceGetReaders = <TData = Common.AttractapServiceGetReadersDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetReadersKeyFn(queryKey), queryFn: () => AttractapService.getReaders() as TData, ...options });
export const useAttractapServiceGetAllCards = <TData = Common.AttractapServiceGetAllCardsDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetAllCardsKeyFn(queryKey), queryFn: () => AttractapService.getAllCards() as TData, ...options });
export const useAttractapServiceGetFirmwares = <TData = Common.AttractapServiceGetFirmwaresDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>(queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwaresKeyFn(queryKey), queryFn: () => AttractapService.getFirmwares() as TData, ...options });
export const useAttractapServiceDownloadFirmwareBinary = <TData = Common.AttractapServiceDownloadFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ firmwareName, variantName }: {
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceDownloadFirmwareBinaryKeyFn({ firmwareName, variantName }, queryKey), queryFn: () => AttractapService.downloadFirmwareBinary({ firmwareName, variantName }) as TData, ...options });
export const useAttractapServiceGetFirmwareBinary = <TData = Common.AttractapServiceGetFirmwareBinaryDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ filename, firmwareName, variantName }: {
  filename: string;
  firmwareName: string;
  variantName: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAttractapServiceGetFirmwareBinaryKeyFn({ filename, firmwareName, variantName }, queryKey), queryFn: () => AttractapService.getFirmwareBinary({ filename, firmwareName, variantName }) as TData, ...options });
export const useAnalyticsServiceGetResourceUsageHoursInDateRange = <TData = Common.AnalyticsServiceGetResourceUsageHoursInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetResourceUsageHoursInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getResourceUsageHoursInDateRange({ end, start }) as TData, ...options });
export const useAnalyticsServiceGetBillingTransactionsInDateRange = <TData = Common.AnalyticsServiceGetBillingTransactionsInDateRangeDefaultResponse, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ end, start }: {
  end: string;
  start: string;
}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useQuery<TData, TError>({ queryKey: Common.UseAnalyticsServiceGetBillingTransactionsInDateRangeKeyFn({ end, start }, queryKey), queryFn: () => AnalyticsService.getBillingTransactionsInDateRange({ end, start }) as TData, ...options });
export const useSystemServiceRebootHost = <TData = Common.SystemServiceRebootHostMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SystemService.rebootHost() as unknown as Promise<TData>, ...options });
export const useSystemServiceShutdownHost = <TData = Common.SystemServiceShutdownHostMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => SystemService.shutdownHost() as unknown as Promise<TData>, ...options });
export const useUsersServiceSetLocalSignupDomainWhitelist = <TData = Common.UsersServiceSetLocalSignupDomainWhitelistMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: string[];
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: string[];
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.setLocalSignupDomainWhitelist({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceCreateOneUser = <TData = Common.UsersServiceCreateOneUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateUserDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateUserDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.createOneUser({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceInviteUser = <TData = Common.UsersServiceInviteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: InviteUserDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: InviteUserDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.inviteUser({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceInviteUsersFromCsv = <TData = Common.UsersServiceInviteUsersFromCsvMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CsvInviteUploadDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CsvInviteUploadDto;
}, TContext>({ mutationFn: ({ formData }) => UsersService.inviteUsersFromCsv({ formData }) as unknown as Promise<TData>, ...options });
export const useUsersServiceVerifyEmail = <TData = Common.UsersServiceVerifyEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: VerifyEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: VerifyEmailDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.verifyEmail({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceAcceptInvitation = <TData = Common.UsersServiceAcceptInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: AcceptInvitationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: AcceptInvitationDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.acceptInvitation({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceRequestPasswordReset = <TData = Common.UsersServiceRequestPasswordResetMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResetPasswordDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResetPasswordDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.requestPasswordReset({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangePasswordViaResetToken = <TData = Common.UsersServiceChangePasswordViaResetTokenMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangePasswordDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangePasswordDto;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, userId }) => UsersService.changePasswordViaResetToken({ requestBody, userId }) as unknown as Promise<TData>, ...options });
export const useUsersServiceRequestDeleteAccount = <TData = Common.UsersServiceRequestDeleteAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => UsersService.requestDeleteAccount() as unknown as Promise<TData>, ...options });
export const useUsersServiceConfirmDeleteAccount = <TData = Common.UsersServiceConfirmDeleteAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: DeleteAccountConfirmDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: DeleteAccountConfirmDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.confirmDeleteAccount({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceBulkUpdatePermissions = <TData = Common.UsersServiceBulkUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: BulkUpdateUserPermissionsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: BulkUpdateUserPermissionsDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.bulkUpdatePermissions({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceSetUserPassword = <TData = Common.UsersServiceSetUserPasswordMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: SetUserPasswordDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: SetUserPasswordDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.setUserPassword({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceCreateSession = <TData = Common.AuthenticationServiceCreateSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: { username?: string; password?: string; twoFactorCode?: string; tokenLocation?: "cookie" | "body"; };
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: { username?: string; password?: string; twoFactorCode?: string; tokenLocation?: "cookie" | "body"; };
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.createSession({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceCreateOneSsoProvider = <TData = Common.AuthenticationServiceCreateOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateSSOProviderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateSSOProviderDto;
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.createOneSsoProvider({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceLinkUserToExternalAccount = <TData = Common.AuthenticationServiceLinkUserToExternalAccountMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: LinkUserToExternalAccountRequestDto;
}, TContext>({ mutationFn: ({ requestBody }) => AuthenticationService.linkUserToExternalAccount({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoOidcLogout = <TData = Common.AuthenticationServiceSsoOidcLogoutMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcLogout({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoSamlLogout = <TData = Common.AuthenticationServiceSsoSamlLogoutMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlLogout({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoOidcDeleteUser = <TData = Common.AuthenticationServiceSsoOidcDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcDeleteUser({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoSamlDeleteUser = <TData = Common.AuthenticationServiceSsoSamlDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningUserDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlDeleteUser({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoOidcUpdatePermissions = <TData = Common.AuthenticationServiceSsoOidcUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoOidcUpdatePermissions({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSsoSamlUpdatePermissions = <TData = Common.AuthenticationServiceSsoSamlUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  authorization?: string;
  providerId: string;
  requestBody: SSOProvisioningPermissionsDto;
  xApiKey?: string;
}, TContext>({ mutationFn: ({ authorization, providerId, requestBody, xApiKey }) => AuthenticationService.ssoSamlUpdatePermissions({ authorization, providerId, requestBody, xApiKey }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceSamlLoginCallback = <TData = Common.AuthenticationServiceSamlLoginCallbackMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  providerId: string;
  redirectTo: string;
  relayState: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  providerId: string;
  redirectTo: string;
  relayState: string;
}, TContext>({ mutationFn: ({ providerId, redirectTo, relayState }) => AuthenticationService.samlLoginCallback({ providerId, redirectTo, relayState }) as unknown as Promise<TData>, ...options });
export const useTwoFactorAuthenticationServiceSetupTwoFactor = <TData = Common.TwoFactorAuthenticationServiceSetupTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => TwoFactorAuthenticationService.setupTwoFactor() as unknown as Promise<TData>, ...options });
export const useTwoFactorAuthenticationServiceVerifyTwoFactor = <TData = Common.TwoFactorAuthenticationServiceVerifyTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.verifyTwoFactor({ requestBody }) as unknown as Promise<TData>, ...options });
export const useTwoFactorAuthenticationServiceDisableTwoFactor = <TData = Common.TwoFactorAuthenticationServiceDisableTwoFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorCodeDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.disableTwoFactor({ requestBody }) as unknown as Promise<TData>, ...options });
export const useTwoFactorAuthenticationServiceSetTwoFactorPolicy = <TData = Common.TwoFactorAuthenticationServiceSetTwoFactorPolicyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: TwoFactorPolicyDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: TwoFactorPolicyDto;
}, TContext>({ mutationFn: ({ requestBody }) => TwoFactorAuthenticationService.setTwoFactorPolicy({ requestBody }) as unknown as Promise<TData>, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerPreviewMjml = <TData = Common.EmailTemplatesServiceEmailTemplateControllerPreviewMjmlMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: PreviewMjmlDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: PreviewMjmlDto;
}, TContext>({ mutationFn: ({ requestBody }) => EmailTemplatesService.emailTemplateControllerPreviewMjml({ requestBody }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceCreateOneResource = <TData = Common.ResourcesServiceCreateOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CreateResourceDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CreateResourceDto;
}, TContext>({ mutationFn: ({ formData }) => ResourcesService.createOneResource({ formData }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceGroupsCreateOne = <TData = Common.ResourcesServiceResourceGroupsCreateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateResourceGroupDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateResourceGroupDto;
}, TContext>({ mutationFn: ({ requestBody }) => ResourcesService.resourceGroupsCreateOne({ requestBody }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceGroupsAddResource = <TData = Common.ResourcesServiceResourceGroupsAddResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ groupId, resourceId }) => ResourcesService.resourceGroupsAddResource({ groupId, resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceUsageStartSession = <TData = Common.ResourcesServiceResourceUsageStartSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: StartUsageSessionDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: StartUsageSessionDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourcesService.resourceUsageStartSession({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceLockDoor = <TData = Common.ResourcesServiceLockDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.lockDoor({ resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceUnlockDoor = <TData = Common.ResourcesServiceUnlockDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.unlockDoor({ resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceUnlatchDoor = <TData = Common.ResourcesServiceUnlatchDoorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
}, TContext>({ mutationFn: ({ resourceId }) => ResourcesService.unlatchDoor({ resourceId }) as unknown as Promise<TData>, ...options });
export const useMqttServiceMqttServersCreateOne = <TData = Common.MqttServiceMqttServersCreateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateMqttServerDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateMqttServerDto;
}, TContext>({ mutationFn: ({ requestBody }) => MqttService.mqttServersCreateOne({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceGroupIntroductionsGrant = <TData = Common.AccessControlServiceResourceGroupIntroductionsGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, requestBody, userId }) => AccessControlService.resourceGroupIntroductionsGrant({ groupId, requestBody, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceGroupIntroductionsRevoke = <TData = Common.AccessControlServiceResourceGroupIntroductionsRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  requestBody: UpdateResourceGroupIntroductionDto;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, requestBody, userId }) => AccessControlService.resourceGroupIntroductionsRevoke({ groupId, requestBody, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceGroupIntroducersGrant = <TData = Common.AccessControlServiceResourceGroupIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, userId }) => AccessControlService.resourceGroupIntroducersGrant({ groupId, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceGroupIntroducersRevoke = <TData = Common.AccessControlServiceResourceGroupIntroducersRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  userId: number;
}, TContext>({ mutationFn: ({ groupId, userId }) => AccessControlService.resourceGroupIntroducersRevoke({ groupId, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceIntroducersGrant = <TData = Common.AccessControlServiceResourceIntroducersGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ resourceId, userId }) => AccessControlService.resourceIntroducersGrant({ resourceId, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceIntroductionsGrant = <TData = Common.AccessControlServiceResourceIntroductionsGrantMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, userId }) => AccessControlService.resourceIntroductionsGrant({ requestBody, resourceId, userId }) as unknown as Promise<TData>, ...options });
export const useResourceMaintenancesServiceCreateMaintenance = <TData = Common.ResourceMaintenancesServiceCreateMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateMaintenanceDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateMaintenanceDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceMaintenancesService.createMaintenance({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useBillingServiceCreateManualTransaction = <TData = Common.BillingServiceCreateManualTransactionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ModifyBalanceDto;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ModifyBalanceDto;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, userId }) => BillingService.createManualTransaction({ requestBody, userId }) as unknown as Promise<TData>, ...options });
export const useBillingServiceUpdateResourceBillingConfiguration = <TData = Common.BillingServiceUpdateResourceBillingConfigurationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceBillingConfigurationDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceBillingConfigurationDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => BillingService.updateResourceBillingConfiguration({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useBillingServiceSetSumUpApiKey = <TData = Common.BillingServiceSetSumUpApiKeyMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SetSumUpApiKeyDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SetSumUpApiKeyDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.setSumUpApiKey({ requestBody }) as unknown as Promise<TData>, ...options });
export const useBillingServiceSetBillingConfiguration = <TData = Common.BillingServiceSetBillingConfigurationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SetBillingConfigurationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SetBillingConfigurationDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.setBillingConfiguration({ requestBody }) as unknown as Promise<TData>, ...options });
export const useBillingServicePairSumUpReader = <TData = Common.BillingServicePairSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: PairSumUpReaderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: PairSumUpReaderDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.pairSumUpReader({ requestBody }) as unknown as Promise<TData>, ...options });
export const useBillingServiceTopUpWithSumUpReader = <TData = Common.BillingServiceTopUpWithSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SumupTopUpDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SumupTopUpDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.topUpWithSumUpReader({ requestBody }) as unknown as Promise<TData>, ...options });
export const useBillingServiceSumUpTopUpCallback = <TData = Common.BillingServiceSumUpTopUpCallbackMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: SumupTransactionCallbackDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: SumupTransactionCallbackDto;
}, TContext>({ mutationFn: ({ requestBody }) => BillingService.sumUpTopUpCallback({ requestBody }) as unknown as Promise<TData>, ...options });
export const useBillingServiceRefundTransaction = <TData = Common.BillingServiceRefundTransactionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: RefundTransactionDto;
  transactionId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: RefundTransactionDto;
  transactionId: number;
}, TContext>({ mutationFn: ({ requestBody, transactionId }) => BillingService.refundTransaction({ requestBody, transactionId }) as unknown as Promise<TData>, ...options });
export const useResourceFlowsServicePressButton = <TData = Common.ResourceFlowsServicePressButtonMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  buttonId: string;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  buttonId: string;
  resourceId: number;
}, TContext>({ mutationFn: ({ buttonId, resourceId }) => ResourceFlowsService.pressButton({ buttonId, resourceId }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceCreateProject = <TData = Common.ProjectsServiceCreateProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: CreateProjectDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: CreateProjectDto;
}, TContext>({ mutationFn: ({ formData }) => ProjectsService.createProject({ formData }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceCreateProjectInvitation = <TData = Common.ProjectsServiceCreateProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: CreateProjectInvitationDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: CreateProjectInvitationDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => ProjectsService.createProjectInvitation({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceResendProjectInvitation = <TData = Common.ProjectsServiceResendProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>({ mutationFn: ({ id, invitationId }) => ProjectsService.resendProjectInvitation({ id, invitationId }) as unknown as Promise<TData>, ...options });
export const useProjectInvitationsServiceAcceptProjectInvitation = <TData = Common.ProjectInvitationsServiceAcceptProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  invitationId: number;
}, TContext>({ mutationFn: ({ invitationId }) => ProjectInvitationsService.acceptProjectInvitation({ invitationId }) as unknown as Promise<TData>, ...options });
export const useProjectInvitationsServiceDeclineProjectInvitation = <TData = Common.ProjectInvitationsServiceDeclineProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  invitationId: number;
}, TContext>({ mutationFn: ({ invitationId }) => ProjectInvitationsService.declineProjectInvitation({ invitationId }) as unknown as Promise<TData>, ...options });
export const useResourceFormsServiceResourceFormsCreate = <TData = Common.ResourceFormsServiceResourceFormsCreateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: CreateFormDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: CreateFormDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceFormsService.resourceFormsCreate({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const usePluginsServiceUploadPlugin = <TData = Common.PluginsServiceUploadPluginMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UploadPluginDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UploadPluginDto;
}, TContext>({ mutationFn: ({ formData }) => PluginsService.uploadPlugin({ formData }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceEnrollNfcCard = <TData = Common.AttractapServiceEnrollNfcCardMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: EnrollNfcCardDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: EnrollNfcCardDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.enrollNfcCard({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceResetNfcCard = <TData = Common.AttractapServiceResetNfcCardMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResetNfcCardDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResetNfcCardDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.resetNfcCard({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceGetAppKeyByUid = <TData = Common.AttractapServiceGetAppKeyByUidMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: AppKeyRequestDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: AppKeyRequestDto;
}, TContext>({ mutationFn: ({ requestBody }) => AttractapService.getAppKeyByUid({ requestBody }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceUpdateOneSsoProvider = <TData = Common.AuthenticationServiceUpdateOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateSSOProviderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateSSOProviderDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => AuthenticationService.updateOneSsoProvider({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceUpdateOneResource = <TData = Common.ResourcesServiceUpdateOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UpdateResourceDto;
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UpdateResourceDto;
  id: number;
}, TContext>({ mutationFn: ({ formData, id }) => ResourcesService.updateOneResource({ formData, id }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceGroupsUpdateOne = <TData = Common.ResourcesServiceResourceGroupsUpdateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateResourceGroupDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateResourceGroupDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => ResourcesService.resourceGroupsUpdateOne({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceUsageEndSession = <TData = Common.ResourcesServiceResourceUsageEndSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: EndUsageSessionDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: EndUsageSessionDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourcesService.resourceUsageEndSession({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceUsageUpdateSessionProject = <TData = Common.ResourcesServiceResourceUsageUpdateSessionProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateUsageSessionProjectDto;
  resourceId: number;
  usageId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateUsageSessionProjectDto;
  resourceId: number;
  usageId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, usageId }) => ResourcesService.resourceUsageUpdateSessionProject({ requestBody, resourceId, usageId }) as unknown as Promise<TData>, ...options });
export const useMqttServiceMqttServersUpdateOne = <TData = Common.MqttServiceMqttServersUpdateOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateMqttServerDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateMqttServerDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => MqttService.mqttServersUpdateOne({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useResourceMaintenancesServiceUpdateMaintenance = <TData = Common.ResourceMaintenancesServiceUpdateMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  maintenanceId: number;
  requestBody: UpdateMaintenanceDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  maintenanceId: number;
  requestBody: UpdateMaintenanceDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ maintenanceId, requestBody, resourceId }) => ResourceMaintenancesService.updateMaintenance({ maintenanceId, requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useResourceFlowsServiceSaveResourceFlow = <TData = Common.ResourceFlowsServiceSaveResourceFlowMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ResourceFlowSaveDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ResourceFlowSaveDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId }) => ResourceFlowsService.saveResourceFlow({ requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceUpdateProject = <TData = Common.ProjectsServiceUpdateProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formData: UpdateProjectDto;
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formData: UpdateProjectDto;
  id: number;
}, TContext>({ mutationFn: ({ formData, id }) => ProjectsService.updateProject({ formData, id }) as unknown as Promise<TData>, ...options });
export const useResourceFormsServiceResourceFormsUpdate = <TData = Common.ResourceFormsServiceResourceFormsUpdateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formId: number;
  requestBody: UpdateFormDto;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formId: number;
  requestBody: UpdateFormDto;
  resourceId: number;
}, TContext>({ mutationFn: ({ formId, requestBody, resourceId }) => ResourceFormsService.resourceFormsUpdate({ formId, requestBody, resourceId }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangeMyUsername = <TData = Common.UsersServiceChangeMyUsernameMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangeUsernameDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangeUsernameDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.changeMyUsername({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangeMyEmail = <TData = Common.UsersServiceChangeMyEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: ChangeEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: ChangeEmailDto;
}, TContext>({ mutationFn: ({ requestBody }) => UsersService.changeMyEmail({ requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceUpdatePermissions = <TData = Common.UsersServiceUpdatePermissionsMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: UpdateUserPermissionsDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: UpdateUserPermissionsDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.updatePermissions({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangeUserUsername = <TData = Common.UsersServiceChangeUserUsernameMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeUsernameDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeUsernameDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserUsername({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangeUserEmail = <TData = Common.UsersServiceChangeUserEmailMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeEmailDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeEmailDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserEmail({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceChangeUserBillingFactor = <TData = Common.UsersServiceChangeUserBillingFactorMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: ChangeBillingFactorDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: ChangeBillingFactorDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => UsersService.changeUserBillingFactor({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useEmailTemplatesServiceEmailTemplateControllerUpdate = <TData = Common.EmailTemplatesServiceEmailTemplateControllerUpdateMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: EmailTemplateType;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateEmailTemplateDto;
  type: EmailTemplateType;
}, TContext>({ mutationFn: ({ requestBody, type }) => EmailTemplatesService.emailTemplateControllerUpdate({ requestBody, type }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceUpdateReader = <TData = Common.AttractapServiceUpdateReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: number;
  requestBody: UpdateReaderDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: number;
  requestBody: UpdateReaderDto;
}, TContext>({ mutationFn: ({ readerId, requestBody }) => AttractapService.updateReader({ readerId, requestBody }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceToggleCardActive = <TData = Common.AttractapServiceToggleCardActiveMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  requestBody: NfcCardSetActiveStateDto;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  requestBody: NfcCardSetActiveStateDto;
}, TContext>({ mutationFn: ({ id, requestBody }) => AttractapService.toggleCardActive({ id, requestBody }) as unknown as Promise<TData>, ...options });
export const useUsersServiceDeleteUser = <TData = Common.UsersServiceDeleteUserMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => UsersService.deleteUser({ id }) as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceEndSession = <TData = Common.AuthenticationServiceEndSessionMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, void, TContext>, "mutationFn">) => useMutation<TData, TError, void, TContext>({ mutationFn: () => AuthenticationService.endSession() as unknown as Promise<TData>, ...options });
export const useAuthenticationServiceDeleteOneSsoProvider = <TData = Common.AuthenticationServiceDeleteOneSsoProviderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => AuthenticationService.deleteOneSsoProvider({ id }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceDeleteOneResource = <TData = Common.ResourcesServiceDeleteOneResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ResourcesService.deleteOneResource({ id }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceGroupsRemoveResource = <TData = Common.ResourcesServiceResourceGroupsRemoveResourceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ groupId, resourceId }) => ResourcesService.resourceGroupsRemoveResource({ groupId, resourceId }) as unknown as Promise<TData>, ...options });
export const useResourcesServiceResourceGroupsDeleteOne = <TData = Common.ResourcesServiceResourceGroupsDeleteOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  groupId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  groupId: number;
}, TContext>({ mutationFn: ({ groupId }) => ResourcesService.resourceGroupsDeleteOne({ groupId }) as unknown as Promise<TData>, ...options });
export const useMqttServiceMqttServersDeleteOne = <TData = Common.MqttServiceMqttServersDeleteOneMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => MqttService.mqttServersDeleteOne({ id }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceIntroducersRevoke = <TData = Common.AccessControlServiceResourceIntroducersRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ resourceId, userId }) => AccessControlService.resourceIntroducersRevoke({ resourceId, userId }) as unknown as Promise<TData>, ...options });
export const useAccessControlServiceResourceIntroductionsRevoke = <TData = Common.AccessControlServiceResourceIntroductionsRevokeMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  requestBody: UpdateResourceIntroductionDto;
  resourceId: number;
  userId: number;
}, TContext>({ mutationFn: ({ requestBody, resourceId, userId }) => AccessControlService.resourceIntroductionsRevoke({ requestBody, resourceId, userId }) as unknown as Promise<TData>, ...options });
export const useResourceMaintenancesServiceCancelMaintenance = <TData = Common.ResourceMaintenancesServiceCancelMaintenanceMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  maintenanceId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  maintenanceId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ maintenanceId, resourceId }) => ResourceMaintenancesService.cancelMaintenance({ maintenanceId, resourceId }) as unknown as Promise<TData>, ...options });
export const useBillingServiceRemoveSumUpReader = <TData = Common.BillingServiceRemoveSumUpReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: string;
}, TContext>({ mutationFn: ({ readerId }) => BillingService.removeSumUpReader({ readerId }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceDeleteOneProject = <TData = Common.ProjectsServiceDeleteOneProjectMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
}, TContext>({ mutationFn: ({ id }) => ProjectsService.deleteOneProject({ id }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceRemoveProjectMember = <TData = Common.ProjectsServiceRemoveProjectMemberMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  memberId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  memberId: number;
}, TContext>({ mutationFn: ({ id, memberId }) => ProjectsService.removeProjectMember({ id, memberId }) as unknown as Promise<TData>, ...options });
export const useProjectsServiceCancelProjectInvitation = <TData = Common.ProjectsServiceCancelProjectInvitationMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  id: number;
  invitationId: number;
}, TContext>({ mutationFn: ({ id, invitationId }) => ProjectsService.cancelProjectInvitation({ id, invitationId }) as unknown as Promise<TData>, ...options });
export const useResourceFormsServiceResourceFormsDelete = <TData = Common.ResourceFormsServiceResourceFormsDeleteMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  formId: number;
  resourceId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  formId: number;
  resourceId: number;
}, TContext>({ mutationFn: ({ formId, resourceId }) => ResourceFormsService.resourceFormsDelete({ formId, resourceId }) as unknown as Promise<TData>, ...options });
export const usePluginsServiceDeletePlugin = <TData = Common.PluginsServiceDeletePluginMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  pluginId: string;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  pluginId: string;
}, TContext>({ mutationFn: ({ pluginId }) => PluginsService.deletePlugin({ pluginId }) as unknown as Promise<TData>, ...options });
export const useAttractapServiceDeleteReader = <TData = Common.AttractapServiceDeleteReaderMutationResult, TError = unknown, TContext = unknown>(options?: Omit<UseMutationOptions<TData, TError, {
  readerId: number;
}, TContext>, "mutationFn">) => useMutation<TData, TError, {
  readerId: number;
}, TContext>({ mutationFn: ({ readerId }) => AttractapService.deleteReader({ readerId }) as unknown as Promise<TData>, ...options });
