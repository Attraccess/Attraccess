import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto, ResourceFlowNodeType } from '@attraccess/react-query-client';
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
      case ResourceFlowNodeType.MANUAL_BUTTON:
        return [
          {
            label: t('nodes.manual.button.preview.label'),
            value: nodeData?.data.label as string,
          },
        ];

      case ResourceFlowNodeType.RESOURCE_USAGE_STARTED:
      case ResourceFlowNodeType.RESOURCE_USAGE_STOPPED:
      case ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER:
      case ResourceFlowNodeType.DOOR_UNLOCKED:
      case ResourceFlowNodeType.DOOR_LOCKED:
      case ResourceFlowNodeType.DOOR_UNLATCHED:
        return [];

      case ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY:
        return [
          {
            label: t('nodes.resource.activity.no-activity.preview.minInactivityMinutes'),
            value: nodeData?.data.minInactivityMinutes as string,
          },
        ];

      case ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED:
        return [
          {
            label: t('nodes.mqtt.message.received.preview.topic'),
            value: nodeData?.data.topic as string,
          },
        ];

      case ResourceFlowNodeType.LOGIC_WAIT:
        return [
          {
            label: t('nodes.logic.wait.preview.duration'),
            value: `${nodeData?.data.duration ?? 0} ${t('nodes.logic.wait.config.unit.enum.' + (nodeData?.data.unit ?? 'seconds'))}`,
          },
        ];

      case ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE:
        return [
          {
            label: t('nodes.mqtt.wait-for-message.preview.topic'),
            value: nodeData?.data.topic as string,
          },
          {
            label: t('nodes.mqtt.wait-for-message.preview.timeoutSeconds'),
            value: String(nodeData?.data.timeoutSeconds ?? ''),
          },
        ];

      case ResourceFlowNodeType.LOGIC_ERROR:
        return [
          {
            label: t('nodes.logic.error.preview.message'),
            value: nodeData?.data.message as string,
          },
        ];

      case ResourceFlowNodeType.LOGIC_IF:
        return [
          {
            label: t('nodes.logic.if.preview.summary'),
            value: `${nodeData?.data.path ?? '-'} ${nodeData?.data.comparisonOperator} ${nodeData?.data.comparisonValue ?? '-'}`,
          },
        ];

      case ResourceFlowNodeType.LOGIC_SET_PAYLOAD: {
        const entries = (nodeData?.data.entries as Array<{ key: string; value: string }>) ?? [];
        const preview = entries
          .slice(0, 3)
          .map((e) => `${e?.key ?? ''} = ${e?.value ?? ''}`)
          .join(', ');
        return [
          {
            label: t('nodes.logic.set-payload.preview.mappings'),
            value: preview,
          },
        ];
      }

      case ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
        return [
          {
            label: t('nodes.resource.billing.set-additional-items.preview.position'),
            value: nodeData?.data.name as string,
          },
        ];

      case ResourceFlowNodeType.HTTP_SEND_REQUEST:
        return [
          {
            label: t('nodes.http.send-request.preview.method'),
            value: nodeData?.data.method as string,
          },
          {
            label: t('nodes.http.send-request.preview.url'),
            value: nodeData?.data.url as string,
          },
        ];

      case ResourceFlowNodeType.MQTT_SEND_MESSAGE:
        return [
          {
            label: t('nodes.mqtt.send-message.preview.topic'),
            value: nodeData?.data.topic as string,
          },
        ];

      case ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION:
        return [
          {
            label: t('nodes.resource.usage.end-session.preview.notes'),
            value: nodeData?.data.notes as string,
          },
        ];

      case ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY:
        return [];

      case ResourceFlowNodeType.HEALTH_HEARTBEAT:
        return [
          {
            label: t('nodes.health.heartbeat.preview.identifier'),
            value: (nodeData?.data.identifier as string) || '-',
          },
          {
            label: t('nodes.health.heartbeat.preview.timeoutSeconds'),
            value: String(nodeData?.data.timeoutSeconds ?? ''),
          },
        ];

      case ResourceFlowNodeType.HEALTH_SET:
        return [
          {
            label: t('nodes.health.set.preview.identifier'),
            value: (nodeData?.data.identifier as string) || '-',
          },
          {
            label: t('nodes.health.set.preview.status'),
            value: (nodeData?.data.status as string) ?? '',
          },
        ];

      default: {
        const exhaustiveCheck: never = schema.type;
        throw new Error(`Unknown node type: ${exhaustiveCheck}`);
      }
    }
  }, [schema, t, nodeData]);
}
