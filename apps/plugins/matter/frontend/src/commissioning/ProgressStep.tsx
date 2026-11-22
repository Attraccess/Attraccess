import { ConfirmableButton } from '@attraccess/plugins-frontend-ui';
import { CheckIcon, CircleDotIcon, CircleIcon } from 'lucide-react';
import { useMatterTranslations } from '../i18n';
import { SESSION_STEPS, type CommissioningSessionView, type SessionStep } from './api';
import { StepHeading } from './StepHeading';

/** `network_setup` does not apply to a device that is already on the network. */
const SHOWN: readonly SessionStep[] = SESSION_STEPS.filter((step) => step !== 'network_setup' && step !== 'completed');

/**
 * Step 3: each protocol step with its live state, and a way to cancel. One status line announces the current step to
 * screen readers; the list itself is not live, so a change is read once instead of the whole list.
 */
export function ProgressStep({
  session,
  onCancel,
}: Readonly<{ session: CommissioningSessionView; onCancel: () => Promise<void> }>) {
  const { t } = useMatterTranslations();
  const position = session.step ? SESSION_STEPS.indexOf(session.step) : -1;
  // The shown step the session is at (a hidden one counts as the shown step before it).
  const current = [...SHOWN].reverse().find((step) => SESSION_STEPS.indexOf(step) <= position) ?? SHOWN[0];
  return (
    <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-progress-step">
      <StepHeading>{t('commissioning.progress.title')}</StepHeading>
      <p role="status" className="mt:sr-only" data-cy="matter-progress-current">
        {t('commissioning.progress.current', { step: t(`commissioning.progress.step.${current}`) })}
      </p>
      <ol className="mt:flex mt:flex-col mt:gap-2">
        {SHOWN.map((step) => {
          const at = SESSION_STEPS.indexOf(step);
          const state =
            at < position ? 'done' : at === position || (position < 0 && step === SHOWN[0]) ? 'running' : 'waiting';
          const Icon = state === 'done' ? CheckIcon : state === 'running' ? CircleDotIcon : CircleIcon;
          return (
            <li
              key={step}
              className={`mt:flex mt:items-center mt:gap-2 ${state === 'waiting' ? 'mt:text-muted' : ''}`}
              data-cy={`matter-progress-${step}`}
              data-state={state}
            >
              <Icon className="mt:h-4 mt:w-4" aria-hidden />
              <span>{t(`commissioning.progress.step.${step}`)}</span>
              <span className="mt:sr-only">{t(`commissioning.progress.state.${state}`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt:text-sm mt:text-muted">{t('commissioning.progress.hint')}</p>
      <div>
        <ConfirmableButton
          label={t('commissioning.progress.cancel')}
          status="warning"
          onConfirm={onCancel}
          confirm={{
            title: t('commissioning.progress.cancelTitle'),
            message: t('commissioning.progress.cancelText'),
            confirmLabel: t('commissioning.progress.cancelConfirm'),
            cancelLabel: t('commissioning.progress.cancelKeep'),
            'data-cy': 'matter-progress-cancel-dialog',
            confirmDataCy: 'matter-progress-cancel-confirm',
          }}
          data-cy="matter-progress-cancel"
        />
      </div>
    </div>
  );
}
