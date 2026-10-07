import type { useResourceUsageExportStateColumns } from './useResourceUsageExportStateColumns';

export function useResourceUsageExportStateOutput(model: ReturnType<typeof useResourceUsageExportStateColumns>) {
  return {
    setFetchAll: model.setFetchAll,
    refetch: model.refetch,
    resourceUsageExport: model.resourceUsageExport,
    isFetchingAllPages: model.isFetchingAllPages,
    fetchStatus: model.fetchStatus,
    resourceIds: model.resourceIds,
    operatingDurationsStatus: model.operatingDurationsStatus,
    options: model.options,
    setOption: model.setOption,
    columns: model.columns,
  } as const;
}
