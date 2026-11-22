// The drawer body for each phase of a Bluetooth setup.
import { Spinner } from '@heroui/react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { SetupFormValues } from './SetupForm';
import { DeviceSummary } from './DeviceSummary';
import { SetupForm } from './SetupForm';
import { SetupProgress } from './SetupProgress';
import { SetupResult } from './SetupResult';
import type { SetupPhase } from './useSetupSession';

function StartView({ phase }: { phase: Extract<SetupPhase, { kind: 'start' | 'connecting' }> }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:gap-3">
      <p className="sh:text-sm">{t('ble.start.intro')}</p>
      <p className="sh:text-sm sh:text-muted">{t('ble.start.hint')}</p>
      {phase.kind === 'start' && phase.error && (
        <StatusAlert status="danger" title={t('ble.connect.title')} data-cy="shelly-ble-connect-error">
          {phase.error}
        </StatusAlert>
      )}
      {phase.kind === 'connecting' && (
        <div className="sh:flex sh:items-center sh:gap-3 sh:text-sm sh:text-muted">
          <Spinner color="accent" size="sm" />
          {t('ble.start.connecting')}
        </div>
      )}
    </div>
  );
}

function ProgressView({ phase }: { phase: Extract<SetupPhase, { kind: 'running' | 'failed' }> }) {
  return (
    <>
      <SetupProgress
        statuses={phase.statuses}
        protectedDevice={Boolean(phase.info.auth_en)}
        disableBluetooth={phase.disableBluetooth}
      />
      {phase.kind === 'failed' && <StatusAlert status="danger" title={phase.message} data-cy="shelly-ble-failure" />}
    </>
  );
}

export function SetupPhaseView({
  phase,
  onSubmit,
}: {
  phase: SetupPhase;
  onSubmit: (info: Extract<SetupPhase, { kind: 'form' }>['info'], values: SetupFormValues) => void;
}) {
  switch (phase.kind) {
    case 'start':
    case 'connecting':
      return <StartView phase={phase} />;
    case 'form':
      return (
        <>
          <DeviceSummary info={phase.info} advertisedName={phase.advertisedName} />
          <SetupForm
            rpc={phase.rpc}
            info={phase.info}
            advertisedName={phase.advertisedName}
            onSubmit={(values) => onSubmit(phase.info, values)}
          />
        </>
      );
    case 'running':
    case 'failed':
      return <ProgressView phase={phase} />;
    case 'done':
      return <SetupResult outcome={phase.outcome} name={phase.name} passwordSet={!phase.info.auth_en} />;
  }
}
