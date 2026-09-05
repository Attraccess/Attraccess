import { Button } from '@heroui/react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useQuery } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import type { WagoResourceDiagnostics } from '../../diagnostics-types';
import { ControllerDiagnostics, WagoDiagnosticsBoundary } from './ControllerDiagnostics';

const api = createPluginApiClient('/api/wago');

export interface ResourceDiagnosticsAccess {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
}

export function ResourceDiagnostics(props: { resourceId: number; access: ResourceDiagnosticsAccess }) {
  const allowed = useSyncExternalStore(props.access.subscribe, props.access.getSnapshot);
  // Unmount even cached diagnostics on permission loss. The endpoint independently enforces this permission.
  if (!allowed) return null;
  return (
    <WagoDiagnosticsBoundary key={props.resourceId}>
      <ResourceDiagnosticsContent {...props} />
    </WagoDiagnosticsBoundary>
  );
}

function ResourceDiagnosticsContent({ resourceId }: { resourceId: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ['wago', 'resource-diagnostics', resourceId],
    queryFn: ({ signal }) => api.request<WagoResourceDiagnostics>(`/resources/${resourceId}/diagnostics`, { signal }),
    staleTime: 30_000,
    retry: false,
  });
  if (query.isError) return <p role="status">WAGO diagnostics unavailable. Resource controls remain available.</p>;
  const data = query.data;
  if (!data || (!data.controllers.length && !data.invalidControllerReferences && !data.truncated)) return null;
  return (
    <section aria-label="Resource WAGO diagnostics" className="wg:min-w-0 wg:break-words">
      <p>WAGO references. Warnings do not block resource usage; required flow nodes determine gating.</p>
      {data.controllers.map((controller) => (
        <div key={controller.controllerId}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setSelected(selected === controller.controllerId ? null : controller.controllerId)}
          >
            {selected === controller.controllerId ? 'Close' : 'Open'} WAGO diagnostics: {controller.name}
          </Button>
          {controller.unavailable && <p role="status">Controller diagnostics unavailable.</p>}
          {controller.references.some((reference) => reference.invalid) && (
            <p role="status">Invalid flow reference. Open diagnostics to review.</p>
          )}
          {controller.references.some((reference) => reference.conflict) && (
            <p role="status">Channel also controlled by another resource.</p>
          )}
          {controller.referencesTruncated && (
            <p role="status">Reference lookup incomplete; additional warnings may exist.</p>
          )}
          {controller.references
            .filter((reference) => reference.invalid || reference.conflict)
            .map((reference) => (
              <p key={reference.nodeId}>
                <a href={reference.href}>Review node {reference.nodeId}</a>
              </p>
            ))}
          {selected === controller.controllerId && <ControllerDiagnostics controllerId={controller.controllerId} />}
        </div>
      ))}
      {data.invalidControllerReferences > 0 && (
        <p role="status">
          Invalid controller references: {data.invalidControllerReferences}. Review this resource's flow.
        </p>
      )}
      {data.truncated && (
        <p role="status">Showing at most 1,000 flow nodes and 20 controllers. Additional references may exist.</p>
      )}
    </section>
  );
}
