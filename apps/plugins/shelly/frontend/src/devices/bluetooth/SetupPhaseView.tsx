// The drawer body for each phase of a Bluetooth setup.
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { BleDeviceInfo } from '../../bluetooth/provisioning';
import { DeviceSummary } from './DeviceSummary';
import { SetupForm } from './SetupForm';
import { SetupProgress } from './SetupProgress';
import { SetupResult } from './SetupResult';
import { SetupStartView } from './SetupStartView';
import type { SetupFormValues, SetupPhase } from './useSetupSession';

export function SetupPhaseView({
  phase,
  onSubmit,
}: {
  phase: SetupPhase;
  onSubmit: (info: BleDeviceInfo, values: SetupFormValues) => void;
}) {
  switch (phase.kind) {
    case 'start':
      return <SetupStartView connecting={false} error={phase.error} />;
    case 'connecting':
      return <SetupStartView connecting />;
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
      return (
        <>
          <SetupProgress
            statuses={phase.statuses}
            protectedDevice={Boolean(phase.info.auth_en)}
            disableBluetooth={phase.disableBluetooth}
          />
          {phase.kind === 'failed' && (
            <StatusAlert status="danger" title={phase.failure.title} data-cy="shelly-ble-failure">
              {phase.failure.detail}
            </StatusAlert>
          )}
        </>
      );
    case 'done':
      return <SetupResult outcome={phase.outcome} name={phase.name} passwordSet={!phase.info.auth_en} />;
  }
}
