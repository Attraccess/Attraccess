import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Background, BackgroundVariant, Controls, ReactFlow, Node, Panel, Edge, useReactFlow, SelectionMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ButtonGroup, Spinner } from '@heroui/react';
import {
  ApiError,
  ResourceFlowEdgeDto,
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@heroui/react';
import { usePtrStore } from '../../../../stores/ptr.store';
import Dagre from '@dagrejs/dagre';
import { Button } from '../../../../components/button';
import {
  BoxSelectIcon,
  Braces as BracesIcon,
  DownloadIcon,
  HandIcon,
  LayoutGridIcon,
  LogsIcon,
  PlusIcon,
  SaveIcon,
  UploadIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { NodeCatalogHandle, NodeCatalogPanel } from './nodeCatalog';
import { FlowProvider, useFlowContext } from './flowContext';
import { useFlowImportExport } from './flowImportExport';
import { useQueryClient } from '@tanstack/react-query';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import JSConfetti from 'js-confetti';
import { LogViewer } from './logViewer';
import { VariablesModal } from './variablesModal';
import { FlowNodeQuerySelection } from './FlowNodeQuerySelection';
import de from './de.json';
import en from './en.json';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB' });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }),
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

// Efficient comparison functions to replace expensive JSON.stringify operations
function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}

function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

const jsConfetti = new JSConfetti();

function FlowsPageInner() {
  const { id: resourceId } = useParams();
  const { theme } = useTheme();
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

  const { data: originalFlowData, isFetching: isFlowFetching, isError: isFlowError } = useResourceFlowsServiceGetResourceFlow(
    { resourceId: Number(resourceId) },
    undefined,
    {
      enabled: !!resourceId,
    },
  );
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

  const { fitView, screenToFlowPosition } = useReactFlow();
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
        ((originalFlowData as unknown as { validationErrors?: Array<{ nodeId: string; message: string }> }).validationErrors ?? []),
      );
    }
  }, [originalFlowData, setNodes, setEdges, setValidationErrors]);

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
    const layouted = getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges]);

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
  const [, setFlowExecutionHadError] = useState(false);

  const isCoarsePointer = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(() =>
    isCoarsePointer ? 'pan' : 'select',
  );
  // @xyflow/react's mouse-button array in panOnDrag doesn't apply to touch, so for select mode on touch we must disable pan entirely.
  const panOnDrag = interactionMode === 'pan' ? true : isCoarsePointer ? false : [1, 2];
  const selectionOnDrag = interactionMode === 'select';

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        setFlowExecutionHadError(true);
        return;
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
        return;
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);

        // Use functional state update to get current error state
        setFlowExecutionHadError((currentErrorState) => {
          if (!currentErrorState) {
            jsConfetti.addConfetti();
          } else {
            jsConfetti.addConfetti({
              emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
              emojiSize: 100,
              confettiNumber: 2,
            });
          }

          // Reset error state for next execution
          return false;
        });
      }
    },
    [setFlowIsRunning, setFlowExecutionHadError],
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);

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
  }, [copySelectedNodes, cutSelectedNodes, pasteNodes, setNodes, screenToFlowPosition]);

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

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex flex-row w-full flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
        <NodeCatalogPanel
          ref={nodeCatalogRef}
          resourceId={Number(resourceId)}
          onSelect={addStartNode}
          tNodeTranslations={tNodeTranslations}
        />
        <div
          className="flex-1 h-full relative"
          onMouseMove={(e) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edgesWithCorrectType}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDropNode}
            onDragOver={onDragOver}
            selectionOnDrag={selectionOnDrag}
            panOnDrag={panOnDrag}
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            colorMode={theme === 'dark' ? 'dark' : 'light'}
            fitView
            // ponytail: fixed floor, derive it from the graph bounding box if 0.02 ever bites.
            // React Flow's default minZoom of 0.5 clamps fitView on flows taller than the pane,
            // which then centres on the bounding box and parks the viewport in a gap between
            // nodes - the canvas looks empty even though every node is rendered.
            minZoom={0.02}
            defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
            nodeTypes={flowNodeTypes}
            edgeTypes={edgeTypes}
          >
            <Controls />
            <FlowNodeQuerySelection key={resourceId} nodes={nodes} setNodes={setNodes} />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

            <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
              <ButtonGroup>
                <Button
                  isIconOnly
                  variant={interactionMode === 'pan' ? 'primary' : 'ghost'}
                  onPress={() => setInteractionMode('pan')}
                  aria-label={t('actions.modePan')}
                  aria-pressed={interactionMode === 'pan'}
                >
                  <HandIcon />
                </Button>
                <Button
                  isIconOnly
                  variant={interactionMode === 'select' ? 'primary' : 'ghost'}
                  onPress={() => setInteractionMode('select')}
                  aria-label={t('actions.modeSelect')}
                  aria-pressed={interactionMode === 'select'}
                >
                  <BoxSelectIcon />
                </Button>
              </ButtonGroup>
              <Button
                isIconOnly
                isPending={isSaving}
                onPress={save}
                isDisabled={!flowHasChanged}
                variant={saveFailed ? 'danger-soft' : flowHasChanged ? 'primary' : 'ghost'}
              >
                <SaveIcon />
              </Button>
              <Button isIconOnly onPress={handleImportClick} aria-label={t('actions.import')} isDisabled={isFlowLoading}>
                <UploadIcon />
              </Button>
              <Button isIconOnly onPress={handleExport} aria-label={t('actions.export')} isDisabled={isFlowLoading}>
                <DownloadIcon />
              </Button>
              <LogViewer resourceId={Number(resourceId)}>
                {(open) => (
                  <Button isIconOnly onPress={open} aria-label={t('actions.logs')}>
                    <LogsIcon />
                  </Button>
                )}
              </LogViewer>

              <VariablesModal resourceId={Number(resourceId)}>
                {(open) => (
                  <Button isIconOnly onPress={open} aria-label={t('actions.variables')}>
                    <BracesIcon />
                  </Button>
                )}
              </VariablesModal>

              <Button isIconOnly onPress={layout} isDisabled={isFlowLoading}>
                <LayoutGridIcon />
              </Button>
              <Button
                isIconOnly
                variant="primary"
                onPress={() => nodeCatalogRef.current?.open()}
                aria-label={t('actions.addNode')}
                className="md:hidden"
                isDisabled={isFlowLoading}
              >
                <PlusIcon />
              </Button>
            </Panel>
          </ReactFlow>
          {(isFlowLoading || (isFlowError && !originalFlowData)) && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm"
              role={isFlowError ? 'alert' : 'status'}
              aria-live="polite"
              aria-label={isFlowError ? t('loadError') : t('loading')}
              aria-busy={isFlowLoading}
            >
              {isFlowError ? (
                <p className="text-danger text-sm text-center px-4">{t('loadError')}</p>
              ) : (
                <Spinner size="lg" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const { id: resourceId } = useParams();

  return (
    <FlowProvider resourceId={Number(resourceId)}>
      <FlowsPageInner />
    </FlowProvider>
  );
}
