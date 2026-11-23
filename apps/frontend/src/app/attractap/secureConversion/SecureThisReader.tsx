import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useGetFirmwares,
  useGetSecureConversionEligibility,
  useGetSecureConversionStatus,
  type Attractap,
  type SecureConversionStatusDto,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { ConversionProgress } from './ConversionProgress';
import { isRunning, POLL_INTERVAL_MS } from './conversionStates';
import { SecureConversionSection } from './SecureConversionSection';
import { SecureReaderButton } from './SecureReaderButton';
import { SecureReaderRiskDialog } from './SecureReaderRiskDialog';
import { SecureReaderStartModal } from './SecureReaderStartModal';
import de from './de.json';
import en from './en.json';

const IDLE_POLL_MS = 10_000;

const runningIn = (status: SecureConversionStatusDto | undefined) =>
  !!status?.conversion && isRunning(status.conversion.state);

/**
 * "Secure this reader" in the reader editor's security area. Hidden entirely while the reader's variant is not
 * hardware-tested; otherwise the button is disabled with the reason for every gate the server reports.
 */
export function SecureThisReader(props: Readonly<{ reader: Attractap }>) {
  const { reader } = props;
  const { t } = useTranslations({ de, en });
  const { hasPermission } = useAuth();
  const canManage = hasPermission('system.settings.manage');
  const [step, setStep] = useState<'idle' | 'risk' | 'start'>('idle');

  const path = { path: { id: reader.id } };
  const eligibility = useGetSecureConversionEligibility(path, undefined, {
    enabled: canManage,
    refetchInterval: IDLE_POLL_MS,
  });
  const status = useGetSecureConversionStatus(path, undefined, {
    enabled: canManage,
    refetchInterval: (query) =>
      runningIn(query.state.data as SecureConversionStatusDto | undefined) ? POLL_INTERVAL_MS : IDLE_POLL_MS,
  });
  // Without the permission the gates cannot be asked; the catalog still tells whether the action exists at all.
  const { data: firmwares } = useGetFirmwares(undefined, undefined, { enabled: !canManage });

  if (!canManage) {
    const tested = firmwares?.some(
      (firmware) =>
        firmware.name === reader.firmware.name &&
        firmware.variant === reader.firmware.variant &&
        firmware.secureProfileHardwareTested === true,
    );
    if (!tested) return null;
    return (
      <SecureConversionSection>
        <SecureReaderButton blockers={['missing-permission']} onPress={() => undefined} />
      </SecureConversionSection>
    );
  }

  if (eligibility.isLoading || status.isLoading) {
    return <Spinner size="sm" aria-label={t('loading')} />;
  }
  const conversion = status.data?.conversion ?? null;
  // A conversion that already ran stays visible (its outcome matters), even if the variant is hidden again.
  if (eligibility.data?.hidden && !conversion) return null;

  const refresh = () => {
    void status.refetch();
    void eligibility.refetch();
  };
  const blockers = eligibility.data?.blockers ?? [];

  return (
    <SecureConversionSection>
      {status.data?.signingKeyAvailable === false && (
        <StatusAlert status="danger" title={t('noSigningKey')} data-cy="secure-conversion-no-signing-key">
          {t('noSigningKeyHint')}
        </StatusAlert>
      )}
      {status.data && <ConversionProgress readerId={reader.id} status={status.data} onChanged={refresh} />}
      {!eligibility.data?.hidden && !runningIn(status.data) && !reader.secured && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-default-500">{t('description')}</p>
          <SecureReaderButton blockers={blockers} onPress={() => setStep('risk')} />
        </div>
      )}
      <SecureReaderRiskDialog
        isOpen={step === 'risk'}
        onClose={() => setStep('idle')}
        onContinue={() => setStep('start')}
      />
      {step === 'start' && (
        <SecureReaderStartModal
          isOpen
          reader={reader}
          onClose={() => setStep('idle')}
          onStarted={() => {
            setStep('idle');
            refresh();
          }}
        />
      )}
    </SecureConversionSection>
  );
}
