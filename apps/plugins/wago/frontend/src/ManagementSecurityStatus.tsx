import { Alert, Button, Checkbox, Form, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
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
  const [status, setStatus] = useState(props.status);
  const [mode, setMode] = useState<ManagementMode>('baseline');
  const [exceptions, setExceptions] = useState<ManagementException[]>([]);
  const [confirmed, setConfirmed] = useState(false);
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
    form.current.reset();
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
    { id: 'wbm_exposed', label: 'Acknowledge WBM exposure or unverified WBM security' },
    { id: 'other_services_exposed', label: 'Acknowledge other management service exposure or unknown security' },
    { id: 'unqualified_privileges', label: 'Acknowledge unqualified account privileges (required for key enrollment)' },
  ];

  return (
    <section className="wg:space-y-3" aria-label="Management security">
      <h3>Management security</h3>
      <div className="wg:space-y-3">
        <p role="status">
          {status?.hardened ? 'Management baseline verified' : 'Management baseline not verified'} ·{' '}
          {status?.state ?? 'Inspection required'} · {status?.support ?? 'qualification_required'}
        </p>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Firmware 31 service controls, minimum privileges and reboot-safe recovery require qualification. Adding a
              key does not disable passwords, default access or WBM. Exceptions never count as hardened. WBM setup is
              not a commissioning prerequisite. Hardware readiness is a separate qualification.
            </Alert.Description>
          </Alert.Content>
        </Alert>
        {status?.inspection && (
          <dl>
            <dt>Firmware / SSH / service control</dt>
            <dd>
              {status.inspection.firmware} / {status.inspection.ssh} / {status.inspection.serviceControl}
            </dd>
            <dt>Possible WBM listeners (HTTP/HTTPS)</dt>
            <dd>{status.inspection.wbm}</dd>
            <dt>Other management listeners</dt>
            <dd>{status.inspection.otherManagement}</dd>
            <dt>Password / default access</dt>
            <dd>
              {status.inspection.passwordAccess} / {status.inspection.defaultAccess}
            </dd>
          </dl>
        )}
        <p>Socket observations do not verify firewall reachability, WBM credentials or TLS.</p>
        {status?.keyFingerprint && (
          <p>
            Generated management key: <code>{status.keyFingerprint}</code>
          </p>
        )}
        {status?.failure && (
          <p role="alert">
            {status.failure === 'rollback_failed'
              ? 'Rollback could not be verified. The recovery journal and encrypted key are retained.'
              : 'The transition failed; check the saved recovery state.'}
          </p>
        )}
        {recovery && (
          <p>
            Recovery restores saved management access. Enter fresh credentials for the original account. After
            interruption, recovery may remain busy until the five-minute operation lease expires. If SSH is unavailable,
            use the locally qualified USB-C/WBM recovery procedure.
          </p>
        )}
        <Form ref={form} onSubmit={(event) => event.preventDefault()} aria-label="Management security actions">
          <TextField name="managementUsername" isRequired isDisabled={pending}>
            <Label>Temporary SSH username</Label>
            <Input autoComplete="off" maxLength={32} />
          </TextField>
          <TextField name="managementPassword" isRequired isDisabled={pending}>
            <Label>Temporary SSH password</Label>
            <Input type="password" autoComplete="off" maxLength={4096} />
          </TextField>
          <p>Credentials are cleared after each request. Apply and recovery require fresh credentials.</p>
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !!recovery}
            onPress={() => void run('inspect')}
          >
            Inspect management
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
            Full baseline
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
            Add management key only
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
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>{label}</Checkbox.Content>
            </Checkbox>
          ))}
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !status?.inspection || !!recovery}
            onPress={() => void run('review')}
          >
            Review changes
          </Button>
          {reviewed && (
            <p>
              {mode === 'key_only'
                ? 'Review: snapshot authorized keys, arm rollback, add a unique key, verify a new pinned key connection, then retain the recovery snapshot. Existing access remains enabled.'
                : 'Review: snapshot access, arm reboot-safe rollback, add and verify a unique management key, restrict access, verify a new connection and the service baseline, then retain recovery.'}
            </p>
          )}
          <Checkbox isSelected={confirmed} isDisabled={pending} onChange={setConfirmed}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>I confirm the reviewed change or explicit recovery for this controller.</Checkbox.Content>
          </Checkbox>
          <Button
            type="button"
            isDisabled={pending || !confirmed || !reviewed || status?.support !== 'supported'}
            onPress={() => void run('apply')}
          >
            Apply reviewed change
          </Button>
          <Button
            type="button"
            variant="secondary"
            isDisabled={pending || !confirmed || !recovery}
            onPress={() => void run('recover')}
          >
            Recover saved access
          </Button>
        </Form>
        {failed && (
          <p role="alert">
            The management request did not complete. Refresh the saved status before retrying; interrupted transitions
            require recovery.
          </p>
        )}
      </div>
    </section>
  );
}
