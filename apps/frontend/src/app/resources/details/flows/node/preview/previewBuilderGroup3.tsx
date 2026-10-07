import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { PreviewBuilder } from './index.preview-builder';
export const previewBuilderGroup3: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  [ResourceFlowNodeType.PROCESSING_VARIABLES_SET]: (t, nodeData) => {
    const variables = (nodeData?.data.variables as Array<{ key: string; value: string; scope: string }>) ?? [];
    const keyLabel = t('nodes.processing.variables.set.config.variables.items.key.label');
    const valueLabel = t('nodes.processing.variables.set.config.variables.items.value.label');
    const scopeLabel = t('nodes.processing.variables.set.config.variables.items.scope.label');
    return [
      {
        label: t('nodes.processing.variables.set.preview.assignments'),
        entries: variables.map((v) => ({
          fields: [
            { label: keyLabel, value: v?.key ?? '-' },
            { label: valueLabel, value: v?.value ?? '-' },
            {
              label: scopeLabel,
              value: v?.scope ? t('nodes.processing.variables.set.config.variables.items.scope.enum.' + v.scope) : '-',
            },
          ],
        })),
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_METERING_READY]: (t, nodeData) => {
    const baseline = nodeData?.data.baselineValue as string | undefined;
    return [
      ...(baseline
        ? [
            {
              label: t('nodes.output.resource.metering.ready.preview.baselineValue'),
              value: baseline,
            },
          ]
        : []),
      {
        label: t('nodes.output.resource.metering.ready.preview.source'),
        value: (nodeData?.data.source as string) || '-',
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_METERING_REPORT]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.resource.metering.report.preview.value'),
        value: (nodeData?.data.value as string) || '-',
      },
      {
        label: t('nodes.output.resource.metering.report.config.mode.label'),
        value: t('nodes.output.resource.metering.report.config.mode.enum.' + (nodeData?.data.mode ?? 'total')),
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_VARIABLES_GET]: (t, nodeData) => {
    const variables = (nodeData?.data.variables as Array<{ key: string; scope: string; payloadPath: string }>) ?? [];
    const keyLabel = t('nodes.processing.variables.get.config.variables.items.key.label');
    const pathLabel = t('nodes.processing.variables.get.config.variables.items.payloadPath.label');
    const scopeLabel = t('nodes.processing.variables.get.config.variables.items.scope.label');
    return [
      {
        label: t('nodes.processing.variables.get.preview.reads'),
        entries: variables.map((v) => ({
          fields: [
            { label: keyLabel, value: v?.key ?? '-' },
            { label: pathLabel, value: v?.payloadPath ?? '-' },
            {
              label: scopeLabel,
              value: v?.scope ? t('nodes.processing.variables.get.config.variables.items.scope.enum.' + v.scope) : '-',
            },
          ],
        })),
      },
    ];
  },
};
