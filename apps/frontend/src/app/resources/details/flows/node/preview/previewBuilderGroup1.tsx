import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { PreviewBuilder } from './index.preview-builder';
export const previewBuilderGroup1: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
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
};
