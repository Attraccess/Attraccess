import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { MatterNodeSummary } from './api';
import { softwareLabel } from './nodeLabel';

function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:min-w-0 mt:flex-col">
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-words">{children}</dd>
    </div>
  );
}

/** What the device reports about itself: vendor, product, serial, versions and attestation. Read-only. */
export function IdentityCard({ node }: Readonly<{ node: MatterNodeSummary }>) {
  const { t, tExists } = useMatterTranslations();
  const { identity } = node;
  const unknown = t('devices.unknown');
  const attestation = identity.attestation.status;
  return (
    <Card data-cy="matter-identity">
      <Card.Header>
        <Card.Title>{t('devices.identity.title')}</Card.Title>
      </Card.Header>
      <Card.Content>
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:text-sm mt:sm:grid-cols-2">
          <Fact label={t('devices.identity.vendor')}>{identity.vendorName ?? unknown}</Fact>
          <Fact label={t('devices.identity.product')}>{identity.productName ?? unknown}</Fact>
          <Fact label={t('devices.identity.serial')}>{identity.serialNumber ?? unknown}</Fact>
          <Fact label={t('devices.identity.software')}>{softwareLabel(identity) ?? unknown}</Fact>
          <Fact label={t('devices.identity.hardware')}>{identity.hardwareVersion ?? unknown}</Fact>
          <Fact label={t('devices.identity.attestation')}>
            {attestation === null
              ? unknown
              : tExists(`devices.attestation.${attestation}`)
                ? t(`devices.attestation.${attestation}`)
                : attestation}
          </Fact>
          <Fact label={t('devices.lastSeen')}>
            <DateTimeDisplay date={node.lastSeenAt} />
          </Fact>
          <Fact label={t('devices.identity.firstSeen')}>
            <DateTimeDisplay date={node.firstSeenAt} />
          </Fact>
        </dl>
      </Card.Content>
    </Card>
  );
}
