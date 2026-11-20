import type { MatterEndpointDetail, Metadata } from './api';
import { EndpointCard } from './EndpointCard';

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

function Branch({
  parent,
  tree,
  ...rest
}: Readonly<{
  parent: number | null;
  tree: Map<number | null, MatterEndpointDetail[]>;
  bridgeName: string;
  canEdit: boolean;
  canRead: boolean;
  onRename: (endpointRef: string, changes: Partial<Metadata>) => Promise<unknown>;
}>) {
  const list = tree.get(parent) ?? [];
  if (list.length === 0) return null;
  return (
    <ul
      className={
        parent === null
          ? 'mt:flex mt:flex-col mt:gap-3'
          : 'mt:ml-3 mt:flex mt:flex-col mt:gap-3 mt:border-l mt:border-separator mt:pl-3'
      }
    >
      {list.map((endpoint) => (
        <li key={endpoint.id} className="mt:flex mt:flex-col mt:gap-3">
          <EndpointCard endpoint={endpoint} {...rest} />
          <Branch parent={endpoint.endpointId} tree={tree} {...rest} />
        </li>
      ))}
    </ul>
  );
}

/** The endpoint hierarchy of a node as a nested tree of endpoint cards. */
export function EndpointTree({
  endpoints,
  ...rest
}: Readonly<{
  endpoints: readonly MatterEndpointDetail[];
  bridgeName: string;
  canEdit: boolean;
  canRead: boolean;
  onRename: (endpointRef: string, changes: Partial<Metadata>) => Promise<unknown>;
}>) {
  return (
    <div data-cy="matter-endpoint-tree">
      <Branch parent={null} tree={buildEndpointTree(endpoints)} {...rest} />
    </div>
  );
}
