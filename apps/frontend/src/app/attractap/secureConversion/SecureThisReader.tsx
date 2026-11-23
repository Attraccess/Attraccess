import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
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
  // Without the permission the server answers only whether the action exists, with `missing-permission`.
  const eligibility = useGetSecureConversionEligibility(path, undefined, { refetchInterval: IDLE_POLL_MS });
  const status = useGetSecureConversionStatus(path, undefined, {
    enabled: canManage,
    refetchInterval: (query) =>
      runningIn(query.state.data as SecureConversionStatusDto | undefined) ? POLL_INTERVAL_MS : IDLE_POLL_MS,
  });

  if (!canManage) {
    if (!eligibility.data || eligibility.data.hidden) return null;
    return (
      <SecureConversionSection>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-default-500">{t('description')}</p>
          <SecureReaderButton blockers={eligibility.data.blockers} onPress={() => undefined} />
        </div>
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
  const noSigningKey = status.data?.signingKeyAvailable === false;
  const showButton = !eligibility.data?.hidden && !runningIn(status.data) && !reader.secured;
  const showProgress = !!conversion && (conversion.state as string) !== 'cancelled';
  // A secured reader without a conversion to show has nothing here: no empty heading.
  if (!noSigningKey && !showButton && !showProgress) return null;

  return (
    <SecureConversionSection>
      {noSigningKey && (
        <StatusAlert status="danger" title={t('noSigningKey')} data-cy="secure-conversion-no-signing-key">
          {t('noSigningKeyHint')}
        </StatusAlert>
      )}
      {status.data && <ConversionProgress readerId={reader.id} status={status.data} onChanged={refresh} />}
      {showButton && (
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
