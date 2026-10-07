import { Alert } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { Button } from '@heroui/react';
import { Input } from '@heroui/react';
import { Label } from '@heroui/react';
import { TextField } from '@heroui/react';
import type { CommissioningSession } from './api';
import { ProgressBar } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { useCommissioningVerification } from './useCommissioningVerification';
import { CommissioningStatusPanel } from './CommissioningModal.commissioning-status-panel.helpers';

export function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useWagoTranslations();
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{error instanceof Error ? error.message : t('common.retry')}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
export function formatActivity(event: string): string {
  return event.replace(/^progress: /, '').replaceAll('_', ' ');
}

export function HostKeyConfirmationStep({
  fingerprint,
  expectedFingerprint,
  onFingerprintChange,
  onConfirm,
}: {
  fingerprint: string;
  expectedFingerprint: string;
  onFingerprintChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <details>
      <summary>{t('commissioningUI.trustedFingerprint')}</summary>
      <p className="wg:break-all wg:text-sm">{t('commissioningUI.scannedKey', { fingerprint: expectedFingerprint })}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>{t('commissioningUI.reviewedKey')}</Label>
        <Input value={fingerprint} onChange={(event) => onFingerprintChange(event.target.value)} />
      </TextField>
      <Button variant="secondary" isDisabled={!fingerprint || fingerprint !== expectedFingerprint} onPress={onConfirm}>
        {t('commissioningUI.confirmKey')}
      </Button>
    </details>
  );
}

export function latestCommissioningSession(...candidates: Array<CommissioningSession | null | undefined>) {
  return candidates.reduce<CommissioningSession | null>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest || (Date.parse(candidate.updatedAt) || 0) > (Date.parse(latest.updatedAt) || 0)) return candidate;
    return latest;
  }, null);
}

export function NameStep({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
  const { t } = useWagoTranslations();
  return (
    <TextField isRequired name="controller-name">
      <Label>{t('claim.name')}</Label>
      <Input
        autoFocus
        value={name}
        placeholder={t('commissioningUI.namePlaceholder')}
        onChange={(event) => onNameChange(event.target.value)}
      />
    </TextField>
  );
}

export function OperationStatus({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-3">
      <div className="wg:flex wg:items-center wg:gap-2">
        <Spinner color="accent" size="sm" />
        <p className="wg:text-sm wg:font-medium">{title}</p>
      </div>
      <p className="wg:mt-1 wg:text-xs wg:text-muted">{description}</p>
      <ProgressBar className="wg:mt-3" aria-label={title} isIndeterminate size="sm">
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}
export function parseActivityLog(auditLog: string): Array<{ at: string; event: string }> {
  try {
    const entries = JSON.parse(auditLog) as Array<{ at?: unknown; event?: unknown }>;
    return entries
      .filter(
        (entry): entry is { at: string; event: string } =>
          typeof entry.at === 'string' && typeof entry.event === 'string',
      )
      .slice(-5);
  } catch {
    return [];
  }
}

export function ProgressStep({ session }: { name: string; session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const complete =
    verification.enrollmentComplete ||
    ['completed', 'revoked', 'claim_interrupted', 'recovery_revocation_pending'].includes(session.state);
  const progress = verification.enrollmentComplete
    ? {
        ...session,
        progressStep: t('commissioningUI.enrollmentComplete'),
        progressDetail: verification.runtimeVerified
          ? t('commissioningUI.verifiedDescription')
          : t('commissioningUI.setupPendingDescription'),
      }
    : session;
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={!complete} session={progress} />
      <div className="wg:rounded-large wg:border wg:border-default-200 wg:p-4 wg:text-sm">
        <p className="wg:font-medium">{t('commissioningUI.safeToClose')}</p>
        <p className="wg:mt-1 wg:text-muted">{t('commissioningUI.savedDescription')}</p>
      </div>
      {session.failureReason && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.lastSetupFailure')}</Alert.Title>
            <Alert.Description>{tBackendMessage(session.failureReason)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
