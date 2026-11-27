/** The permission requirement of an MCP tool, taken from the `x-attraccess-auth` extension of its operation. */
export interface McpToolRequirement {
  /** Every key must be held. */
  all: readonly string[];
  /** When not empty, at least one key must be held. */
  any: readonly string[];
}

/**
 * True when the permissions satisfy the requirement. An empty requirement is open to any signed-in caller.
 * The backend filters `tools/list` and `tools/call` with this, the MCP consent page previews with it.
 */
export function mcpToolAllowed(requirement: McpToolRequirement, permissions: ReadonlySet<string>): boolean {
  if (!requirement.all.every((key) => permissions.has(key))) return false;
  return requirement.any.length === 0 || requirement.any.some((key) => permissions.has(key));
}
