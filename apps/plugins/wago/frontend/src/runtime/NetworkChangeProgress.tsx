import { Button } from '@attraccess/plugins-frontend-ui';
import { Label, ProgressBar } from '@heroui/react';
import type { NetworkChangeStatus } from '../api/client';
import { useWagoTranslations } from '../i18n';

type NetworkChangePhase = NonNullable<NetworkChangeStatus['operation']>['phase'];

interface NetworkChangeProgressProps {
  phase: NetworkChangePhase | undefined;
  busy: boolean;
  onRetry: () => void;
}

/** Progress of a pending network change, or the retry hint once it stopped. */
export function NetworkChangeProgress({ phase, busy, onRetry }: NetworkChangeProgressProps) {
  const { t } = useWagoTranslations();
  return (
    <>
      {busy ? (
        <ProgressBar isIndeterminate size="sm">
          <Label>{t(`networkChange.phases.${phase ?? 'connecting'}`)}</Label>
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : (
        <p role="status">{t('networkChange.retryDescription')}</p>
      )}
      <Button variant="secondary" isDisabled={busy} onPress={onRetry}>
        {t('networkChange.retry')}
      </Button>
    </>
  );
}
