import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { EdgeWithDeleteButton } from '../edgeWithDeleteButton';
import {
  ResourceFlowLog,
  ResourceFlowEdgeDto,
  ResourceFlowNodeDto,
  ApiError,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
} from '@attraccess/react-query-client';
import { nanoid } from 'nanoid';
import JSConfetti from 'js-confetti';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import { getLayoutedElements } from '../flowLayout';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAppTheme } from '@attraccess/ui';
import { usePtrStore } from '../../../../../stores/ptr.store';
import { NodeCatalogHandle } from '../nodeCatalog/index';
import { useFlowContext } from '../context/index';
import { useFlowImportExport } from '../flowImportExport';
import { useQueryClient } from '@tanstack/react-query';
import de from '../de.json';
import en from '../en.json';
import nodesDeTranslations from '../node/de.json';
import nodesEnTranslations from '../node/en.json';
import { useToastMessage } from '../../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import '@xyflow/react/dist/style.css';

export function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

export // Efficient comparison functions to replace expensive JSON.stringify operations
function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}

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

export function useFlowsPageInnerStateNodesHaveChanged(model: ReturnType<typeof useFlowsPageInnerStateInputs>) {
  const {
    originalFlowData,
    nodes,
    edges,
    saveFlow,
    resourceId,
    getInternalNode,
    setNodes,
    setEdges,
    fitView,
    addNode,
  } = model;
  const nodesHaveChanged = useMemo(() => {
    const originalNodes = originalFlowData?.nodes ?? [];

    if (originalNodes.length !== nodes.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalNodes.length; i++) {
      const originalNode = originalNodes[i];
      const currentNode = nodes.find((n) => n.id === originalNode.id);

      if (!currentNode || !areNodesEqual(originalNode, currentNode)) {
        return true;
      }
    }

    return false;
  }, [nodes, originalFlowData?.nodes]);

  const edgesHaveChanged = useMemo(() => {
    const originalEdges = originalFlowData?.edges ?? [];

    if (originalEdges.length !== edges.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalEdges.length; i++) {
      const originalEdge = originalEdges[i];
      const currentEdge = edges.find((e) => e.id === originalEdge.id);

      if (!currentEdge || !areEdgesEqual(originalEdge, currentEdge)) {
        return true;
      }
    }

    return false;
  }, [edges, originalFlowData?.edges]);

  const flowHasChanged = useMemo(() => {
    return nodesHaveChanged || edgesHaveChanged;
  }, [nodesHaveChanged, edgesHaveChanged]);

  const save = useCallback(() => {
    saveFlow({
      resourceId: Number(resourceId),
      requestBody: {
        nodes: nodes as ResourceFlowNodeDto[],
        edges: edges as ResourceFlowEdgeDto[],
      },
    });
  }, [nodes, edges, saveFlow, resourceId]);

  const layout = useCallback(() => {
    const sourceHandles = new Map(
      nodes.map((node) => [
        node.id,
        [...(getInternalNode(node.id)?.internals.handleBounds?.source ?? [])]
          .sort((a, b) => a.x - b.x)
          .flatMap((handle) => (handle.id == null ? [] : [handle.id])),
      ]),
    );
    const layouted = getLayoutedElements(nodes, edges, sourceHandles);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges, getInternalNode]);

  const addStartNode = useCallback(
    (nodeType: string) => {
      let maxX = 0;
      nodes.forEach((node) => {
        maxX = Math.max(maxX, node.position.x);
      });
      const newNode: Node = {
        id: nanoid(),
        position: { x: maxX + 300, y: 0 },
        type: nodeType,
        data: {},
      };
      addNode(newNode);

      fitView({ nodes: [newNode], duration: 1000, maxZoom: 0.9 });
    },
    [addNode, nodes, fitView],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  return {
    ...model,
    nodesHaveChanged,
    edgesHaveChanged,
    flowHasChanged,
    save,
    layout,
    addStartNode,
    onDragOver,
  } as const;
}

export function useFlowsPageInnerStateOnDropNode(model: ReturnType<typeof useFlowsPageInnerStateNodesHaveChanged>) {
  const { screenToFlowPosition, addNode, nodes, setNodes, addLiveLogReceiver, removeLiveLogReceiver } = model;
  const onDropNode = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode({ id: nanoid(), position, type: nodeType, data: { __centerOnDrop: true } });
    },
    [addNode, screenToFlowPosition],
  );

  useEffect(() => {
    const pending = nodes.find((n) => {
      const flagged = (n.data as { __centerOnDrop?: boolean })?.__centerOnDrop === true;
      return flagged && n.measured?.width != null && n.measured?.height != null;
    });
    if (!pending) return;
    const w = pending.measured?.width ?? 0;
    const h = pending.measured?.height ?? 0;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== pending.id) return n;
        const nextData = { ...(n.data as Record<string, unknown>) };
        delete nextData.__centerOnDrop;
        return {
          ...n,
          position: { x: n.position.x - w / 2, y: n.position.y - h / 2 },
          data: nextData,
        };
      }),
    );
  }, [nodes, setNodes]);

  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const flowExecutionHadError = useRef(false);
  const [confettiEnabled, setConfettiEnabled] = useState(false);
  const confettiRef = useRef<JSConfetti | null>(null);

  useEffect(() => {
    if (!confettiEnabled) return;

    const confetti = new JSConfetti();
    confettiRef.current = confetti;
    return () => {
      confettiRef.current = null;
      confetti.clearCanvas();
      confetti.destroyCanvas();
    };
  }, [confettiEnabled]);

  const isCoarsePointer = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(() => (isCoarsePointer ? 'pan' : 'select'));
  // @xyflow/react's mouse-button array in panOnDrag doesn't apply to touch, so for select mode on touch we must disable pan entirely.
  const panOnDrag = interactionMode === 'pan' ? true : isCoarsePointer ? false : [1, 2];
  const selectionOnDrag = interactionMode === 'select';

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        flowExecutionHadError.current = true;
        return;
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
        return;
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);

        if (!flowExecutionHadError.current) {
          confettiRef.current?.addConfetti();
        } else {
          confettiRef.current?.addConfetti({
            emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
            emojiSize: 100,
            confettiNumber: 2,
          });
        }

        flowExecutionHadError.current = false;
      }
    },
    [setFlowIsRunning],
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);
  return {
    ...model,
    onDropNode,
    flowIsRunning,
    setFlowIsRunning,
    flowExecutionHadError,
    confettiEnabled,
    setConfettiEnabled,
    confettiRef,
    isCoarsePointer,
    interactionMode,
    setInteractionMode,
    panOnDrag,
    selectionOnDrag,
    onLiveLog,
  } as const;
}

export function useFlowsPageInnerStateOutput(model: ReturnType<typeof useFlowsPageInnerStateOnDropNode>) {
  const {
    copySelectedNodes,
    cutSelectedNodes,
    mousePosRef,
    screenToFlowPosition,
    pasteNodes,
    setNodes,
    edges,
    flowIsRunning,
  } = model;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'c') {
        copySelectedNodes();
      } else if (isMod && e.key === 'x') {
        cutSelectedNodes();
      } else if (isMod && e.key === 'v') {
        const targetFlowPosition = mousePosRef.current ? screenToFlowPosition(mousePosRef.current) : undefined;
        pasteNodes(targetFlowPosition);
      } else if (isMod && e.key === 'a') {
        e.preventDefault();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySelectedNodes, cutSelectedNodes, pasteNodes, setNodes, screenToFlowPosition, mousePosRef]);

  const edgesWithCorrectType = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: edge.type ?? 'attraccess-edge',
      animated: flowIsRunning,
    }));
  }, [edges, flowIsRunning]);

  const edgeTypes = useMemo(
    () => ({
      'attraccess-edge': EdgeWithDeleteButton,
    }),
    [],
  );
  return {
    resourceId: model.resourceId,
    resolvedTheme: model.resolvedTheme,
    t: model.t,
    tNodeTranslations: model.tNodeTranslations,
    originalFlowData: model.originalFlowData,
    isFlowError: model.isFlowError,
    isFlowLoading: model.isFlowLoading,
    saveFailed: model.saveFailed,
    isSaving: model.isSaving,
    fitView: model.fitView,
    mousePosRef: model.mousePosRef,
    nodeCatalogRef: model.nodeCatalogRef,
    nodes: model.nodes,
    edges: model.edges,
    onNodesChange: model.onNodesChange,
    onEdgesChange: model.onEdgesChange,
    onConnect: model.onConnect,
    setNodes: model.setNodes,
    flowNodeTypes: model.flowNodeTypes,
    handleExport: model.handleExport,
    handleImportClick: model.handleImportClick,
    flowHasChanged: model.flowHasChanged,
    save: model.save,
    layout: model.layout,
    addStartNode: model.addStartNode,
    onDragOver: model.onDragOver,
    onDropNode: model.onDropNode,
    confettiEnabled: model.confettiEnabled,
    setConfettiEnabled: model.setConfettiEnabled,
    interactionMode: model.interactionMode,
    setInteractionMode: model.setInteractionMode,
    panOnDrag: model.panOnDrag,
    selectionOnDrag: model.selectionOnDrag,
    edgesWithCorrectType,
    edgeTypes,
  } as const;
}

export function useFlowEditor() {
  const useFlowsPageInnerStateInputsModel = useFlowsPageInnerStateInputs();
  const useFlowsPageInnerStateNodesHaveChangedModel = useFlowsPageInnerStateNodesHaveChanged(
    useFlowsPageInnerStateInputsModel,
  );
  const useFlowsPageInnerStateOnDropNodeModel = useFlowsPageInnerStateOnDropNode(
    useFlowsPageInnerStateNodesHaveChangedModel,
  );
  return useFlowsPageInnerStateOutput(useFlowsPageInnerStateOnDropNodeModel);
}
