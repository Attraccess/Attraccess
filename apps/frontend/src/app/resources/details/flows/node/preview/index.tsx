import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto, ResourceFlowNodeType } from '@attraccess/react-query-client';
import { useNodeId, useNodesData } from '@xyflow/react';
import { useMemo } from 'react';

interface Props {
  tNodeTranslations: TFunction;
  schema: ResourceFlowNodeSchemaDto;
}

export type NodePreviewEntryField = {
  label: string;
  value: string;
};

export type NodePreviewRow =
  | {
      label: string;
      value: string;
    }
  | {
      label: string;
      entries: Array<{
        title?: string;
        fields: Array<NodePreviewEntryField>;
      }>;
    };

export type NodePreviewData = Array<NodePreviewRow>;

export function useNodePreviewRows(props: Props): NodePreviewData {
  const { tNodeTranslations: t, schema } = props;
  const nodeId = useNodeId();
  const nodeData = useNodesData(nodeId as string);

  return useMemo(() => getNodePreviewRows(schema.type, t, nodeData), [schema, t, nodeData]);
}

type PreviewNode = { data: Record<string, unknown> } | null;
type PreviewBuilder = (t: TFunction, nodeData: PreviewNode) => NodePreviewData;

const previewBuilders: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  [ResourceFlowNodeType.INPUT_BUTTON]: (t, nodeData) => {
    return [
      {
        label: t('nodes.input.button.preview.label'),
        value: nodeData?.data.label as string,
      },
    ];
  },
  [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY]: (t, nodeData) => {
    return [
      {
        label: t('nodes.input.resource.activity.no-activity.preview.minInactivityMinutes'),
        value: nodeData?.data.minInactivityMinutes as string,
      },
    ];
  },
  [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED]: (t, nodeData) => {
    return [
      {
        label: t('nodes.input.mqtt.message.received.preview.topic'),
        value: nodeData?.data.topic as string,
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_WAIT]: (t, nodeData) => {
    return [
      {
        label: t('nodes.processing.wait.preview.duration'),
        value: `${nodeData?.data.duration ?? 0} ${t('nodes.processing.wait.config.unit.enum.' + (nodeData?.data.unit ?? 'seconds'))}`,
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE]: (t, nodeData) => {
    return [
      {
        label: t('nodes.processing.mqtt.waitForMessage.preview.topic'),
        value: nodeData?.data.topic as string,
      },
      {
        label: t('nodes.processing.mqtt.waitForMessage.preview.timeoutSeconds'),
        value: String(nodeData?.data.timeoutSeconds ?? ''),
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_ERROR]: (t, nodeData) => {
    return [
      {
        label: t('nodes.processing.error.preview.message'),
        value: nodeData?.data.message as string,
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_IF]: (t, nodeData) => {
    return [
      {
        label: t('nodes.processing.if.preview.summary'),
        value: `${nodeData?.data.path ?? '-'} ${nodeData?.data.comparisonOperator} ${nodeData?.data.comparisonValue ?? '-'}`,
      },
    ];
  },
  [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD]: (t, nodeData) => {
    const entries = (nodeData?.data.entries as Array<{ key: string; value: string }>) ?? [];
    const preview = entries
      .slice(0, 3)
      .map((e) => `${e?.key ?? ''} = ${e?.value ?? ''}`)
      .join(', ');
    return [
      {
        label: t('nodes.processing.set-payload.preview.mappings'),
        value: preview,
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_CALCULATION_SET_ADDITIONAL_ITEMS]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.resource.billing.calculation.set-additional-items.preview.position'),
        value: nodeData?.data.name as string,
      },
    ];
  },
  [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST]: (t, nodeData) => {
    return [
      {
        label: t('nodes.output.http.sendRequest.preview.method'),
        value: nodeData?.data.method as string,
      },
      {
        label: t('nodes.output.http.sendRequest.preview.url'),
        value: nodeData?.data.url as string,
      },
    ];
  },
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

export function getNodePreviewRows(type: string, t: TFunction, nodeData: PreviewNode): NodePreviewData {
  if (!Object.hasOwn(previewBuilders, type)) return [];
  return previewBuilders[type as ResourceFlowNodeType](t, nodeData);
}
