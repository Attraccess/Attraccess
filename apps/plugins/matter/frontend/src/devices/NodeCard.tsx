import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { Button, Card } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useMatterTranslations } from '../i18n';
import { matterDevicePath } from '../matterPaths';
import type { MatterNodeSummary } from './api';
import { LifecycleActions } from './LifecycleActions';
import { LifecycleChip } from './LifecycleChip';
import { needsResolution, nodeLabel, softwareLabel } from './nodeLabel';
import { ReachabilityChip } from './ReachabilityChip';
import { ResolutionCallout } from './ResolutionCallout';

function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:min-w-0 mt:flex-col">
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-words">{children}</dd>
    </div>
  );
}

/**
 * One device in the list. An unclaimed or detached device carries its explanation and only the actions that resolve
 * it; a claimed one just opens its details. Nothing here sends a command.
 */
export function NodeCard({
  node,
  canManage,
  onChanged,
}: Readonly<{
  node: MatterNodeSummary;
  canManage: boolean;
  onChanged: () => void;
}>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  const name = nodeLabel(node, (nodeId) => t('devices.nodeFallback', { nodeId }));
  const { identity } = node;
  const software = softwareLabel(identity);
  const vendorProduct = [identity.vendorName, identity.productName].filter(Boolean).join(' / ');
  return (
    <Card data-cy={`matter-node-${node.lifecycleState}`} data-node-id={node.id}>
      <Card.Content className="mt:flex mt:flex-col mt:gap-3">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <h3 className="mt:min-w-0 mt:break-words mt:text-base mt:font-semibold" data-cy="matter-node-name">
            {name}
          </h3>
          <LifecycleChip state={node.lifecycleState} />
          {node.lifecycleState !== 'removed' && <ReachabilityChip reachable={node.reachable} />}
        </div>
        <ResolutionCallout node={node} />
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:text-sm mt:sm:grid-cols-2 mt:md:grid-cols-4">
          <Fact label={t('devices.vendorProduct')}>{vendorProduct || t('devices.unknown')}</Fact>
          <Fact label={t('devices.software')}>
            <span data-cy="matter-node-software">
              {software ?? t('devices.unknown')}
              {identity.hardwareVersion !== null && (
                <span className="mt:block mt:text-muted">{t('devices.hardware', { version: identity.hardwareVersion })}</span>
              )}
            </span>
          </Fact>
          <Fact label={t('devices.endpoints')}>{node.endpointCount ?? '–'}</Fact>
          <Fact label={t('devices.lastSeen')}>
            <DateTimeDisplay date={node.lastSeenAt} />
          </Fact>
        </dl>
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          {canManage && needsResolution(node.lifecycleState) && (
            <LifecycleActions node={node} onChanged={onChanged} name={name} />
          )}
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => navigate(matterDevicePath(node.id))}
            data-cy="matter-node-open"
          >
            {t('devices.details')}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
