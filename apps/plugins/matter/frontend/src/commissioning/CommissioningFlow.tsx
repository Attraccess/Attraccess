import { Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import { useMatterPermissions } from '../permissions';
import { isActive } from './api';
import { CodeEntryStep } from './CodeEntryStep';
import { FailureScreen } from './FailureScreen';
import { FinishStep } from './FinishStep';
import { PrepareStep } from './PrepareStep';
import { ProgressStep } from './ProgressStep';
import { StepIndicator, type FlowStep } from './StepIndicator';
import { useCommissioningState } from './useCommissioningState';

/**
 * The guided flow as a full page: prepare, enter or scan the code, progress, name and finish. The setup code is kept in
 * this component's memory only while a retry with the attestation override may need it, and is dropped when the session
 * ends otherwise and when the page is left.
 */
export function CommissioningFlow() {
  const { t } = useMatterTranslations();
  const { canManage } = useMatterPermissions();
  const state = useCommissioningState(true);
  const { session } = state;
  const [prepared, setPrepared] = useState(false);
  const [retained, setRetained] = useState<string | null>(null);

  // The code is needed again only for an override retry after a failed attestation; every other end drops it.
  const attestationFailed = session?.state === 'failed' && session.failure?.code === 'attestation_failed';
  useEffect(() => {
    if (session && !isActive(session) && !attestationFailed) setRetained(null);
  }, [session, attestationFailed]);
  useEffect(() => () => setRetained(null), []);

  const start = async (code: string, override = false) => {
    setRetained(code);
    try {
      await state.start({
        setupCode: code,
        ...(override ? { attestationOverride: { confirmed: true as const } } : {}),
      });
    } catch {
      setRetained(null);
    }
  };

  let step: FlowStep = prepared ? 'code' : 'prepare';
  if (session) step = session.state === 'succeeded' ? 'finish' : 'progress';

  let body;
  if (state.loading) body = <Spinner data-cy="matter-commissioning-loading" />;
  else if (!session) {
    body = prepared ? (
      <CodeEntryStep starting={state.starting} error={state.error} onStart={(code) => void start(code)} />
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
        canOverride={canManage}
        canRetryOverride={retained !== null}
        overrideBusy={state.starting}
        onStartAgain={() => {
          setRetained(null);
          state.reset();
        }}
        onOverride={() => retained && void start(retained, true)}
      />
    );
  }

  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-commissioning-flow">
      <StepIndicator current={step} />
      {session && isActive(session) && state.error && (
        <StatusAlert status="warning" title={t('commissioning.progress.pollError')} data-cy="matter-progress-error">
          {state.error}
        </StatusAlert>
      )}
      {body}
    </div>
  );
}
