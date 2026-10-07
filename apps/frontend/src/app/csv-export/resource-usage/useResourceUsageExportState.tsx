import { ExportProps } from '../export-props';
import { useResourceUsageExportStateInputs } from './useResourceUsageExportStateInputs';
import { useResourceUsageExportStateColumns } from './useResourceUsageExportStateColumns';
import { useResourceUsageExportStateOutput } from './useResourceUsageExportStateOutput';

export function useResourceUsageExportState(props: ExportProps) {
  const useResourceUsageExportStateInputsModel = useResourceUsageExportStateInputs(props);
  const useResourceUsageExportStateColumnsModel = useResourceUsageExportStateColumns(
    useResourceUsageExportStateInputsModel,
  );
  return useResourceUsageExportStateOutput(useResourceUsageExportStateColumnsModel);
}
