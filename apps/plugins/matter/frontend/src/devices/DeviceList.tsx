import { EmptyState, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { useMatterPermissions } from '../permissions';
import { LifecycleFilter, matchesFilter, type LifecycleFilterValue } from './LifecycleFilter';
import { NodeCard } from './NodeCard';
import { RetryButton } from './RetryButton';
import { nodeLabel, sortNodes } from './nodeLabel';
import { ReconciliationCard } from './ReconciliationCard';
import { useNodes } from './useNodes';
import { useReconciliation } from './useReconciliation';

/**
 * The Devices tab's list: the lifecycle filter (active states by default, archived and removed on request), devices
 * that need a decision first, and the reconciliation status. Loading, empty and error states are its own: a failing
 * list never touches the rest of the page.
 */
export function DeviceList() {
  const { t } = useMatterTranslations();
  const { canRead, canManage } = useMatterPermissions();
  const [filter, setFilter] = useState<LifecycleFilterValue>('active');
  const [includeInactive, setIncludeInactive] = useState(false);
  const nodes = useNodes(includeInactive, canRead);
  const reconciliation = useReconciliation(canRead);

  const label = (node: Parameters<typeof nodeLabel>[0]) =>
    nodeLabel(node, (nodeId) => t('devices.nodeFallback', { nodeId }));
  const shown = sortNodes(
    (nodes.data ?? []).filter((node) => matchesFilter(node.lifecycleState, filter, includeInactive)),
    label,
  );

  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-device-list">
      <LifecycleFilter
        value={filter}
        includeInactive={includeInactive}
        onChange={setFilter}
        onIncludeInactiveChange={(include) => {
          setIncludeInactive(include);
          if (!include && (filter === 'archived' || filter === 'removed')) setFilter('active');
        }}
      />
      {nodes.stale && (
        <StatusAlert status="warning" title={t('devices.stale.title')} data-cy="matter-devices-stale">
          {t('devices.stale.text')}
        </StatusAlert>
      )}
      {nodes.loading && <Spinner data-cy="matter-devices-loading" />}
      {nodes.error && (
        <StatusAlert status="danger" title={t('devices.loadError')} data-cy="matter-devices-error">
          <span className="mt:block">{nodes.error}</span>
          <RetryButton onRetry={nodes.refetch} data-cy="matter-devices-retry" />
        </StatusAlert>
      )}
      {!nodes.loading && !nodes.error && shown.length === 0 && (
        <div data-cy="matter-devices-empty">
          <EmptyState message={t('devices.empty')} />
        </div>
      )}
      <ul className="mt:flex mt:flex-col mt:gap-3">
        {shown.map((node) => (
          <li key={node.id}>
            <NodeCard node={node} canManage={canManage} onChanged={() => void nodes.refetch()} />
          </li>
        ))}
      </ul>
      <ReconciliationCard resource={reconciliation} canManage={canManage} />
    </div>
  );
}
