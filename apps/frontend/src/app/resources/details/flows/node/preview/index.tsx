import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { useNodeId, useNodesData } from '@xyflow/react';
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

      case 'input.mqtt.message.received':
        return [
          {
            label: t('nodes.input.mqtt.message.received.preview.topic'),
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

      case 'processing.mqtt.waitForMessage':
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

      case 'processing.error':
        return [
          {
            label: t('nodes.processing.error.preview.message'),
            value: nodeData?.data.message as string,
          },
        ];

      case 'processing.if':
        return [
          {
            label: t('nodes.processing.if.preview.summary'),
            value: `${nodeData?.data.path ?? '-'} ${nodeData?.data.comparisonOperator} ${nodeData?.data.comparisonValue ?? '-'}`,
          },
        ];

      case 'processing.set-payload': {
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
      }

      case 'output.resource.billing.calculation.set-additional-items':
        return [
          {
            label: t('nodes.output.resource.billing.calculation.set-additional-items.preview.position'),
            value: nodeData?.data.name as string,
          },
        ];

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

      case 'output.resource.usage.end-session':
        return [
          {
            label: t('nodes.output.resource.usage.end-session.preview.notes'),
            value: nodeData?.data.notes as string,
          },
        ];

      default: {
        const exhaustiveCheck: never = schema.type;
        throw new Error(`Unknown node type: ${exhaustiveCheck}`);
      }
    }
  }, [schema, t, nodeData]);
}
