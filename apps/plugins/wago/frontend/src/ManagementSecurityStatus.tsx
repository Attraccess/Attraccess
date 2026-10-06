import { Alert, Button, Checkbox, Form, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useWagoTranslations } from './i18n';
import type {
  ManagementException,
  ManagementMode,
  ManagementPublicStatus,
  SessionCredential,
} from '../../backend/wago-management.types';

/** Coordinator supplies authenticated API callbacks. Credentials live only in the form/request;
 * this component never caches them, accepts scripts, or makes readiness depend on WBM setup.
 */
export interface ManagementSecurityStatusProps {
  controllerId: number;
  status: ManagementPublicStatus | null;
  onInspect(credential: SessionCredential): Promise<ManagementPublicStatus>;
  onReview(input: { mode: ManagementMode; exceptions: ManagementException[] }): Promise<ManagementPublicStatus>;
  onApply(input: {
    reviewToken: string;
    confirm: true;
    temporarySsh: SessionCredential;
  }): Promise<ManagementPublicStatus>;
  onRecover(input: { confirm: true; temporarySsh: SessionCredential }): Promise<ManagementPublicStatus>;
}

export function ManagementSecurityStatus(props: ManagementSecurityStatusProps) {
  const { t } = useWagoTranslations();
  const [status, setStatus] = useState(props.status);
  const [mode, setMode] = useState<ManagementMode>('baseline');
  const [exceptions, setExceptions] = useState<ManagementException[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [credentialGeneration, setCredentialGeneration] = useState(0);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    setStatus(props.status);
  }, [props.status]);
  useEffect(() => {
    generation.current += 1;
    setStatus(props.status);
    setMode('baseline');
    setExceptions([]);
    setConfirmed(false);
    setFailed(false);
    setPending(false);
    form.current?.reset();
    const clear = () => {
      if (document.hidden) form.current?.reset();
    };
    document.addEventListener('visibilitychange', clear);
    return () => {
      generation.current += 1;
      form.current?.reset();
      document.removeEventListener('visibilitychange', clear);
    };
    // A new controller invalidates every outstanding response and review.
  }, [props.controllerId]);

  const run = async (action: 'inspect' | 'review' | 'apply' | 'recover') => {
    if (pending || !form.current) return;
    if (action !== 'review' && !form.current.reportValidity()) return;
    const requestGeneration = generation.current;
    const values = new FormData(form.current);
    const temporarySsh = {
      username: String(values.get('managementUsername') ?? ''),
      password: String(values.get('managementPassword') ?? ''),
    };
    // Remount only the credential fields. Resetting the whole Form also resets
    // React Aria's exception checkboxes and invalidates the submitted review.
    setCredentialGeneration((current) => current + 1);
    setConfirmed(false);
    setPending(true);
    setFailed(false);
    try {
      const next =
        action === 'inspect'
          ? await props.onInspect(temporarySsh)
          : action === 'review'
            ? await props.onReview({ mode, exceptions })
            : action === 'recover'
              ? await props.onRecover({ confirm: true, temporarySsh })
              : await props.onApply({ reviewToken: status?.reviewToken ?? '', confirm: true, temporarySsh });
      if (generation.current === requestGeneration) setStatus(next);
    } catch {
      if (generation.current === requestGeneration) setFailed(true);
    } finally {
      temporarySsh.password = '';
      if (generation.current === requestGeneration) setPending(false);
    }
  };
  const reviewed =
    status?.state === 'reviewed' &&
    status.mode === mode &&
    JSON.stringify([...status.exceptions].sort()) === JSON.stringify([...exceptions].sort());
  const recovery = status?.recoveryRequired || status?.state === 'key_enrolled' || status?.state === 'hardened';
  const residuals: { id: ManagementException; label: string }[] = [
    { id: 'wbm_exposed', label: t('security.exceptions.wbm_exposed') },
    { id: 'other_services_exposed', label: t('security.exceptions.other_services_exposed') },
    { id: 'unqualified_privileges', label: t('security.exceptions.unqualified_privileges') },
  ];

  return (
    <section className="wg:space-y-3" aria-label={t('security.title')}>
      <h3>{t('security.title')}</h3>
      <div className="wg:space-y-3">
        <ManagementSummary status={status} recovery={recovery} />
        <Form ref={form} onSubmit={(event) => event.preventDefault()} aria-label={t('security.actions')}>
          <TextField key={`username-${credentialGeneration}`} name="managementUsername" isRequired isDisabled={pending}>
            <Label>{t('commissioningUI.installationUsername')}</Label>
            <Input autoComplete="off" maxLength={32} />
          </TextField>
          <TextField key={`password-${credentialGeneration}`} name="managementPassword" isRequired isDisabled={pending}>
            <Label>{t('commissioningUI.installationPassword')}</Label>
            <Input type="password" autoComplete="off" maxLength={4096} />
          </TextField>
          <p>{t('security.credentials')}</p>
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !!recovery}
            onPress={() => void run('inspect')}
          >
            {t('security.inspect')}
          </Button>
          <Button
            type="button"
            variant={mode === 'baseline' ? 'primary' : 'secondary'}
            isDisabled={pending || !!recovery}
            onPress={() => {
              setMode('baseline');
              setConfirmed(false);
            }}
          >
            {t('security.baseline')}
          </Button>
          <Button
            type="button"
            variant={mode === 'key_only' ? 'primary' : 'secondary'}
            isDisabled={pending || !!recovery}
            onPress={() => {
              setMode('key_only');
              setConfirmed(false);
            }}
          >
            {t('security.keyOnly')}
          </Button>
          {residuals.map(({ id, label }) => (
            <Checkbox
              key={id}
              isSelected={exceptions.includes(id)}
              isDisabled={pending || !!recovery}
              onChange={(selected) => {
                setExceptions((current) =>
                  selected ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id),
                );
                setConfirmed(false);
              }}
            >
              <Checkbox.Content className="wg:items-start">
                <Checkbox.Control className="wg:mt-0.5">
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {label}
              </Checkbox.Content>
            </Checkbox>
          ))}
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !status?.inspection || !!recovery}
            onPress={() => void run('review')}
          >
            {t('security.review')}
          </Button>
          {reviewed && <p>{t(mode === 'key_only' ? 'security.keyReview' : 'security.baselineReview')}</p>}
          <Checkbox isSelected={confirmed} isDisabled={pending} onChange={setConfirmed}>
            <Checkbox.Content className="wg:items-start">
              <Checkbox.Control className="wg:mt-0.5">
                <Checkbox.Indicator />
              </Checkbox.Control>
              {t('security.confirm')}
            </Checkbox.Content>
          </Checkbox>
          <Button
            type="button"
            isDisabled={pending || !confirmed || !reviewed || status?.support !== 'supported'}
            onPress={() => void run('apply')}
          >
            {t('security.apply')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !confirmed || !recovery}
            onPress={() => void run('recover')}
          >
            {t('security.recover')}
          </Button>
        </Form>
        {failed && <p role="alert">{t('security.requestFailed')}</p>}
      </div>
    </section>
  );
}

function ManagementSummary({
  status,
  recovery,
}: {
  status: ManagementPublicStatus | null;
  recovery: boolean | undefined;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <>
      <p role="status">
        {t(status?.hardened ? 'security.verified' : 'security.notVerified')} ·{' '}
        {status?.state ? tBackendMessage(status.state) : t('security.inspectionRequired')} · {status?.support ? tBackendMessage(status.support) : t('security.qualificationRequired')}
      </p>
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{t('security.limitations')}</Alert.Description>
        </Alert.Content>
      </Alert>
      {status?.inspection && (
        <dl>
          <dt>{t('security.firmware')}</dt>
          <dd>
            {tBackendMessage(status.inspection.firmware)} / {tBackendMessage(status.inspection.ssh)} / {tBackendMessage(status.inspection.serviceControl)}
          </dd>
          {status.inspection.ssh === 'dropbear' && (
            <>
              <dt>{t('security.peerVersion')}</dt>
              <dd>{status.inspection.dropbearVersion ?? t('diagnostics.unknown')}</dd>
            </>
          )}
          <dt>{t('security.wbm')}</dt>
          <dd>{tBackendMessage(status.inspection.wbm)}</dd>
          <dt>{t('security.otherListeners')}</dt>
          <dd>{tBackendMessage(status.inspection.otherManagement)}</dd>
          <dt>{t('security.passwordAccess')}</dt>
          <dd>
            {tBackendMessage(status.inspection.passwordAccess)} / {tBackendMessage(status.inspection.defaultAccess)}
          </dd>
        </dl>
      )}
      <p>{t('security.socketHint')}</p>
      {status?.keyFingerprint && (
        <p>
          {t('security.key')} <code className="wg:break-all">{status.keyFingerprint}</code>
        </p>
      )}
      {status?.failure && (
        <p role="alert">
          {t(status.failure === 'rollback_failed' ? 'security.rollbackFailed' : 'security.transitionFailed')}
        </p>
      )}
      {recovery && <p>{t('security.recoveryDescription')}</p>}
    </>
  );
}
