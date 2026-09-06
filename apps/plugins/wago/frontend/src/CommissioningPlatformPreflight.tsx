import { Alert, Button, Checkbox, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { CommissioningSession } from './api';
import type { WagoHardwareDeploymentReport } from '../../shared/commissioning';

const api = createPluginApiClient('/api/wago/commissioning/sessions');
export function CommissioningPlatformPreflight({ session }: { session: CommissioningSession }) {
  const client = useQueryClient();
  const [updated, setUpdated] = useState<CommissioningSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
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
  let report: WagoHardwareDeploymentReport | null = null;
  try {
    report = JSON.parse(current.platformReport ?? 'null');
  } catch {
    /* Unknown status is not approval. */
  }
  const recovery = !!current.dockerProvisionState;

  async function run(action: 'inspect' | 'recover') {
    if (busy || !form.current?.reportValidity() || (action !== 'inspect' && !approved)) return;
    const values = new FormData(form.current);
    const temporarySsh = {
      username: String(values.get('preflightUsername') ?? ''),
      password: String(values.get('preflightPassword') ?? ''),
    };
    form.current.reset();
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
      if (request === generation.current)
        setError('Platform action failed. Recheck the supported action and fresh SSH credential.');
    } finally {
      temporarySsh.password = '';
      if (request === generation.current) setBusy(false);
    }
  }

  return (
    <section className="wg:space-y-3" aria-label="Controller installation preflight">
      <h3>Controller installation preflight</h3>
      <p>
        Inspect firmware, exact digital registers, UID 10001 permissions, exclusive output access and Docker before
        installation. This does not change the controller.
      </p>
      {report && (
        <dl>
          <dt>Platform</dt>
          <dd>{report.platform}</dd>
          <dt>Hardware access</dt>
          <dd>{report.hardware}</dd>
          <dt>Output exclusivity</dt>
          <dd>{report.exclusivity}</dd>
          <dt>Docker</dt>
          <dd>{report.docker}</dd>
          <dt>Supported provisioning</dt>
          <dd>{report.provision}</dd>
        </dl>
      )}
      {report?.platform === 'unsupported-firmware' && (
        <p>
          The controller has not reported an unambiguous CC100 FW31 release identity. A BSP version alone is
          insufficient.
        </p>
      )}
      {report && (
        <p>
          Automatic Docker lifecycle changes and persistent digital-register permissions are not implemented. Vendor
          source identifies boot and networking side effects that require complete dependency checks and restoration.
          Physical hardware verification is a separate step.
        </p>
      )}
      {report?.hardware === 'uid10001-access-denied' && (
        <p>
          The runtime account cannot access the digital registers with minimum permissions. Persistent permission setup
          and restoration are not implemented; installation is blocked.
        </p>
      )}
      {report?.hardware === 'permission-tool-unavailable' && (
        <p>
          The available tools cannot verify runtime-account permissions. A supported permission probe is needed before
          installation can proceed.
        </p>
      )}
      {report?.hardware === 'missing-register' && (
        <p>
          The expected digital registers are missing. Check the controller model and supported firmware; installation
          will not create substitute directories.
        </p>
      )}
      {report?.exclusivity === 'codesys-active' && (
        <p>
          A PLC workload is active. CODESYS application, retained-state and boot-state preservation and restoration are
          not implemented. Installation is blocked to preserve the existing workload.
        </p>
      )}
      {report?.exclusivity === 'codesys-boot-enabled' && (
        <p>
          CODESYS is configured to start at boot. A stopped PLC is not exclusive output access after reboot. Its
          application and startup configuration are preserved; installation is blocked until a supported preservation
          and restoration procedure is implemented.
        </p>
      )}
      {report?.exclusivity === 'output-container-conflict' && (
        <p>
          Another container can write the digital outputs. Resolve exclusive ownership before installing this runtime.
        </p>
      )}
      {report?.provision === 'unsupported-fw31-package-activation' && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              The vendor Docker package is unavailable. Fresh FW31 package activation and restoration are not
              implemented. The vendor procedure and its effects on startup, storage and networking are still needed.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {report?.provision === 'unsupported-lifecycle-dependencies' && (
        <p>
          Docker lifecycle changes are blocked: the vendor scripts change boot links, routing and firewall state, and
          stopping Docker runs networking event scripts. Their complete FW31 dependencies and restoration snapshot must
          be supported before activation can proceed. No vendor status command is run.
        </p>
      )}
      {current.dockerProvisionState && (
        <p role="status">
          Saved Docker operation: {current.dockerProvisionState}. Restore any installed runtime snapshot first.
          Recorded start attempts remain unresolved until their networking and boot effects can be reconciled;
          a stopped daemon alone does not prove restoration.
        </p>
      )}
      {current.failureReason && <p role="alert">{current.failureReason}</p>}
      <form ref={form} onSubmit={(event) => event.preventDefault()}>
        <TextField name="preflightUsername" isRequired isDisabled={busy}>
          <Label>Preflight SSH username</Label>
          <Input autoComplete="off" />
        </TextField>
        <TextField name="preflightPassword" isRequired isDisabled={busy}>
          <Label>Preflight SSH password</Label>
          <Input type="password" autoComplete="off" />
        </TextField>
        <Button type="button" variant="secondary" isDisabled={busy} onPress={() => void run('inspect')}>
          Inspect installation prerequisites
        </Button>
        {recovery && (
          <>
            <Checkbox isSelected={approved} onChange={setApproved} isDisabled={busy}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                I approve checking the saved Docker recovery state after runtime recovery.
              </Checkbox.Content>
            </Checkbox>
            <Button
              type="button"
              isDisabled={busy || !approved}
              onPress={() => void run('recover')}
            >
              Recover Docker provisioning
            </Button>
          </>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
