import type { NodeValidationError } from '../node/validationMessages';

/** Groups a flow's validation errors by node id, keeping their order. */
export function groupValidationErrorsByNode(
  errors: ReadonlyArray<NodeValidationError & { nodeId: string }>,
): Record<string, NodeValidationError[]> {
  const byNode: Record<string, NodeValidationError[]> = {};
  for (const { nodeId, field, code, message } of errors) {
    (byNode[nodeId] ??= []).push({ field, code, message });
  }
  return byNode;
}
