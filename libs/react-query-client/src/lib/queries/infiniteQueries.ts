// generated with @7nohe/openapi-react-query-codegen@1.6.2 

import { InfiniteData, UseInfiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { ResourceFlowsService, ResourcesService, UsersService } from "../requests/services.gen";
import * as Common from "./common";
export const useUsersServiceFindManyInfinite = <TData = InfiniteData<Common.UsersServiceFindManyDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ ids, limit, search }: {
  ids?: number[];
  limit?: number;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseUsersServiceFindManyKeyFn({ ids, limit, search }, queryKey), queryFn: ({ pageParam }) => UsersService.findMany({ ids, limit, page: pageParam as number, search }) as TData, initialPageParam: "1", getNextPageParam: response => (response as {
    nextPage: string;
  }).nextPage, ...options
});
export const useUsersServiceGetAllWithPermissionInfinite = <TData = InfiniteData<Common.UsersServiceGetAllWithPermissionDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, permission }: {
  limit?: number;
  permission?: "canManageResources" | "canManageSystemConfiguration" | "canManageUsers";
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseUsersServiceGetAllWithPermissionKeyFn({ limit, permission }, queryKey), queryFn: ({ pageParam }) => UsersService.getAllWithPermission({ limit, page: pageParam as number, permission }) as TData, initialPageParam: "1", getNextPageParam: response => (response as {
    nextPage: string;
  }).nextPage, ...options
});
export const useResourcesServiceGetAllResourcesInfinite = <TData = InfiniteData<Common.ResourcesServiceGetAllResourcesDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, search }: {
  groupId?: number;
  ids?: number[];
  limit?: number;
  onlyInUseByMe?: boolean;
  onlyWithPermissions?: boolean;
  search?: string;
} = {}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourcesServiceGetAllResourcesKeyFn({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, search }, queryKey), queryFn: ({ pageParam }) => ResourcesService.getAllResources({ groupId, ids, limit, onlyInUseByMe, onlyWithPermissions, page: pageParam as number, search }) as TData, initialPageParam: "1", getNextPageParam: response => (response as {
    nextPage: string;
  }).nextPage, ...options
});
export const useResourcesServiceResourceUsageGetHistoryInfinite = <TData = InfiniteData<Common.ResourcesServiceResourceUsageGetHistoryDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, resourceId, userId }: {
  limit?: number;
  resourceId: number;
  userId?: number;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourcesServiceResourceUsageGetHistoryKeyFn({ limit, resourceId, userId }, queryKey), queryFn: ({ pageParam }) => ResourcesService.resourceUsageGetHistory({ limit, page: pageParam as number, resourceId, userId }) as TData, initialPageParam: "1", getNextPageParam: response => (response as {
    nextPage: string;
  }).nextPage, ...options
});
export const useResourceFlowsServiceGetResourceFlowLogsInfinite = <TData = InfiniteData<Common.ResourceFlowsServiceGetResourceFlowLogsDefaultResponse>, TError = unknown, TQueryKey extends Array<unknown> = unknown[]>({ limit, resourceId }: {
  limit?: number;
  resourceId: number;
}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => useInfiniteQuery({
  queryKey: Common.UseResourceFlowsServiceGetResourceFlowLogsKeyFn({ limit, resourceId }, queryKey), queryFn: ({ pageParam }) => ResourceFlowsService.getResourceFlowLogs({ limit, page: pageParam as number, resourceId }) as TData, initialPageParam: "1", getNextPageParam: response => (response as {
    nextPage: string;
  }).nextPage, ...options
});
