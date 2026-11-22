import { Spinner } from '@heroui/react';
import { CheckCircle2Icon, CircleDashedIcon, MinusCircleIcon, XCircleIcon } from 'lucide-react';
import { useShellyTranslations } from '../../i18n';
import type { SetupStep } from '../../bluetooth/errors';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

const ORDER: SetupStep[] = ['password', 'wifi', 'join', 'register', 'bluetooth'];

export function SetupProgress({
  statuses,
  protectedDevice,
  disableBluetooth,
}: {
  statuses: Partial<Record<SetupStep, StepStatus>>;
  protectedDevice: boolean;
  disableBluetooth: boolean;
}) {
  const { t } = useShellyTranslations();
  const steps = disableBluetooth ? ORDER : ORDER.filter((step) => step !== 'bluetooth');
  return (
    <ol className="sh:flex sh:flex-col sh:gap-2" data-cy="shelly-ble-steps">
      {steps.map((step) => {
        const status = statuses[step] ?? 'pending';
        const label = step === 'password' && protectedDevice ? t('ble.steps.passwordCheck') : t(`ble.steps.${step}`);
        return (
          <li
            key={step}
            className="sh:flex sh:items-center sh:gap-3 sh:text-sm"
            data-cy={`shelly-ble-step-${step}`}
            data-status={status}
          >
            <StepIcon status={status} />
            <span className={status === 'pending' ? 'sh:text-muted' : undefined}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const cls = 'sh:h-5 sh:w-5 sh:shrink-0';
  if (status === 'running') return <Spinner color="accent" size="sm" />;
  if (status === 'done') return <CheckCircle2Icon className={`${cls} sh:text-success`} />;
  if (status === 'failed') return <XCircleIcon className={`${cls} sh:text-danger`} />;
  if (status === 'skipped') return <MinusCircleIcon className={`${cls} sh:text-muted`} />;
  return <CircleDashedIcon className={`${cls} sh:text-muted`} />;
}
