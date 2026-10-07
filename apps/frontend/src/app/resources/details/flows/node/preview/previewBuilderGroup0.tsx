import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { PreviewBuilder } from './index.preview-builder';
export const previewBuilderGroup0: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
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
};
