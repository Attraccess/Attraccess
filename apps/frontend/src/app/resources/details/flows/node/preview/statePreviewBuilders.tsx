import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { NodePreviewData } from './index.contracts';
import { PreviewBuilder } from './index.contracts';
export const statePreviewBuilders: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED]: (t, nodeData) => {
    const watches = (nodeData?.data.watches as Array<{ key: string; scope: string }>) ?? [];
    const keyLabel = t('nodes.input.variable.changed.config.watches.items.key.label');
    const scopeLabel = t('nodes.input.variable.changed.config.watches.items.scope.label');
    const rows: NodePreviewData = [
      {
        label: t('nodes.input.variable.changed.preview.watches'),
        entries: watches.map((w) => ({
          fields: [
            { label: keyLabel, value: w?.key ?? '-' },
            {
              label: scopeLabel,
              value: w?.scope ? t('nodes.input.variable.changed.config.watches.items.scope.enum.' + w.scope) : '-',
            },
          ],
        })),
      },
    ];
    const sourceValue = nodeData?.data.source as string | undefined;
    if (sourceValue) {
      rows.push({
        label: t('nodes.input.variable.changed.preview.source'),
        value: t('nodes.input.variable.changed.config.source.enum.' + sourceValue),
      });
    }
    return rows;
  },
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
              value: `${baseline} ${(nodeData?.data.baselineUnit as string) ?? ''}`.trim(),
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
        label: t('nodes.output.resource.metering.report.preview.unit'),
        value: (nodeData?.data.unit as string) || '-',
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
