import { usePluginsServicePluginControllerDependencyPlan } from '@attraccess/react-query-client';

interface DependencyPlanRequest {
  packageName: string;
  spec?: string;
  registryId?: string;
}

interface Options {
  /** Use a plan another view already resolved for the same package instead of resolving it again. */
  reuseResolvedPlan?: boolean;
}

/** Resolves the install plan for a package; pass undefined while the package has no dependencies to resolve. */
export function usePluginDependencyPlan(
  request: DependencyPlanRequest | undefined,
  { reuseResolvedPlan }: Options = {},
) {
  return usePluginsServicePluginControllerDependencyPlan(
    { packageName: request?.packageName ?? '', spec: request?.spec, registryId: request?.registryId },
    undefined,
    { enabled: request !== undefined, staleTime: reuseResolvedPlan ? Infinity : 0, retry: false },
  );
}
