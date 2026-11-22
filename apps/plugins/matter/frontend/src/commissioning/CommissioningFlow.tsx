import { Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import { useMatterPermissions } from '../permissions';
import { useMatterErrorText } from '../useMatterErrorText';
import { isActive } from './api';
import { CodeEntryStep } from './CodeEntryStep';
import { FailureScreen } from './FailureScreen';
import { FinishStep } from './FinishStep';
import { PrepareStep } from './PrepareStep';
import { ProgressStep } from './ProgressStep';
import { StepIndicator, type FlowStep } from './StepIndicator';
import { useCommissioningState } from './useCommissioningState';
import { useFocusOnChange } from './useFocusOnChange';

/**
 * The guided flow as a full page: prepare, enter or scan the code, progress, name and finish. The setup code is kept in
 * this component's memory only while a retry with the attestation override is possible (the sidecar allows it and the
 * person may commission and manage), and is dropped as soon as it is not, when the session ends otherwise and when the
 * page is left.
 */
export function CommissioningFlow() {
  const { t } = useMatterTranslations();
  const errorText = useMatterErrorText();
  const { canManage, canCommission } = useMatterPermissions();
  const state = useCommissioningState();
  const { session, failure } = state;
  const [prepared, setPrepared] = useState(false);
  const [retained, setRetained] = useState<string | null>(null);

  // The override needs `matter.devices.commission` and `matter.devices.manage` (backend MATTER_OPERATIONS).
  const mayOverride = canManage && canCommission;
  const attestationFailed = session?.state === 'failed' && session.failure?.code === 'attestation_failed';
  // The code is needed again only for an override retry after a failed attestation; every other case drops it.
  useEffect(() => {
    if (!session) return;
    const overridePossible = mayOverride && session.overrideAvailable;
    if (!overridePossible || (!isActive(session) && !attestationFailed)) setRetained(null);
  }, [session, attestationFailed, mayOverride]);
  useEffect(() => () => setRetained(null), []);

  const start = async (code: string, override = false) => {
    setRetained(mayOverride ? code : null);
    try {
      await state.start({
        setupCode: code,
        ...(override ? { attestationOverride: { confirmed: true as const } } : {}),
      });
    } catch {
      // A refused override retry keeps the code so it can be tried again; a refused first start keeps it in the field.
      if (!override) setRetained(null);
    }
  };

  let step: FlowStep = prepared ? 'code' : 'prepare';
  if (session) step = session.state === 'succeeded' ? 'finish' : 'progress';
  let view: string = step;
  if (session && !isActive(session) && session.state !== 'succeeded') view = `failure-${session.id}`;
  else if (session) view = `${step}-${session.id}`;
  const container = useFocusOnChange<HTMLDivElement>(state.loading ? null : view);

  const requestError = (kinds: readonly string[]) =>
    failure && kinds.includes(failure.kind) ? errorText(failure.error) : null;

  let body;
  if (state.loading) body = <Spinner data-cy="matter-commissioning-loading" />;
  else if (!session) {
    body = prepared ? (
      <CodeEntryStep
        starting={state.starting}
        error={requestError(['load', 'start'])}
        onStart={(code) => void start(code)}
      />
    ) : (
      <PrepareStep onContinue={() => setPrepared(true)} />
    );
  } else if (isActive(session)) {
    body = <ProgressStep session={session} onCancel={state.cancel} />;
  } else if (session.state === 'succeeded') {
    body = <FinishStep session={session} onDone={state.reset} />;
  } else {
    body = (
      <FailureScreen
        session={session}
        canOverride={mayOverride}
        canRetryOverride={retained !== null}
        overrideBusy={state.starting}
        overrideError={requestError(['start'])}
        onStartAgain={() => {
          setRetained(null);
          state.reset();
        }}
        onOverride={() => retained && void start(retained, true)}
      />
    );
  }

  const activeError = session && isActive(session) && failure && (failure.kind === 'poll' || failure.kind === 'cancel');
  return (
    <div ref={container} className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-commissioning-flow">
      <StepIndicator current={step} />
      {activeError && (
        <StatusAlert
          status={failure.kind === 'cancel' ? 'danger' : 'warning'}
          title={t(
            failure.kind === 'cancel' ? 'commissioning.progress.cancelFailed' : 'commissioning.progress.pollError',
          )}
          data-cy={failure.kind === 'cancel' ? 'matter-progress-cancel-error' : 'matter-progress-error'}
        >
          {errorText(failure.error)}
        </StatusAlert>
      )}
      {body}
    </div>
  );
}
