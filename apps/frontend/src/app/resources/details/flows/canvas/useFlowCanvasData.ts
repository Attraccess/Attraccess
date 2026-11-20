import { useCallback, useEffect, useMemo } from 'react';
import { ResourceFlowEdgeDto, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePtrStore } from '../../../../../stores/ptr.store';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useFlowContext } from '../context/index';
import { findUnsupportedNodeTypes, useFlowCanvasQuery, useFlowNodeSchemasQuery, useSaveFlowCanvas } from '../flowOwner';
import { useFlowImportExport } from '../flowImportExport';
import de from '../de.json';
import en from '../en.json';
import nodesDeTranslations from '../node/de.json';
import nodesEnTranslations from '../node/en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { edgesHaveChanged, nodesHaveChanged } from './flowComparison';

/**
 * Loads the saved flow into the editor and offers save, import and export. Also turns off pull-to-refresh
 * while the canvas is open, because dragging on the canvas would trigger it.
 */
export function useFlowCanvasData() {
  const { owner, nodes, edges, setNodes, setEdges, setValidationErrors } = useFlowContext();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const { t: tNodeTranslations, tExists: tNodeExists } = useTranslations({
    de: nodesDeTranslations,
    en: nodesEnTranslations,
  });
  const { setPullToRefreshIsEnabled } = usePtrStore();
  const toast = useToastMessage();

  useEffect(() => {
    setPullToRefreshIsEnabled(false);
    return () => {
      setPullToRefreshIsEnabled(true);
    };
  }, [setPullToRefreshIsEnabled]);

  const { data: originalFlowData, isFetching: isFlowFetching, isError: isFlowError } = useFlowCanvasQuery(owner);
  const isFlowLoading = !originalFlowData && isFlowFetching;
  const { data: nodeSchemas } = useFlowNodeSchemasQuery(owner);
  const nodeTitle = useCallback(
    (nodeType: string) => {
      const titleKey = 'nodes.' + nodeType + '.title';
      if (tNodeExists(titleKey)) return tNodeTranslations(titleKey);
      return nodeSchemas?.find((schema) => schema.type === nodeType)?.label ?? nodeType;
    },
    [nodeSchemas, tNodeExists, tNodeTranslations],
  );

  const {
    save: saveFlow,
    isError: saveFailed,
    isPending: isSaving,
  } = useSaveFlowCanvas(owner, {
    onError: (error) => {
      // 400 from a global flow: some nodes do not support global flows. Name them instead of a generic error.
      const rejected = (error.body as { nodes?: Array<{ nodeId: string; nodeType: string }> } | undefined)?.nodes;
      if (error.status === 400 && Array.isArray(rejected) && rejected.length > 0) {
        toast.error({
          title: t('global.saveUnsupportedNodes.title'),
          description: t('global.saveUnsupportedNodes.description', {
            nodes: [...new Set(rejected.map((node) => nodeTitle(node.nodeType)))].join(', '),
          }),
        });
        return;
      }
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  // Same rules as the catalogue, so an import never loads a node the flow cannot save.
  const findUnsupportedNodes = useCallback(
    (importedNodes: ResourceFlowNodeDto[]) => {
      if (!nodeSchemas) return [];
      return findUnsupportedNodeTypes(importedNodes, nodeSchemas, owner).map((type) => nodeTitle(type));
    },
    [nodeSchemas, owner, nodeTitle],
  );

  const { handleExport, handleImportClick } = useFlowImportExport({
    nodes,
    edges,
    setNodes,
    setEdges,
    resourceId: owner.kind === 'resource' ? owner.resourceId : undefined,
    flowId: owner.kind === 'global' ? owner.flowId : undefined,
    findUnsupportedNodes,
    t,
  });

  useEffect(() => {
    if (originalFlowData) {
      setNodes(originalFlowData.nodes);
      setEdges(originalFlowData.edges);
      setValidationErrors(originalFlowData.validationErrors ?? []);
    }
  }, [originalFlowData, setNodes, setEdges, setValidationErrors]);

  const flowHasChanged = useMemo(
    () =>
      nodesHaveChanged(originalFlowData?.nodes ?? [], nodes) || edgesHaveChanged(originalFlowData?.edges ?? [], edges),
    [nodes, edges, originalFlowData?.nodes, originalFlowData?.edges],
  );

  const save = useCallback(() => {
    saveFlow({
      nodes: nodes as ResourceFlowNodeDto[],
      edges: edges as ResourceFlowEdgeDto[],
    });
  }, [nodes, edges, saveFlow]);

  return {
    originalFlowData,
    isFlowError,
    isFlowLoading,
    saveFailed,
    isSaving,
    flowHasChanged,
    save,
    handleExport,
    handleImportClick,
  };
}
