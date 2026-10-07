import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useReactFlow } from '@xyflow/react';
import {
  ApiError,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
} from '@attraccess/react-query-client';
import { useEffect, useRef } from 'react';
import { useAppTheme } from '@attraccess/ui';
import { usePtrStore } from '../../../../stores/ptr.store';
import { NodeCatalogHandle } from './nodeCatalog';
import { useFlowContext } from './flowContext';
import { useFlowImportExport } from './flowImportExport';
import { useQueryClient } from '@tanstack/react-query';
import de from './de.json';
import en from './en.json';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

export function useFlowsPageInnerStateInputs() {
  const { id: resourceId } = useParams();
  const { resolvedTheme } = useAppTheme();
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const { t: tNodeTranslations } = useTranslations({
    de: nodesDeTranslations,
    en: nodesEnTranslations,
  });
  const { setPullToRefreshIsEnabled } = usePtrStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPullToRefreshIsEnabled(false);
    return () => {
      setPullToRefreshIsEnabled(true);
    };
  }, [setPullToRefreshIsEnabled]);

  const {
    data: originalFlowData,
    isFetching: isFlowFetching,
    isError: isFlowError,
  } = useResourceFlowsServiceGetResourceFlow({ resourceId: Number(resourceId) }, undefined, {
    enabled: !!resourceId,
  });
  const isFlowLoading = !originalFlowData && isFlowFetching;

  const toast = useToastMessage();

  const {
    mutate: saveFlow,
    isError: saveFailed,
    isPending: isSaving,
  } = useResourceFlowsServiceSaveResourceFlow({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId: Number(resourceId) }),
      });
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const { fitView, screenToFlowPosition, getInternalNode } = useReactFlow();
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const nodeCatalogRef = useRef<NodeCatalogHandle>(null);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    addNode,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    flowNodeTypes,
    setValidationErrors,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
  } = useFlowContext();

  const { handleExport, handleImportClick } = useFlowImportExport({
    nodes,
    edges,
    setNodes,
    setEdges,
    resourceId: Number(resourceId),
    t,
  });

  useEffect(() => {
    if (originalFlowData) {
      setNodes(originalFlowData.nodes);
      setEdges(originalFlowData.edges);
      setValidationErrors(
        (originalFlowData as unknown as { validationErrors?: Array<{ nodeId: string; message: string }> })
          .validationErrors ?? [],
      );
    }
  }, [originalFlowData, setNodes, setEdges, setValidationErrors]);
  return {
    resourceId,
    resolvedTheme,
    t,
    tExists,
    tNodeTranslations,
    setPullToRefreshIsEnabled,
    queryClient,
    originalFlowData,
    isFlowFetching,
    isFlowError,
    isFlowLoading,
    toast,
    saveFlow,
    saveFailed,
    isSaving,
    fitView,
    screenToFlowPosition,
    getInternalNode,
    mousePosRef,
    nodeCatalogRef,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    addNode,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    flowNodeTypes,
    setValidationErrors,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
    handleExport,
    handleImportClick,
  } as const;
}
