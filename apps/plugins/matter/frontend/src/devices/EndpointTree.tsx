import type { MatterEndpointDetail } from './api';
import { EndpointBranch } from './EndpointBranch';
import type { EndpointCardOptions } from './EndpointTreeProps';

/** Endpoints grouped under their parent (`parentEndpointId`); an endpoint whose parent is not listed is a root. */
export function buildEndpointTree(endpoints: readonly MatterEndpointDetail[]) {
  const byId = new Map(endpoints.map((endpoint) => [endpoint.endpointId, endpoint]));
  const children = new Map<number | null, MatterEndpointDetail[]>();
  for (const endpoint of endpoints) {
    const parent =
      endpoint.parentEndpointId !== null && byId.has(endpoint.parentEndpointId) ? endpoint.parentEndpointId : null;
    children.set(parent, [...(children.get(parent) ?? []), endpoint]);
  }
  for (const list of children.values()) list.sort((a, b) => a.endpointId - b.endpointId);
  return children;
}

/** The endpoint hierarchy of a node as a nested tree of endpoint cards. */
export function EndpointTree({
  endpoints,
  ...options
}: Readonly<{ endpoints: readonly MatterEndpointDetail[] } & EndpointCardOptions>) {
  return (
    <div data-cy="matter-endpoint-tree">
      <EndpointBranch parent={null} tree={buildEndpointTree(endpoints)} {...options} />
    </div>
  );
}
