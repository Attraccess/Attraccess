import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { useNodeId, useNodesData } from '@xyflow/react';
import { TFunction } from 'i18next';
import { useMemo } from 'react';

interface Props {
  tNodeTranslations: TFunction;
  schema: ResourceFlowNodeSchemaDto;
}

export type NodePreviewData = Array<{
  label: string;
  value: string;
}>;

export function useNodePreviewRows(props: Props): NodePreviewData {
  const { tNodeTranslations: t, schema } = props;
  const nodeId = useNodeId();
  const nodeData = useNodesData(nodeId as string);

  return useMemo(() => {
    switch (schema.type) {
      case 'input.button':
        return [
          {
            label: t('nodes.input.button.preview.label'),
            value: nodeData?.data.label as string,
          },
        ];

      case 'input.resource.usage.started':
      case 'input.resource.usage.stopped':
      case 'input.resource.usage.takeover':
      case 'input.resource.door.unlocked':
      case 'input.resource.door.locked':
      case 'input.resource.door.unlatched':
        return [];

      case 'output.http.sendRequest':
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

      case 'output.mqtt.sendMessage':
        return [
          {
            label: t('nodes.output.mqtt.sendMessage.preview.topic'),
            value: nodeData?.data.topic as string,
          },
        ];

      case 'processing.wait':
        return [
          {
            label: t('nodes.processing.wait.preview.duration'),
            value: `${nodeData?.data.duration ?? 0} ${t('nodes.processing.wait.config.unit.enum.' + (nodeData?.data.unit ?? 'seconds'))}`,
          },
        ];

      case 'processing.if':
        return [
          {
            label: t('nodes.processing.if.preview.summary'),
            value: `${nodeData?.data.path ?? '-'} ${nodeData?.data.comparisonOperator} ${nodeData?.data.comparisonValue ?? '-'}`,
          },
        ];

      default:
        console.error('UNKNOWN NODE TYPE', schema);
        return [
          {
            label: 'UNKNOWN NODE TYPE',
            value: 'UNKNOWN NODE TYPE',
          },
        ];
    }
  }, [schema, t, nodeData]);
}
