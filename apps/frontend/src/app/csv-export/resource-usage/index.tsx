import { ResourceUsage } from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { CsvExportDrawerContent, ColumnDefinition } from '../export-drawer';
import { useResourceUsageExportState } from './useResourceUsageExportState';

export function ResourceUsageExport(props: ExportProps) {
  const {
    setFetchAll,
    refetch,
    resourceUsageExport,
    isFetchingAllPages,
    fetchStatus,
    resourceIds,
    operatingDurationsStatus,
    options,
    setOption,
    columns,
  } = useResourceUsageExportState(props);

  // TODO: handle grouping by user and resource

  return (
    <CsvExportDrawerContent
      columns={columns as ColumnDefinition<ResourceUsage>[]}
      items={resourceUsageExport as ResourceUsage[]}
      refetch={refetch}
      options={options}
      setOption={setOption}
      filename="resource-usage.csv"
      queryStatus={
        fetchStatus !== 'success' ? fetchStatus : resourceIds.length > 0 ? operatingDurationsStatus : fetchStatus
      }
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
