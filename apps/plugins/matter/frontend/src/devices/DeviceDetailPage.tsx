import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Button, Spinner } from '@heroui/react';
import { ArrowLeftIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Fact } from '../Fact';
import { useMatterTranslations } from '../i18n';
import { matterTabPath } from '../matterPaths';
import { useMatterPermissions } from '../permissions';
import { updateEndpoint, updateNode } from './api';
import { AdministratorsSection } from './AdministratorsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { EndpointTree } from './EndpointTree';
import { IdentityCard } from './IdentityCard';
import { LifecycleActions } from './LifecycleActions';
import { LifecycleChip } from './LifecycleChip';
import { MetadataForm } from './MetadataForm';
import { needsResolution } from './lifecycle';
import { nodeLabel } from './nodeLabel';
import { RemoveFromFabric } from './RemoveFromFabric';
import { RemovedNotice } from './RemovedNotice';
import { RetryButton } from './RetryButton';
import { ReachabilityChip } from './ReachabilityChip';
import { ResolutionCallout } from './ResolutionCallout';
import { ShareSection } from './ShareSection';
import { useNodeDetail } from './useNodeDetail';

/**
 * `/matter/devices/:nodeId`: one device as a full page with a way back to the list. Identity, editable metadata
 * (manage, and only for a claimed device), the endpoint tree, lifecycle actions and a collapsed Diagnostics section.
 * An unclaimed or detached device shows its callout and only the actions that resolve it; it is not editable, and its
 * endpoints are shown read-only.
 */
export function DeviceDetailPage({ nodeId }: Readonly<{ nodeId: string }>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  const { canRead, canManage, canCommission } = useMatterPermissions();
  const detail = useNodeDetail(nodeId, canRead);
  const node = detail.data;

  const back = (
    <div>
      <Button
        variant="tertiary"
        size="sm"
        onPress={() => navigate(matterTabPath('devices'))}
        data-cy="matter-back-to-devices"
      >
        <ArrowLeftIcon className="mt:h-4 mt:w-4" />
        {t('devices.back')}
      </Button>
    </div>
  );

  if (detail.loading) {
    return (
      <div className="mt:flex mt:flex-col mt:gap-4">
        {back}
        <Spinner data-cy="matter-device-loading" />
      </div>
    );
  }
  if (!node) {
    return (
      <div className="mt:flex mt:flex-col mt:gap-4">
        {back}
        <StatusAlert status="danger" title={t('devices.detailError')} data-cy="matter-device-error">
          <span className="mt:block">{detail.error}</span>
          <RetryButton onRetry={detail.refetch} data-cy="matter-device-retry" />
        </StatusAlert>
      </div>
    );
  }

  const name = nodeLabel(node, (id) => t('devices.nodeFallback', { nodeId: id }));
  const editable = canManage && node.lifecycleState === 'claimed';
  const usable = !needsResolution(node.lifecycleState);
  const refreshed = <T,>(action: Promise<T>) => action.then(async (result) => (await detail.refetch(), result));

  return (
    <div className="mt:flex mt:min-w-0 mt:flex-col mt:gap-4" data-cy="matter-device-detail">
      {back}
      <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
        <h2 className="mt:min-w-0 mt:break-words mt:text-xl mt:font-semibold" data-cy="matter-device-name">
          {name}
        </h2>
        <LifecycleChip state={node.lifecycleState} />
        {node.lifecycleState !== 'removed' && <ReachabilityChip reachable={node.reachable} />}
      </div>
      {detail.error && (
        <StatusAlert status="warning" title={t('devices.refreshError')} data-cy="matter-device-refresh-error">
          {detail.error}
        </StatusAlert>
      )}
      {detail.stale && (
        <StatusAlert status="warning" title={t('devices.stale.title')} data-cy="matter-device-stale">
          {t('devices.stale.text')}
        </StatusAlert>
      )}
      <ResolutionCallout node={node} />
      <RemovedNotice node={node} />
      {canManage && (
        <LifecycleActions
          node={node}
          name={name}
          onChanged={() => {
            void detail.refetch();
          }}
        />
      )}
      {canCommission && node.lifecycleState !== 'removed' && (
        <RemoveFromFabric
          nodeRecordId={node.id}
          name={name}
          onChanged={() => {
            void detail.refetch();
          }}
        />
      )}
      <IdentityCard node={node} />
      {canCommission && node.lifecycleState === 'claimed' && <ShareSection nodeRecordId={node.id} name={name} />}
      <AdministratorsSection administrators={node.administrators ?? []} />
      {/* Not a Card: form fields share the Card's fill and would be invisible (ATT-294 / ATT-834). */}
      <section
        className="mt:flex mt:flex-col mt:gap-3 mt:rounded-xl mt:border mt:border-separator mt:p-4"
        data-cy="matter-metadata"
      >
        <h3 className="mt:font-semibold">{t('devices.metadata.title')}</h3>
        <div>
          {editable ? (
            <MetadataForm
              value={node.metadata}
              fields={['displayName', 'description', 'location']}
              idPrefix="matter-node"
              onSave={(changes) => refreshed(updateNode(node.id, changes))}
            />
          ) : (
            <dl
              className="mt:grid mt:grid-cols-1 mt:gap-3 mt:text-sm mt:sm:grid-cols-3"
              data-cy="matter-metadata-readonly"
            >
              {(['displayName', 'description', 'location'] as const).map((field) => (
                <Fact key={field} label={t(`devices.metadata.${field}`)}>
                  {node.metadata[field] ?? '–'}
                </Fact>
              ))}
            </dl>
          )}
          {!usable && (
            <p className="mt:mt-2 mt:text-sm mt:text-muted" data-cy="matter-metadata-resolve-first">
              {t(node.lifecycleState === 'unclaimed' ? 'devices.metadata.claimFirst' : 'devices.metadata.resolveFirst')}
            </p>
          )}
        </div>
      </section>
      {/* Read-only for an unclaimed or detached device: it helps decide how to resolve it, but nothing is editable. */}
      <section className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-endpoints">
        <h3 className="mt:text-lg mt:font-semibold">{t('devices.endpoint.title')}</h3>
        <EndpointTree
          endpoints={node.endpoints}
          bridgeName={name}
          canEdit={editable}
          canRead={canRead}
          showFlowUsage={usable}
          onRename={(endpointRef, changes) => refreshed(updateEndpoint(endpointRef, changes))}
        />
      </section>
      <DiagnosticsSection node={node} />
    </div>
  );
}
