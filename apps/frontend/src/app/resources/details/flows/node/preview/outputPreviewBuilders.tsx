import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { PreviewBuilder } from './index.contracts';
export const outputPreviewBuilders: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
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
};
