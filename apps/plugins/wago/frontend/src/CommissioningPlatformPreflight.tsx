import { Alert, Button, Checkbox, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { CommissioningSession } from './api';
import type { WagoCommissioningPreflightReport } from '../../shared/commissioning';
import { useWagoTranslations } from './i18n';

const api = createPluginApiClient('/api/wago/commissioning/sessions');
export function CommissioningPlatformPreflight({ session }: { session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const client = useQueryClient();
  const [updated, setUpdated] = useState<CommissioningSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
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
    if (busy || !form.current?.reportValidity() || (action !== 'inspect' && !approved)) return;
    const values = new FormData(form.current);
    const temporarySsh = {
      username: customSsh ? String(values.get('preflightUsername') ?? '') : 'root',
      password: customSsh ? String(values.get('preflightPassword') ?? '') : 'wago',
    };
    form.current.reset();
    setCustomSsh(false);
    setApproved(false);
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
      {report?.clock && (
        <dl>
          <dt>{t('security.clockResult')}</dt>
          <dd>{tBackendMessage(report.clock.result)}</dd>
          <dt>{t('security.utcReference')}</dt>
          <dd>{report.clock.hostUtc}</dd>
          <dt>{t('security.controllerUtc')}</dt>
          <dd>{report.clock.controllerUtc}</dd>
          <dt>{t('security.clockObservation')}</dt>
          <dd>
            {t('security.observation', {
              observation: tBackendMessage(report.clock.observation),
              seconds: report.clock.uncertaintySeconds,
            })}
          </dd>
          <dt>{t('security.skew')}</dt>
          <dd>{t('security.seconds', { seconds: report.clock.skewSeconds })}</dd>
          {report.clock.previousSkewSeconds !== undefined && (
            <>
              <dt>{t('security.beforeCorrection')}</dt>
              <dd>{t('security.seconds', { seconds: report.clock.previousSkewSeconds })}</dd>
            </>
          )}
          <dt>{t('security.clockAction')}</dt>
          <dd>
            {tBackendMessage(report.clock.tool)} / {tBackendMessage(report.clock.action)}
          </dd>
        </dl>
      )}
      {report?.clock?.result === 'correction-required' && <p>{t('security.clockCorrection')}</p>}
      {report?.platform && (
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
      {report?.platform === 'unsupported-firmware' && <p>{t('security.unsupportedFirmware')}</p>}
      {report && <p>{t('security.preparationHint')}</p>}
      {report?.hardware === 'uid10001-access-denied' && <p>{t('security.accessDenied')}</p>}
      {report?.hardware === 'permission-tool-unavailable' && <p>{t('security.permissionTool')}</p>}
      {report?.hardware === 'missing-register' && <p>{t('security.missingRegister')}</p>}
      {!codesysDisabled && report?.exclusivity === 'codesys-active' && <p>{t('security.codesysActive')}</p>}
      {!codesysDisabled && report?.exclusivity === 'codesys-boot-enabled' && <p>{t('security.codesysBoot')}</p>}
      {report?.exclusivity === 'output-container-conflict' && <p>{t('security.containerConflict')}</p>}
      {report?.provision === 'unsupported-fw31-package-activation' && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('security.packageActivation')}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {report?.provision === 'unsupported-lifecycle-dependencies' && <p>{t('security.lifecycle')}</p>}
      {current.dockerProvisionState && (
        <p role="status">
          {t('security.savedPreparation', { state: tBackendMessage(current.dockerProvisionState) })}
        </p>
      )}
      {current.failureReason && <p role="alert">{current.failureReason}</p>}
      <form ref={form} onSubmit={(event) => event.preventDefault()}>
        <p>
          {t('commissioningUI.sshLogin', {
            account: t(customSsh ? 'commissioningUI.custom' : 'commissioningUI.defaultAccount'),
          })}
        </p>
        <Checkbox isSelected={customSsh} onChange={setCustomSsh} isDisabled={busy}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>{t('commissioningUI.advanced')}</Checkbox.Content>
        </Checkbox>
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
            <Checkbox isSelected={approved} onChange={setApproved} isDisabled={busy}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>{t('security.approveCleanup')}</Checkbox.Content>
            </Checkbox>
            <Button type="button" isDisabled={busy || !approved} onPress={() => void run('recover')}>
              {t('security.cleanup')}
            </Button>
          </>
        )}
      </form>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
