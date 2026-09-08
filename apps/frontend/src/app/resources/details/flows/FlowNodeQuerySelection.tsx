import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Node, useNodesInitialized, useReactFlow } from '@xyflow/react';

/** Query selection only changes view state, never node data or unsaved flow edits. */
export function FlowNodeQuerySelection({
  nodes,
  setNodes,
}: {
  nodes: Node[];
  setNodes: (update: (nodes: Node[]) => Node[]) => void;
}) {
  const [params] = useSearchParams();
  const nodeId = params.get('node');
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!nodeId) {
      handled.current = null;
      return;
    }
    if (!initialized || handled.current === nodeId || !nodes.some((node) => node.id === nodeId)) return;
    handled.current = nodeId;
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    void fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1 });
  }, [nodeId, initialized, nodes, setNodes, fitView]);
  return null;
}
