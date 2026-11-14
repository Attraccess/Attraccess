import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Chip } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from './api';
import { restoreBlocker } from './blockers';
import { Field } from './Field';

/** The leading and trailing hex digits are enough to tell certificates apart; the whole value is one click away. */
export const shortFingerprint = (value: string) =>
  value.length > 28 ? `${value.slice(0, 16)}…${value.slice(-8)}` : value;

function stateChip(status: FabricBackupStatus): { color: 'danger' | 'success' | 'warning' | 'default'; key: string } {
  if (status.recovery.required) return { color: 'danger', key: 'recovery_required' };
  if (!status.sidecar.reachable) return { color: 'default', key: 'unknown' };
  if (status.sidecar.state === 'initialized') return { color: 'success', key: 'initialized' };
  if (status.sidecar.state === 'recovery_required') return { color: 'danger', key: 'recovery_required' };
  return { color: 'warning', key: status.sidecar.state };
}

/** The shortened fingerprint, with the whole value as tooltip and behind a toggle (keyboard and touch reachable). */
function Fingerprint({ value }: Readonly<{ value: string }>) {
  const { t } = useMatterTranslations();
  const [full, setFull] = useState(false);
  const short = shortFingerprint(value);
  return (
    <span className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
      <span title={value} className="mt:font-mono" data-cy="matter-fabric-fingerprint">
        {full ? value : short}
      </span>
      {short !== value && (
        <Button
          size="sm"
          variant="tertiary"
          aria-expanded={full}
          onPress={() => setFull(!full)}
          data-cy="matter-fabric-fingerprint-toggle"
        >
          {full ? t('fabric.fingerprintShowShort') : t('fabric.fingerprintShowFull')}
        </Button>
      )}
    </span>
  );
}

function RecoveryAlert({ status }: Readonly<{ status: FabricBackupStatus }>) {
  const { t, tExists } = useMatterTranslations();
  const { mismatch } = status.recovery;
  const { reason } = status.sidecar;
  const reasonKey = `fabric.storageReason.${reason}`;
  return (
    <StatusAlert status="danger" title={t('fabric.recoveryRequired')} data-cy="matter-fabric-mismatch">
      {t(`fabric.mismatch.${mismatch ?? 'unknown'}`)}
      {reason && (
        <span className="mt:mt-1 mt:block mt:text-sm">
          {t('fabric.reason')}: {tExists(reasonKey) ? t(reasonKey) : reason}
        </span>
      )}
    </StatusAlert>
  );
}

type CreateProps = Readonly<{ status: FabricBackupStatus; busy: boolean; creating: boolean } & Handlers>;
type Handlers = { onCreate: () => void; onRestore: () => void };

/** Create the fabric, or restore one instead, on a connected sidecar without a fabric. */
function CreateActions({ status, busy, creating, onCreate, onRestore }: CreateProps) {
  const { t } = useMatterTranslations();
  const blocker = restoreBlocker(status);
  return (
    <div>
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <Button isDisabled={busy} isPending={creating} onPress={onCreate} data-cy="matter-fabric-create">
          {t('fabric.create')}
        </Button>
        <Button
          variant="secondary"
          isDisabled={busy || blocker !== null}
          onPress={onRestore}
          data-cy="matter-restore-open-empty"
        >
          {t('fabric.restore.open')}
        </Button>
      </div>
      <p className="mt:mt-1 mt:text-sm mt:text-muted">{t('fabric.createHint')}</p>
      <p className="mt:text-sm mt:text-muted">
        {blocker ? t(`fabric.blocked.${blocker}`) : t('fabric.restoreInstead')}
      </p>
    </div>
  );
}

/** Fabric identity and state as the sidecar reports it, with what Attraccess recorded while they disagree. */
export function FabricStatusCard(props: CreateProps) {
  const { status } = props;
  const { t } = useMatterTranslations();
  const chip = stateChip(status);
  const { sidecar, recovery, actions } = status;
  const uninitialized = sidecar.reachable && sidecar.state === 'uninitialized' && !recovery.required;
  return (
    <Card data-cy="matter-fabric-card">
      <Card.Header>
        <Card.Title>{t('fabric.statusTitle')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-4">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <Chip color={chip.color} variant="soft" data-cy="matter-fabric-state">
            {t(`fabric.state.${chip.key}`)}
          </Chip>
        </div>
        {!sidecar.reachable && (
          <StatusAlert status="warning" title={t('fabric.unreachable')}>
            {t('fabric.unreachableText')}
          </StatusAlert>
        )}
        {recovery.required && <RecoveryAlert status={status} />}
        {uninitialized && <p data-cy="matter-fabric-uninitialized">{t('fabric.uninitializedText')}</p>}
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
          <Field label={t('fabric.fabricId')}>{sidecar.fabricId ?? t('fabric.none')}</Field>
          <Field label={t('fabric.generationLabel')}>{sidecar.fabricGeneration ?? t('fabric.none')}</Field>
          <Field label={t('fabric.fingerprint')}>
            {sidecar.rootCertFingerprint ? <Fingerprint value={sidecar.rootCertFingerprint} /> : t('fabric.none')}
          </Field>
          <Field label={t('fabric.storageInstance')}>{sidecar.storageInstanceId ?? t('fabric.none')}</Field>
        </dl>
        {recovery.required && status.recorded && (
          <div data-cy="matter-fabric-recorded">
            <p className="mt:mb-1 mt:text-sm mt:font-medium">{t('fabric.recorded')}</p>
            <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
              <Field label={t('fabric.fabricId')}>{status.recorded.fabricId ?? t('fabric.none')}</Field>
              <Field label={t('fabric.generationLabel')}>{status.recorded.fabricGeneration ?? t('fabric.none')}</Field>
            </dl>
          </div>
        )}
        {uninitialized && actions.canCreateFabric && <CreateActions {...props} />}
      </Card.Content>
    </Card>
  );
}
