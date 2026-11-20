import { Card, Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { MatterEndpointDetail } from './api';
import { BridgeInfo } from './BridgeInfo';
import type { EndpointCardOptions } from './EndpointTreeProps';
import { FlowUsage } from './FlowUsage';
import { MetadataForm } from './MetadataForm';
import { StateEntries } from './StateEntries';

/**
 * One endpoint: its name (editable with `canEdit`), the profile as a human label, the bridge relation, the current
 * state and its flow usage. Raw device types and cluster IDs are in the Diagnostics section, not here.
 */
export function EndpointCard({
  endpoint,
  bridgeName,
  canEdit,
  canRead,
  showFlowUsage,
  onRename,
}: Readonly<{ endpoint: MatterEndpointDetail } & EndpointCardOptions>) {
  const { t } = useMatterTranslations();
  const title = endpoint.metadata.displayName ?? t('devices.endpoint.number', { number: endpoint.endpointId });
  return (
    <Card data-cy="matter-endpoint" data-endpoint-id={endpoint.endpointId}>
      <Card.Content className="mt:flex mt:flex-col mt:gap-3">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <h4 className="mt:min-w-0 mt:break-words mt:font-semibold" data-cy="matter-endpoint-name">
            {title}
          </h4>
          <Chip size="sm" variant="soft" data-cy="matter-endpoint-profile">
            {t(`profile.${endpoint.profile}`)}
          </Chip>
        </div>
        <BridgeInfo endpoint={endpoint} bridgeName={bridgeName} />
        {canEdit && (
          <MetadataForm
            value={endpoint.metadata}
            fields={['displayName']}
            idPrefix={`matter-endpoint-${endpoint.endpointId}`}
            onSave={(changes) => onRename(endpoint.id, changes)}
          />
        )}
        <StateEntries endpointRef={endpoint.id} enabled={canRead} />
        {showFlowUsage && <FlowUsage endpointRef={endpoint.id} />}
      </Card.Content>
    </Card>
  );
}
