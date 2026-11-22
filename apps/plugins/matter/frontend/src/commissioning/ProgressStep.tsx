import { ConfirmableButton } from '@attraccess/plugins-frontend-ui';
import { CheckIcon, CircleDotIcon, CircleIcon } from 'lucide-react';
import { useMatterTranslations } from '../i18n';
import { SESSION_STEPS, type CommissioningSessionView, type SessionStep } from './api';

/** `network_setup` does not apply to a device that is already on the network. */
const SHOWN: readonly SessionStep[] = SESSION_STEPS.filter((step) => step !== 'network_setup' && step !== 'completed');

/** Step 3: each protocol step with its live state, and a way to cancel. */
export function ProgressStep({
  session,
  onCancel,
}: Readonly<{ session: CommissioningSessionView; onCancel: () => Promise<void> }>) {
  const { t } = useMatterTranslations();
  const position = session.step ? SESSION_STEPS.indexOf(session.step) : -1;
  return (
    <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-progress-step">
      <h3 className="mt:text-lg mt:font-semibold">{t('commissioning.progress.title')}</h3>
      <ol className="mt:flex mt:flex-col mt:gap-2" aria-live="polite">
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
            confirmLabel: t('commissioning.progress.cancel'),
            'data-cy': 'matter-progress-cancel-dialog',
            confirmDataCy: 'matter-progress-cancel-confirm',
          }}
          data-cy="matter-progress-cancel"
        />
      </div>
    </div>
  );
}
