import { Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { MatterEndpointView } from './api';
import { ReachabilityChip } from './ReachabilityChip';

/**
 * The bridge relation of an endpoint, from the data the sidecar reports: a bridged device says which bridge it sits
 * behind, what it reports itself as, and whether the bridge reaches it; an aggregator is the bridge itself. Full
 * compound semantics come with ATT-1007.
 */
export function BridgeInfo({ endpoint, bridgeName }: Readonly<{ endpoint: MatterEndpointView; bridgeName: string }>) {
  const { t } = useMatterTranslations();
  if (endpoint.profile === 'bridge_aggregator') {
    return (
      <Chip variant="soft" color="accent" data-cy="matter-bridge-aggregator">
        {t('devices.bridge.aggregator')}
      </Chip>
    );
  }
  if (!endpoint.bridged) return null;
  const { nodeLabel, productName, vendorName } = endpoint.bridged;
  const reportedAs = nodeLabel ?? ([vendorName, productName].filter(Boolean).join(' ') || null);
  return (
    <span className="mt:flex mt:flex-wrap mt:items-center mt:gap-2 mt:text-sm" data-cy="matter-bridge-behind">
      <span>{t('devices.bridge.behind', { bridge: bridgeName })}</span>
      {reportedAs && (
        <span className="mt:text-muted" data-cy="matter-bridged-as">
          {t('devices.bridge.reportedAs', { name: reportedAs })}
        </span>
      )}
      <ReachabilityChip reachable={endpoint.bridged.reachable} />
    </span>
  );
}
