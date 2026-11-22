import { useShellyTranslations } from '../../i18n';
import type { SetupStep } from '../../bluetooth/errors';
import { SetupStepIcon } from './SetupStepIcon';
import type { StepStatuses } from './useSetupSession';

const ORDER: SetupStep[] = ['password', 'wifi', 'join', 'register', 'bluetooth'];

export function SetupProgress({
  statuses,
  protectedDevice,
  disableBluetooth,
}: {
  statuses: StepStatuses;
  protectedDevice: boolean;
  disableBluetooth: boolean;
}) {
  const { t } = useShellyTranslations();
  const steps = disableBluetooth ? ORDER : ORDER.filter((step) => step !== 'bluetooth');
  return (
    <ol className="sh:flex sh:flex-col sh:gap-2" aria-live="polite" data-cy="shelly-ble-steps">
      {steps.map((step) => {
        const status = statuses[step] ?? 'pending';
        const label = step === 'password' && protectedDevice ? t('ble.steps.passwordCheck') : t(`ble.steps.${step}`);
        return (
          <li
            key={step}
            className="sh:flex sh:items-center sh:gap-3 sh:text-sm"
            aria-current={status === 'running' ? 'step' : undefined}
            data-cy={`shelly-ble-step-${step}`}
            data-status={status}
          >
            <SetupStepIcon status={status} />
            <span className={status === 'pending' ? 'sh:text-muted' : undefined}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
