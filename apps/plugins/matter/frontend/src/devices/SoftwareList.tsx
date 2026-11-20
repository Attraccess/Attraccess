import { EmptyState, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Spinner } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import { nodeLabel, softwareLabel } from './nodeLabel';
import { useNodes } from './useNodes';

/** The current software of every device, from the inventory. Update availability comes with OTA (ATT-1015). */
export function SoftwareList({ enabled }: Readonly<{ enabled: boolean }>) {
  const { t } = useMatterTranslations();
  const nodes = useNodes(false, enabled);
  const rows = (nodes.data ?? []).filter((node) => node.lifecycleState !== 'archived' && node.lifecycleState !== 'removed');
  return (
    <Card data-cy="matter-software-list">
      <Card.Header>
        <Card.Title>{t('updates.currentTitle')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-3">
        {nodes.loading && <Spinner size="sm" />}
        {nodes.error && (
          <StatusAlert status="danger" title={t('devices.loadError')} data-cy="matter-software-error">
            {nodes.error}
          </StatusAlert>
        )}
        {!nodes.loading && !nodes.error && rows.length === 0 && <EmptyState message={t('devices.empty')} />}
        <ul className="mt:flex mt:flex-col mt:divide-y mt:divide-separator">
          {rows.map((node) => (
            <li key={node.id} className="mt:flex mt:flex-wrap mt:justify-between mt:gap-x-4 mt:py-2" data-cy="matter-software-row">
              <span className="mt:min-w-0 mt:break-words">
                {nodeLabel(node, (nodeId) => t('devices.nodeFallback', { nodeId }))}
              </span>
              <span className="mt:text-sm mt:text-muted">
                {softwareLabel(node.identity) ?? t('devices.unknown')}
                {node.identity.hardwareVersion !== null && (
                  <> · {t('devices.hardware', { version: node.identity.hardwareVersion })}</>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card>
  );
}
