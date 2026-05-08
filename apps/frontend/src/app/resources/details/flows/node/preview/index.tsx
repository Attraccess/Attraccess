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
      case ResourceFlowNodeType.INPUT_BUTTON:
        return [
          {
            label: t('nodes.input.button.preview.label'),
            value: nodeData?.data.label as string,
          },
        ];

      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
        return [];

      case ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY:
        return [
          {
            label: t('nodes.input.resource.activity.no-activity.preview.minInactivityMinutes'),
            value: nodeData?.data.minInactivityMinutes as string,
          },
        ];

      case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
        return [
          {
            label: t('nodes.input.mqtt.message.received.preview.topic'),
            value: nodeData?.data.topic as string,
          },
        ];

      case ResourceFlowNodeType.PROCESSING_WAIT:
        return [
          {
            label: t('nodes.processing.wait.preview.duration'),
            value: `${nodeData?.data.duration ?? 0} ${t('nodes.processing.wait.config.unit.enum.' + (nodeData?.data.unit ?? 'seconds'))}`,
          },
        ];

      case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
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

      case ResourceFlowNodeType.PROCESSING_ERROR:
        return [
          {
            label: t('nodes.processing.error.preview.message'),
            value: nodeData?.data.message as string,
          },
        ];

      case ResourceFlowNodeType.PROCESSING_IF:
        return [
          {
            label: t('nodes.processing.if.preview.summary'),
            value: `${nodeData?.data.path ?? '-'} ${nodeData?.data.comparisonOperator} ${nodeData?.data.comparisonValue ?? '-'}`,
          },
        ];

      case ResourceFlowNodeType.PROCESSING_SET_PAYLOAD: {
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

      case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_CALCULATION_SET_ADDITIONAL_ITEMS:
        return [
          {
            label: t('nodes.output.resource.billing.calculation.set-additional-items.preview.position'),
            value: nodeData?.data.name as string,
          },
        ];

      case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
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

      case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
        return [
          {
            label: t('nodes.output.mqtt.sendMessage.preview.topic'),
            value: nodeData?.data.topic as string,
          },
        ];

      case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
        return [
          {
            label: t('nodes.output.resource.usage.end-session.preview.notes'),
            value: nodeData?.data.notes as string,
          },
        ];

      case ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY:
        return [];

      case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT:
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

      case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET:
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

      case ResourceFlowNodeType.INPUT_VARIABLE_CHANGED: {
        const watches = (nodeData?.data.watches as Array<{ key: string; scope: string }>) ?? [];
        const watchPreview = watches
          .slice(0, 3)
          .map((w) =>
            t('nodes.input.variable.changed.preview.watchEntry', {
              key: w?.key ?? '',
              scope: w?.scope
                ? t('nodes.input.variable.changed.config.watches.items.scope.enum.' + w.scope)
                : '',
            }),
          )
          .join(', ');
        const sourceValue = nodeData?.data.source as string | undefined;
        const rows: NodePreviewData = [
          {
            label: t('nodes.input.variable.changed.preview.watches'),
            value: watchPreview || '-',
          },
        ];
        if (sourceValue) {
          rows.push({
            label: t('nodes.input.variable.changed.preview.source'),
            value: t('nodes.input.variable.changed.config.source.enum.' + sourceValue),
          });
        }
        return rows;
      }

      case ResourceFlowNodeType.PROCESSING_VARIABLES_SET: {
        const variables =
          (nodeData?.data.variables as Array<{ key: string; value: string; scope: string }>) ?? [];
        const preview = variables
          .slice(0, 3)
          .map((v) =>
            t('nodes.processing.variables.set.preview.assignment', {
              key: v?.key ?? '',
              value: v?.value ?? '',
              scope: v?.scope
                ? t('nodes.processing.variables.set.config.variables.items.scope.enum.' + v.scope)
                : '',
            }),
          )
          .join(', ');
        return [
          {
            label: t('nodes.processing.variables.set.preview.assignments'),
            value: preview || '-',
          },
        ];
      }

      case ResourceFlowNodeType.PROCESSING_VARIABLES_GET: {
        const variables =
          (nodeData?.data.variables as Array<{ key: string; scope: string; payloadPath: string }>) ?? [];
        const preview = variables
          .slice(0, 3)
          .map((v) =>
            t('nodes.processing.variables.get.preview.read', {
              key: v?.key ?? '',
              path: v?.payloadPath ?? '',
              scope: v?.scope
                ? t('nodes.processing.variables.get.config.variables.items.scope.enum.' + v.scope)
                : '',
            }),
          )
          .join(', ');
        return [
          {
            label: t('nodes.processing.variables.get.preview.reads'),
            value: preview || '-',
          },
        ];
      }

      default: {
        const exhaustiveCheck: never = schema.type;
        throw new Error(`Unknown node type: ${exhaustiveCheck}`);
      }
    }
  }, [schema, t, nodeData]);
}
