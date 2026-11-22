import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatterTranslations } from '../i18n';
import { matterDevicePath, matterTabPath } from '../matterPaths';
import type { CommissioningSessionView } from './api';
import { OverrideDialog } from './OverrideDialog';
import { StepHeading } from './StepHeading';

/** Codes with their own wording; any other code (a newer backend's) shows the generic text. */
const KNOWN = new Set([
  'invalid_code',
  'device_not_found',
  'pase_failed',
  'attestation_failed',
  'already_commissioned',
  'fabric_full',
  'case_failed',
  'timeout',
  'cancelled',
  'interrupted',
  'internal',
  'needs_reconciliation',
  'registry_failed',
]);

/**
 * A failed or interrupted session: what happened and what to do next. Starting again always asks for the code again
 * (only the attestation override keeps it, in memory, for that one retry). `canOverride` is the permission to override;
 * `canRetryOverride` says the code is still in memory; `overrideError` is the translated text of a refused retry.
 */
export function FailureScreen({
  session,
  canOverride,
  canRetryOverride,
  overrideBusy,
  overrideError,
  onStartAgain,
  onOverride,
}: Readonly<{
  session: CommissioningSessionView;
  canOverride: boolean;
  canRetryOverride: boolean;
  overrideBusy: boolean;
  overrideError: string | null;
  onStartAgain: () => void;
  onOverride: () => void;
}>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(false);
  const code = session.state === 'interrupted' ? 'interrupted' : (session.failure?.code ?? 'internal');
  const key = KNOWN.has(code) ? code : 'unknown';
  const existing = session.failure?.existing;
  const findings = session.failure?.attestationFindings ?? session.attestation?.findings ?? [];
  const status = code === 'cancelled' ? 'accent' : 'danger';
  const showOverride = code === 'attestation_failed' && session.overrideAvailable && canOverride && canRetryOverride;
  // The backend offers `open` for a claimed and an unclaimed record alike; an unclaimed one still has to be claimed.
  const existingAction =
    existing?.action === 'open' && existing.lifecycleState === 'unclaimed' ? 'claim' : existing?.action;

  return (
    <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-failure-screen" data-code={code}>
      <StepHeading>{t(`commissioning.failure.${key}.title`)}</StepHeading>
      <StatusAlert status={status} data-cy={`matter-failure-${key}`}>
        <span className="mt:block">{t(`commissioning.failure.${key}.text`)}</span>
        {code === 'attestation_failed' && findings.length > 0 && (
          <span className="mt:mt-1 mt:block mt:text-sm" data-cy="matter-failure-findings">
            {t('commissioning.failure.attestation_failed.findings', { findings: findings.join(', ') })}
          </span>
        )}
        {existing && (
          <span className="mt:mt-1 mt:block" data-cy="matter-failure-existing">
            {t(`commissioning.failure.already_commissioned.${existingAction}`)}
          </span>
        )}
      </StatusAlert>
      {overrideError && (
        <StatusAlert status="danger" title={t('commissioning.override.failed')} data-cy="matter-override-error">
          {overrideError}
        </StatusAlert>
      )}
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        {existing?.nodeRecordId && (
          <Button
            variant="primary"
            onPress={() => navigate(matterDevicePath(existing.nodeRecordId as string))}
            data-cy="matter-failure-open-device"
          >
            {t(`commissioning.failure.openAction.${existingAction}`)}
          </Button>
        )}
        {(code === 'interrupted' ||
          code === 'needs_reconciliation' ||
          code === 'registry_failed' ||
          (existing && !existing.nodeRecordId)) && (
          <Button
            variant="secondary"
            onPress={() => navigate(matterTabPath('devices'))}
            data-cy="matter-failure-open-devices"
          >
            {t('commissioning.failure.openDevices')}
          </Button>
        )}
        {showOverride && (
          <Button variant="danger-soft" onPress={() => setDialog(true)} data-cy="matter-failure-override">
            {t('commissioning.override.start')}
          </Button>
        )}
        <Button
          variant={existing?.nodeRecordId ? 'tertiary' : 'primary'}
          onPress={onStartAgain}
          data-cy="matter-failure-again"
        >
          {t('commissioning.failure.again')}
        </Button>
      </div>
      <OverrideDialog
        isOpen={dialog}
        findings={findings}
        busy={overrideBusy}
        onClose={() => setDialog(false)}
        onConfirm={() => {
          setDialog(false);
          onOverride();
        }}
      />
    </div>
  );
}
