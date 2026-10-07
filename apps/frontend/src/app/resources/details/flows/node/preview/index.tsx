import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import { TFunction, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeType, ResourceFlowsService } from '@attraccess/react-query-client';
import { useNodeId, useNodesData } from '@xyflow/react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Props } from './index.contracts';
import type { NodePreviewEntryField } from './index.contracts';
import type { NodePreviewRow } from './index.contracts';
import { NodePreviewData } from './index.contracts';
import { PreviewNode } from './index.contracts';
import { PreviewBuilder } from './index.contracts';
import { basicPreviewBuilders } from './basicPreviewBuilders';
import { outputPreviewBuilders } from './outputPreviewBuilders';
import { statePreviewBuilders } from './statePreviewBuilders';

export function useNodePreviewRows(props: Props): NodePreviewData {
  const { tNodeTranslations: t, schema, resourceId } = props;
  const locale = useTranslationState((state) => state.language);
  const nodeId = useNodeId();
  const nodeData = useNodesData(nodeId as string);
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
    return getNodePreviewRows(
      schema.type,
      t,
      nodeData,
      resolvePreview ? resolved.data?.configSchema : schema.configSchema,
      locale,
    );
  }, [schema, t, nodeData, resolvePreview, resolved.data, resolved.isError, locale]);
}

const previewBuilders: Partial<Record<ResourceFlowNodeType, PreviewBuilder>> = {
  ...basicPreviewBuilders,
  ...outputPreviewBuilders,
  ...statePreviewBuilders,
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

export { type NodePreviewEntryField };
export { type NodePreviewRow };
export { type NodePreviewData } from './index.contracts';
