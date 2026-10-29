import { Alert, Button, Input, Label, TextField } from '@heroui/react';
import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { CommissioningSession } from '../../api/client';
import type { WagoCommissioningClockReport, WagoCommissioningPreflightReport } from '../../../../shared/commissioning';
import { useWagoTranslations } from '../../i18n';

const api = createPluginApiClient('/api/wago/commissioning/sessions');
export function CommissioningPlatformPreflight({
  session,
  showFailure = true,
}: {
  session: CommissioningSession;
  showFailure?: boolean;
}) {
  const { t, tBackendMessage, language } = useWagoTranslations();
  const formatUtc = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? tBackendMessage(value)
      : date.toLocaleString(language, { timeZone: 'UTC', timeZoneName: 'short' });
  };
  const client = useQueryClient();
  const [updated, setUpdated] = useState<CommissioningSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [customSsh, setCustomSsh] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      form.current?.reset();
    },
    [],
  );
  const current = updated && updated.updatedAt >= session.updatedAt ? updated : session;
  let report: WagoCommissioningPreflightReport | null = null;
  try {
    report = JSON.parse(current.platformReport ?? 'null');
  } catch {
    /* Unknown status is not approval. */
  }
  const recovery = !!current.dockerProvisionState && current.runtimeRecoveryAvailable !== true;
  const codesysDisabled = current.codesysState === 'disabled';

  async function run(action: 'inspect' | 'recover') {
    if (busy || !form.current?.reportValidity()) return;
    const values = new FormData(form.current);
    const temporarySsh = {
      username: customSsh ? String(values.get('preflightUsername') ?? '') : 'root',
      password: customSsh ? String(values.get('preflightPassword') ?? '') : 'wago',
    };
    form.current.reset();
    setCustomSsh(false);
    setBusy(true);
    setError('');
    const request = generation.current;
    try {
      const value = await api.request<CommissioningSession>(`/${session.id}/platform/${action}`, {
        method: 'POST',
        body: { temporarySsh, reviewedDockerActivation: action !== 'inspect' },
      });
      if (request === generation.current) {
        setUpdated(value);
        client.setQueryData<CommissioningSession[]>(['wago', 'commissioning-sessions'], (entries) =>
          entries?.map((entry) => (entry.id === value.id ? value : entry)),
        );
      }
    } catch {
      if (request === generation.current) setError('security.inspectError');
    } finally {
      temporarySsh.password = '';
      if (request === generation.current) setBusy(false);
    }
  }

  return (
    <section className="wg:space-y-3" aria-label={t('security.preflight')}>
      <h3>{t('security.check')}</h3>
      <p>{t('security.description')}</p>
      {codesysDisabled && <p role="status">{t('security.codesysDisabled')}</p>}
      {report?.clock && <PreflightClockReport clock={report.clock} formatUtc={formatUtc} />}
      {report && <PreflightReportFindings report={report} codesysDisabled={codesysDisabled} />}
      {current.dockerProvisionState && (
        <p role="status">{t('security.savedPreparation', { state: tBackendMessage(current.dockerProvisionState) })}</p>
      )}
      {showFailure && current.failureReason && <p role="alert">{tBackendMessage(current.failureReason)}</p>}
      <form ref={form} onSubmit={(event) => event.preventDefault()}>
        <p>
          {t('commissioningUI.sshLogin', {
            account: t(customSsh ? 'commissioningUI.custom' : 'commissioningUI.defaultAccount'),
          })}
        </p>
        <Button variant="tertiary" size="sm" onPress={() => setCustomSsh(!customSsh)} isDisabled={busy}>
          {t(customSsh ? 'commissioningUI.useDefaultLogin' : 'commissioningUI.advanced')}
        </Button>
        {customSsh && (
          <>
            <TextField name="preflightUsername" isRequired isDisabled={busy}>
              <Label>{t('security.username')}</Label>
              <Input autoComplete="off" />
            </TextField>
            <TextField name="preflightPassword" isRequired isDisabled={busy}>
              <Label>{t('security.password')}</Label>
              <Input type="password" autoComplete="off" />
            </TextField>
          </>
        )}
        <Button type="button" variant="secondary" isDisabled={busy} onPress={() => void run('inspect')}>
          {t('security.inspectPrerequisites')}
        </Button>
        {recovery && (
          <>
            <Button type="button" isDisabled={busy} onPress={() => void run('recover')}>
              {t('security.cleanup')}
            </Button>
          </>
        )}
      </form>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}

function PreflightClockReport({
  clock,
  formatUtc,
}: {
  clock: WagoCommissioningClockReport;
  formatUtc: (value: string) => string;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <>
      <dl>
        <dt>{t('security.clockResult')}</dt>
        <dd>{tBackendMessage(clock.result)}</dd>
        <dt>{t('security.utcReference')}</dt>
        <dd>{formatUtc(clock.hostUtc)}</dd>
        <dt>{t('security.controllerUtc')}</dt>
        <dd>{formatUtc(clock.controllerUtc)}</dd>
        <dt>{t('security.clockObservation')}</dt>
        <dd>
          {t('security.observation', {
            observation: tBackendMessage(clock.observation),
            seconds: clock.uncertaintySeconds,
          })}
        </dd>
        <dt>{t('security.skew')}</dt>
        <dd>{t('security.seconds', { seconds: clock.skewSeconds })}</dd>
        {clock.previousSkewSeconds !== undefined && (
          <>
            <dt>{t('security.beforeCorrection')}</dt>
            <dd>{t('security.seconds', { seconds: clock.previousSkewSeconds })}</dd>
          </>
        )}
        <dt>{t('security.clockAction')}</dt>
        <dd>
          {tBackendMessage(clock.tool)} / {tBackendMessage(clock.action)}
        </dd>
      </dl>
      {clock.result === 'correction-required' && <p>{t('security.clockCorrection')}</p>}
    </>
  );
}

function PreflightReportFindings({
  report,
  codesysDisabled,
}: {
  report: WagoCommissioningPreflightReport;
  codesysDisabled: boolean;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <>
      {report.platform && (
        <dl>
          <dt>{t('security.reportSource')}</dt>
          <dd>{t('security.savedSnapshot')}</dd>
          <dt>{t('security.platform')}</dt>
          <dd>{tBackendMessage(report.platform)}</dd>
          <dt>{t('security.hardware')}</dt>
          <dd>{tBackendMessage(report.hardware)}</dd>
          <dt>{t('security.exclusivity')}</dt>
          <dd>{tBackendMessage(report.exclusivity)}</dd>
          <dt>Docker</dt>
          <dd>{tBackendMessage(report.docker)}</dd>
          <dt>{t('security.provision')}</dt>
          <dd>{tBackendMessage(report.provision)}</dd>
        </dl>
      )}
      {report.platform === 'unsupported-firmware' && <p>{t('security.unsupportedFirmware')}</p>}
      <p>{t('security.preparationHint')}</p>
      {report.hardware === 'uid10001-access-denied' && <p>{t('security.accessDenied')}</p>}
      {report.hardware === 'permission-tool-unavailable' && <p>{t('security.permissionTool')}</p>}
      {report.hardware === 'missing-register' && <p>{t('security.missingRegister')}</p>}
      {!codesysDisabled && report.exclusivity === 'codesys-active' && <p>{t('security.codesysActive')}</p>}
      {!codesysDisabled && report.exclusivity === 'codesys-boot-enabled' && <p>{t('security.codesysBoot')}</p>}
      {report.exclusivity === 'output-container-conflict' && <p>{t('security.containerConflict')}</p>}
      {report.provision === 'unsupported-fw31-package-activation' && (
        <Alert status="warning">
          <AlertStatusIcon status="warning" />
          <Alert.Content>
            <Alert.Description>{t('security.packageActivation')}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {report.provision === 'unsupported-lifecycle-dependencies' && <p>{t('security.lifecycle')}</p>}
    </>
  );
}
