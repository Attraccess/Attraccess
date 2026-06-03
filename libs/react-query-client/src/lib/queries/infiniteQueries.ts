// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { InfiniteData, useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";
import { BillingService, MessagingService, ProjectsService, ResourceFlowsService, ResourceMaintenancesService, ResourcesService, UsersService } from "../requests/services.gen";
import { MaintenanceRequestStatus, PermissionFilter } from "../requests/types.gen";
import * as Common from "./common";
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
export const useUsersServiceFindManyInfinite = <TData = InfiniteData<Common.UsersServiceFindManyDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, search }: {
  ids?: number[] | undefined;
  limit?: number | undefined;
  search?: string | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, search }, queryKey), queryFn: ({ pageParam }) => UsersService.findMany({ ids, limit, page: pageParam as number, search }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
/**
* Get users with a specific permission
* @param data The data for the request.
* @param data.page Page number (1-based)
* @param data.limit Number of items per page
* @param data.permission Filter users by permission
* @returns PaginatedUsersResponseDto List of users with the specified permission.
* @throws ApiError
*/
export const useUsersServiceGetAllWithPermissionInfinite = <TData = InfiniteData<Common.UsersServiceGetAllWithPermissionDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, permission }: {
  limit?: number | undefined;
  permission?: PermissionFilter | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, permission }, queryKey), queryFn: ({ pageParam }) => UsersService.getAllWithPermission({ limit, page: pageParam as number, permission }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useResourcesServiceGetAllResourcesInfinite = <TData = InfiniteData<Common.ResourcesServiceGetAllResourcesDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, search }: {
  groupId?: number | undefined;
  ids?: number[] | undefined;
  limit?: number | undefined;
  onlyInUseByMe?: boolean | undefined;
  onlyWithPermissions?: boolean | undefined;
  search?: string | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, search }, queryKey), queryFn: ({ pageParam }) => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page: pageParam as number, search }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useResourcesServiceResourceUsageGetHistoryInfinite = <TData = InfiniteData<Common.ResourcesServiceResourceUsageGetHistoryDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, resourceId, userId }: {
  limit?: number | undefined;
  resourceId: number;
  userId?: number | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, resourceId, userId }, queryKey), queryFn: ({ pageParam }) => ResourcesService.resourceUsageGetHistory({ limit, page: pageParam as number, resourceId, userId }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useResourceMaintenancesServiceFindMaintenancesInfinite = <TData = InfiniteData<Common.ResourceMaintenancesServiceFindMaintenancesDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeActive, includePast, includeUpcoming, limit, resourceId }: {
  includeActive?: boolean | undefined;
  includePast?: boolean | undefined;
  includeUpcoming?: boolean | undefined;
  limit?: number | undefined;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourceMaintenancesServiceFindMaintenancesKeyFn({ includeActive, includePast, includeUpcoming, limit, resourceId }, queryKey), queryFn: ({ pageParam }) => ResourceMaintenancesService.findMaintenances({ includeActive, includePast, includeUpcoming, limit, page: pageParam as number, resourceId }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useResourceMaintenancesServiceListMaintenanceRequestsInfinite = <TData = InfiniteData<Common.ResourceMaintenancesServiceListMaintenanceRequestsDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, resourceId, status }: {
  limit?: number | undefined;
  resourceId: number;
  status?: MaintenanceRequestStatus | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourceMaintenancesServiceListMaintenanceRequestsKeyFn({ limit, resourceId, status }, queryKey), queryFn: ({ pageParam }) => ResourceMaintenancesService.listMaintenanceRequests({ limit, page: pageParam as number, resourceId, status }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
/**
* Get the billing transactions for a user
* @param data The data for the request.
* @param data.userId
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @returns TransactionsDto The billing transactions for the user.
* @throws ApiError
*/
export const useBillingServiceGetBillingTransactionsInfinite = <TData = InfiniteData<Common.BillingServiceGetBillingTransactionsDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, userId }: {
  limit?: number | undefined;
  userId: number;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseBillingServiceGetBillingTransactionsKeyFn({ limit, userId }, queryKey), queryFn: ({ pageParam }) => BillingService.getBillingTransactions({ limit, page: pageParam as number, userId }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useResourceFlowsServiceGetResourceFlowLogsInfinite = <TData = InfiniteData<Common.ResourceFlowsServiceGetResourceFlowLogsDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, resourceId }: {
  limit?: number | undefined;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, resourceId }, queryKey), queryFn: ({ pageParam }) => ResourceFlowsService.getResourceFlowLogs({ limit, page: pageParam as number, resourceId }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
/**
* Find many projects
* @param data The data for the request.
* @param data.page The page number to retrieve
* @param data.limit The number of items per page to retrieve
* @param data.includeArchived Include archived projects (already finished)
* @returns FindManyProjectsResponseDto The list of projects.
* @throws ApiError
*/
export const useProjectsServiceFindManyProjectsInfinite = <TData = InfiniteData<Common.ProjectsServiceFindManyProjectsDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ includeArchived, limit }: {
  includeArchived?: boolean | undefined;
  limit?: number | undefined;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseProjectsServiceFindManyProjectsKeyFn({ includeArchived, limit }, queryKey), queryFn: ({ pageParam }) => ProjectsService.findManyProjects({ includeArchived, limit, page: pageParam as number }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
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
export const useProjectsServiceGetProjectUsageHistoryInfinite = <TData = InfiniteData<Common.ProjectsServiceGetProjectUsageHistoryDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ endDate, id, limit, startDate }: {
  endDate?: string | undefined;
  id: number;
  limit?: number | undefined;
  startDate?: string | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseProjectsServiceGetProjectUsageHistoryKeyFn({ endDate, id, limit, startDate }, queryKey), queryFn: ({ pageParam }) => ProjectsService.getProjectUsageHistory({ endDate, id, limit, page: pageParam as number, startDate }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
/**
* List paginated messages of a conversation
* @param data The data for the request.
* @param data.id
* @param data.page The page number to retrieve
* @param data.limit The number of items per page
* @returns ListMessagesResponseDto The paginated messages
* @throws ApiError
*/
export const useMessagingServiceMessagingListMessagesInfinite = <TData = InfiniteData<Common.MessagingServiceMessagingListMessagesDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ id, limit }: {
  id: number;
  limit?: number | undefined;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseMessagingServiceMessagingListMessagesKeyFn({ id, limit }, queryKey), queryFn: ({ pageParam }) => MessagingService.messagingListMessages({ id, limit, page: pageParam as number }) as TData, initialPageParam: 1, getNextPageParam: response => (response as {
    nextPage: number;
  }).nextPage, ...options
});
