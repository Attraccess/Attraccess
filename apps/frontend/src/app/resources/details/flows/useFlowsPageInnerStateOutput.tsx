import { useEffect, useMemo } from 'react';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import type { useFlowsPageInnerStateOnDropNode } from './useFlowsPageInnerStateOnDropNode';

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
