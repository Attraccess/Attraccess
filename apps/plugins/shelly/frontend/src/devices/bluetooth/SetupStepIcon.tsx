import { Spinner } from '@heroui/react';
import { CheckCircle2Icon, CircleDashedIcon, MinusCircleIcon, XCircleIcon } from 'lucide-react';
import { useShellyTranslations } from '../../i18n';
import type { StepStatus } from './useSetupSession';

const ICON_CLASS = 'sh:h-5 sh:w-5 sh:shrink-0';

/** A step's status as an icon, labelled for assistive tech. */
export function SetupStepIcon({ status }: { status: StepStatus }) {
  const { t } = useShellyTranslations();
  const label = t(`ble.stepStatus.${status}`);
  if (status === 'running') return <Spinner color="accent" size="sm" aria-label={label} />;
  const a11y = { role: 'img', 'aria-label': label } as const;
  if (status === 'done') return <CheckCircle2Icon {...a11y} className={`${ICON_CLASS} sh:text-success`} />;
  if (status === 'failed') return <XCircleIcon {...a11y} className={`${ICON_CLASS} sh:text-danger`} />;
  if (status === 'skipped') return <MinusCircleIcon {...a11y} className={`${ICON_CLASS} sh:text-muted`} />;
  return <CircleDashedIcon {...a11y} className={`${ICON_CLASS} sh:text-muted`} />;
}
