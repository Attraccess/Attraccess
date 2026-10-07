import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import { TFunction, useTranslationState } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowNodeType,
  ResourceFlowsService,
  useResourceMeteringServiceListResourceMeters,
} from '@attraccess/react-query-client';
import { useNodeId, useNodesData } from '@xyflow/react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Props } from './index.props';
import { NodePreviewEntryField } from './index.node-preview-entry-field';
import { NodePreviewRow } from './index.node-preview-row';
import { NodePreviewData } from './index.node-preview-data';
import { PreviewNode } from './index.preview-node';
import { PreviewBuilder } from './index.preview-builder';
import { previewBuilderGroup0 } from './previewBuilderGroup0';
import { previewBuilderGroup1 } from './previewBuilderGroup1';
import { previewBuilderGroup2 } from './previewBuilderGroup2';
import { previewBuilderGroup3 } from './previewBuilderGroup3';

export function useNodePreviewRows(props: Props): NodePreviewData {
  const { tNodeTranslations: t, schema, resourceId } = props;
  const locale = useTranslationState((state) => state.language);
  const nodeId = useNodeId();
  const nodeData = useNodesData(nodeId as string);
  const isMeterNode = schema.type.includes('.resource.metering.');
  const { data: meters } = useResourceMeteringServiceListResourceMeters({ resourceId: resourceId ?? 0 }, undefined, {
    enabled: isMeterNode && !!resourceId,
  });
  const resolvePreview = Boolean(
    nodeId &&
    nodeData &&
    resourceId &&
    schema.type.startsWith('plugin.') &&
    schema.configSchema.dynamic === true &&
    Array.isArray(schema.configSchema.preview),
  );
  const resolved = useQuery({
    queryKey: [...FLOW_NODE_PREVIEW_QUERY_KEY, resourceId, schema.type, nodeData?.data],
    queryFn: () => {
      if (!resourceId || !nodeData) throw new Error('A resource and node configuration are required');
      return ResourceFlowsService.resolveNodePreview({
        resourceId,
        nodeType: schema.type,
        requestBody: { config: nodeData.data },
      });
    },
    enabled: resolvePreview,
    staleTime: 30_000,
    // Applied device revisions can arrive after publication and in other sessions.
    // Refresh the lightweight summary while the canvas is visible.
    refetchInterval: 60_000,
    refetchOnWindowFocus: (query) => query.state.status === 'error',
    refetchOnReconnect: (query) => query.state.status === 'error',
    retry: false,
    placeholderData: undefined,
  });

  return useMemo(() => {
    if (resolvePreview && (resolved.isError || !resolved.data)) {
      return [
        { label: t('preview.configuration'), value: t(resolved.isError ? 'preview.unavailable' : 'preview.loading') },
      ];
    }
    const rows = getNodePreviewRows(
      schema.type,
      t,
      nodeData,
      resolvePreview ? resolved.data?.configSchema : schema.configSchema,
      locale,
    );
    if (isMeterNode)
      rows.unshift({
        label: t('nodes.' + schema.type + '.config.meterId.label'),
        value: meters?.find((meter) => meter.id === nodeData?.data.meterId)?.name ?? '-',
      });
    return rows;
  }, [schema, t, nodeData, resolvePreview, resolved.data, resolved.isError, locale, isMeterNode, meters]);
}

const previewBuilders: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  ...previewBuilderGroup0,
  ...previewBuilderGroup1,
  ...previewBuilderGroup2,
  ...previewBuilderGroup3,
};

export function getNodePreviewRows(
  type: string,
  t: TFunction,
  nodeData: PreviewNode,
  configSchema?: Record<string, unknown>,
  locale = 'en',
): NodePreviewData {
  if (type.startsWith('plugin.') && Array.isArray(configSchema?.preview)) {
    return configSchema.preview
      .filter(
        (row): row is { label: string; value: string } =>
          !!row &&
          typeof row === 'object' &&
          typeof row.label === 'string' &&
          !!row.label.trim() &&
          typeof row.value === 'string',
      )
      .slice(0, 4)
      .map((row) => {
        const translations = (row as { translations?: Record<string, unknown> }).translations;
        const translated = translations?.[locale] ?? translations?.[locale.split('-')[0]];
        if (translated && typeof translated === 'object') {
          const { label, value } = translated as { label?: unknown; value?: unknown };
          if (typeof label === 'string' && label.trim() && typeof value === 'string') return { label, value };
        }
        return { label: row.label, value: row.value };
      });
  }
  if (!Object.hasOwn(previewBuilders, type)) return [];
  return previewBuilders[type as ResourceFlowNodeType](t, nodeData);
}

export { type NodePreviewEntryField } from './index.node-preview-entry-field';
export { type NodePreviewRow } from './index.node-preview-row';
export { type NodePreviewData } from './index.node-preview-data';
