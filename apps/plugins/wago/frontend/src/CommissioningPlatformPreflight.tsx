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
  const recovery = !!current.dockerProvisionState && current.runtimeRecoveryAvailable !== true;
  const codesysDisabled = current.codesysState === 'disabled';

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
        Optionally inspect firmware, digital I/O access, CODESYS and Docker before installation. Inspection does not
        change the controller. Installation checks these again under your destructive-install approval.
      </p>
      {codesysDisabled && (
        <p role="status">
          Controller preparation verified CODESYS stopped and permanently disabled. This is a saved result, not a
          live controller status check.
        </p>
      )}
      {report && (
        <dl>
          <dt>Report source</dt>
          <dd>Saved inspection snapshot; these values are not live controller status.</dd>
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
          Installation prepares supported Docker and persistent, limited digital I/O access. It must verify CODESYS is
          stopped and disabled before enabling I/O. An inspection report does not prove installation, management
          hardening or physical qualification is complete.
        </p>
      )}
      {report?.hardware === 'uid10001-access-denied' && (
        <p>
          The runtime account cannot currently access the digital registers. Installation must establish and verify
          persistent access limited to the required input and output registers, or fail without enabling I/O.
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
          CODESYS is active. Destructive installation will stop and permanently disable it. Existing PLC applications
          and data may be lost; Attraccess will not preserve, back up, or restore them. Installation fails if CODESYS
          cannot be verified stopped and disabled before I/O.
        </p>
      )}
      {report?.exclusivity === 'codesys-boot-enabled' && (
        <p>
          CODESYS is configured to start at boot. Destructive installation must disable that startup and verify
          CODESYS is stopped before I/O. A stopped process alone is insufficient. No separate PLC preservation or
          restoration approval is required.
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
              This report could not establish a supported Docker package installation path. Retry installation only
              after the reported package or compatibility issue is resolved. An old inspection does not authorize
              activation by itself.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {report?.provision === 'unsupported-lifecycle-dependencies' && (
        <p>
          This report could not verify the Docker lifecycle dependencies. Installation must validate a supported
          activation path before changing Docker. Vendor activation can change startup, routing and firewall settings;
          preexisting settings are not restored by commissioning.
        </p>
      )}
      {current.dockerProvisionState && (
        <p role="status">
          Saved controller preparation: {current.dockerProvisionState}. If runtime installation began, use Clean up
          failed installation first. Preparation cleanup reconciles its operation record; it does not restore previous
          workloads or host settings, re-enable CODESYS, or qualify physical I/O.
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
                I approve cleaning up this controller preparation. Preexisting workloads and host settings will not
                be restored.
              </Checkbox.Content>
            </Checkbox>
            <Button
              type="button"
              isDisabled={busy || !approved}
              onPress={() => void run('recover')}
            >
              Clean up controller preparation
            </Button>
          </>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
