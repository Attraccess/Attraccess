import type { MatterEndpointDetail } from './api';
import { EndpointCard } from './EndpointCard';
import type { EndpointCardOptions } from './EndpointTreeProps';

/** The children of one endpoint (or the roots, for `parent` null), each followed by its own children, indented. */
export function EndpointBranch({
  parent,
  tree,
  ...options
}: Readonly<{ parent: number | null; tree: Map<number | null, MatterEndpointDetail[]> } & EndpointCardOptions>) {
  const list = tree.get(parent) ?? [];
  if (list.length === 0) return null;
  return (
    <ul
      className={
        parent === null
          ? 'mt:flex mt:flex-col mt:gap-3'
          : 'mt:ml-3 mt:flex mt:flex-col mt:gap-3 mt:border-l mt:border-separator mt:pl-3'
      }
      data-cy="matter-endpoint-branch"
    >
      {list.map((endpoint) => (
        <li key={endpoint.id} className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-endpoint-node">
          <EndpointCard endpoint={endpoint} {...options} />
          <EndpointBranch parent={endpoint.endpointId} tree={tree} {...options} />
        </li>
      ))}
    </ul>
  );
}
