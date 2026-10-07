import { useCallback, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { buildClipboardData, parseClipboardData, buildPastedElements } from './flowClipboard';
import { FlowContextType } from './flowContext.contracts';
import type { useFlowProviderStateInputs } from './useFlowProviderStateInputs';

export function useFlowProviderStateOutput(model: ReturnType<typeof useFlowProviderStateInputs>) {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    updateNodeData,
    addNode,
    removeNode,
    resourceId,
    resource,
    liveLogs,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    flowNodeTypes,
    validationErrors,
    setValidationErrors,
  } = model;
  const copySelectedNodes = useCallback(async () => {
    const clipboardData = buildClipboardData(nodes, edges);
    if (!clipboardData) return;
    await navigator.clipboard.writeText(JSON.stringify(clipboardData));
  }, [nodes, edges]);

  const cutSelectedNodes = useCallback(async () => {
    const clipboardData = buildClipboardData(nodes, edges);
    if (!clipboardData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
    } catch {
      return;
    }
    const removedIds = new Set(clipboardData.nodes.map((n) => n.id));
    setNodes((prev) => prev.filter((n) => !removedIds.has(n.id)));
    setEdges((prev) => prev.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)));
  }, [nodes, edges, setNodes, setEdges]);

  const pasteNodes = useCallback(
    async (targetFlowPosition?: { x: number; y: number }) => {
      const text = await navigator.clipboard.readText().catch(() => '');
      const clipboardData = parseClipboardData(text);
      if (!clipboardData) return;

      const { nodes: newNodes, edges: newEdges } = buildPastedElements(clipboardData, nanoid, 50, targetFlowPosition);
      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
      setEdges((prev) => [...prev, ...newEdges]);
    },
    [setNodes, setEdges],
  );

  const value: FlowContextType = useMemo(
    () => ({
      nodes: nodes,
      edges: edges,
      onNodesChange: onNodesChange,
      onEdgesChange: onEdgesChange,
      onConnect: onConnect,
      updateNodeData: updateNodeData,
      addNode: addNode,
      removeNode: removeNode,
      setNodes: setNodes,
      setEdges: setEdges,
      resourceId: resourceId,
      resourceType: (resource?.type as 'machine' | 'door') ?? 'machine',
      resourceSeparateUnlockAndUnlatch: Boolean(resource?.separateUnlockAndUnlatch),
      resourceAllowTakeOver: Boolean(resource?.allowTakeOver),
      liveLogs: liveLogs ?? [],
      addLiveLogReceiver: addLiveLogReceiver,
      removeLiveLogReceiver: removeLiveLogReceiver,
      flowNodeTypes: flowNodeTypes,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
      validationErrors: validationErrors,
      setValidationErrors: setValidationErrors,
    }),
    [
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      updateNodeData,
      addNode,
      removeNode,
      setNodes,
      setEdges,
      resourceId,
      resource?.type,
      resource?.separateUnlockAndUnlatch,
      resource?.allowTakeOver,
      liveLogs,
      addLiveLogReceiver,
      removeLiveLogReceiver,
      flowNodeTypes,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
      validationErrors,
      setValidationErrors,
    ],
  );
  return { value, children: model.children } as const;
}
