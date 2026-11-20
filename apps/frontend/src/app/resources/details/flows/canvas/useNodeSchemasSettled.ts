import { useState } from 'react';
import { type FlowOwner, useFlowNodeSchemasQuery } from '../flowOwner';

/**
 * True once the owner's node schemas have loaded or failed for the first time, and from then on for as long as the
 * caller stays mounted. FlowEditorCanvas mounts React Flow on it: node type keys must not change after that mount
 * (#002), and a refetch of a failed query (window focus, reconnect, a new reader) goes back to pending, which must
 * not unmount the canvas again.
 */
export function useNodeSchemasSettled(owner: FlowOwner): boolean {
  const { data, isError } = useFlowNodeSchemasQuery(owner);
  const settledNow = data !== undefined || isError;
  const [settled, setSettled] = useState(settledNow);
  if (settledNow && !settled) {
    setSettled(true);
  }
  return settled || settledNow;
}
