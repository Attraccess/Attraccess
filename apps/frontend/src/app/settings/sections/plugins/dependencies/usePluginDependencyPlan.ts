import { usePluginsServicePluginControllerDependencyPlan } from '@attraccess/react-query-client';

interface DependencyPlanRequest {
  packageName: string;
  spec?: string;
  registryId?: string;
}

/** Resolves the install plan for a package; pass undefined while the package has no dependencies to resolve. */
export function usePluginDependencyPlan(request: DependencyPlanRequest | undefined) {
  return usePluginsServicePluginControllerDependencyPlan(
    { packageName: request?.packageName ?? '', spec: request?.spec, registryId: request?.registryId },
    undefined,
    { enabled: request !== undefined, staleTime: 0, retry: false },
  );
}
