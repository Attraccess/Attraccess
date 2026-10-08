import { Alert, Link } from '@heroui/react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { WagoResourceDiagnostics } from '../../../diagnostics-types';
import { WagoDiagnosticsBoundary } from './ControllerDiagnostics';
import { useWagoTranslations } from '../i18n';

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

type Controller = WagoResourceDiagnostics['controllers'][number];

function nodeProblems(controller: Controller) {
  const byNode = new Map<string, Controller['references'][number]>();
  for (const reference of controller.references) {
    if (reference.invalid || reference.conflict) byNode.set(reference.nodeId, reference);
  }
  return [...byNode.values()];
}

/** Silent when the WAGO setup is healthy; only surfaces actionable problems to resource managers. */
function ResourceDiagnosticsContent({ resourceId }: { resourceId: number }) {
  const { t } = useWagoTranslations();
  const query = useQuery({
    queryKey: ['wago', 'resource-diagnostics', resourceId],
    queryFn: ({ signal }) => api.request<WagoResourceDiagnostics>(`/resources/${resourceId}/diagnostics`, { signal }),
    staleTime: 30_000,
    retry: false,
  });
  // ponytail: a failed diagnostics lookup is not worth cluttering the resource page; the WAGO page shows details.
  if (query.isError || !query.data) return null;
  const data = query.data;
  const controllers = data.controllers
    .map((controller) => ({ ...controller, nodes: nodeProblems(controller) }))
    .filter((controller) => controller.unavailable || controller.nodes.length || controller.referencesTruncated);
  if (!controllers.length && !data.invalidControllerReferences && !data.truncated) return null;

  return (
    <Alert status="warning" aria-label={t('diagnostics.resourceTitle')}>
      <Alert.Indicator />
      <Alert.Content className="wg:min-w-0 wg:break-words">
        <Alert.Title>{t('diagnostics.resourceAttention')}</Alert.Title>
        <Alert.Description>{t('diagnostics.resourceDescription')}</Alert.Description>
        <ul className="wg:mt-2 wg:flex wg:flex-col wg:gap-2 wg:text-sm">
          {controllers.map((controller) => (
            <li key={controller.controllerId}>
              <Link href={`/wago/controllers/${controller.controllerId}/configuration`}>{controller.name}</Link>
              {controller.unavailable && <span>{t('diagnostics.controllerUnavailable')}</span>}
              {controller.referencesTruncated && <span>{t('diagnostics.lookupIncomplete')}</span>}
              {controller.nodes.length > 0 && (
                <ul className="wg:mt-1 wg:flex wg:flex-col wg:gap-1">
                  {controller.nodes.map((node) => (
                    <li key={node.nodeId}>
                      <Link href={node.href}>{node.nodeId}</Link>
                      {node.channelId && <span className="wg:text-muted"> ({node.channelId})</span>}:{' '}
                      {node.invalid && t('diagnostics.channelMissing')}
                      {node.invalid && node.conflict && '; '}
                      {node.conflict && (
                        <>
                          {t('diagnostics.alsoSwitched')}{' '}
                          {node.conflictResources.map((resource, index) => (
                            <span key={resource.id}>
                              {index > 0 && ', '}
                              <Link href={`/resources/${resource.id}`}>{resource.name}</Link>
                            </span>
                          ))}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {data.invalidControllerReferences > 0 && (
            <li>
              {t('diagnostics.invalidControllers', { count: data.invalidControllerReferences })}{' '}
              <Link href={`/resources/${resourceId}/flows`}>{t('diagnostics.openFlow')}</Link>
            </li>
          )}
          {data.truncated && <li>{t('diagnostics.tooMany')}</li>}
        </ul>
      </Alert.Content>
    </Alert>
  );
}
