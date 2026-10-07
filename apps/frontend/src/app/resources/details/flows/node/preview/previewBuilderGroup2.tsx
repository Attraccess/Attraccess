import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { NodePreviewData } from './index.node-preview-data';
import { PreviewBuilder } from './index.preview-builder';
export const previewBuilderGroup2: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.mqtt.sendMessage.preview.topic'),
        value: nodeData?.data.topic as string,
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.resource.usage.end-session.preview.notes'),
        value: nodeData?.data.notes as string,
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.resource.health.heartbeat.preview.identifier'),
        value: (nodeData?.data.identifier as string) || '-',
      },
      {
        label: t('nodes.output.resource.health.heartbeat.preview.timeoutSeconds'),
        value: String(nodeData?.data.timeoutSeconds ?? ''),
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.resource.health.set.preview.identifier'),
        value: (nodeData?.data.identifier as string) || '-',
      },
      {
        label: t('nodes.output.resource.health.set.preview.status'),
        value: (nodeData?.data.status as string) ?? '',
      },
    ];
  },
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
};
