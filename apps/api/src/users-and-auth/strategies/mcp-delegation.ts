import type { AuthenticatedSessionUser } from '@attraccess/application-models';

/**
 * The principal behind an MCP OAuth tool call, attached to the in-process REST request that executes it.
 *
 * It lives in a WeakMap keyed by the request object, not in a header or cookie: it cannot be forged or replayed from
 * outside the process, and no credential stronger than the MCP principal exists anywhere. `SessionStrategy` turns it
 * into the request user with `granted ∩ current` permissions.
 */
export interface McpDelegation {
  user: AuthenticatedSessionUser;
  /** Permissions the user approved for this grant. */
  permissionKeys: readonly string[];
  grantId: string;
  clientId: string;
}

const delegations = new WeakMap<object, McpDelegation>();

export function setMcpDelegation(request: object, delegation: McpDelegation): void {
  delegations.set(request, delegation);
}

export function getMcpDelegation(request: object): McpDelegation | undefined {
  return delegations.get(request);
}
