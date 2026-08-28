import { Button, Chip, Input, Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';
import { claimController, getSettings, listControllers, setSettings, type WagoController } from './api';

function statusColor(status: WagoController['connectivity']): 'default' | 'success' | 'warning' {
  return status === 'online' ? 'success' : status === 'stale' ? 'warning' : 'default';
}

export function ControllersPage() {
  const [controllers, setControllers] = useState<WagoController[]>([]);
  const [defaultServer, setDefaultServer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claim, setClaim] = useState<{ id: number; name: string; verifier: string } | null>(null);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, settings] = await Promise.all([listControllers(), getSettings()]);
      setControllers(items);
      setDefaultServer(settings.defaultMqttServerId?.toString() ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load WAGO controllers.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const saveDefault = async () => {
    try {
      await setSettings(defaultServer ? Number(defaultServer) : null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the MQTT server.');
    }
  };
  const submitClaim = async () => {
    if (!claim) return;
    try {
      await claimController(claim.id, { name: claim.name, verifier: claim.verifier });
      setClaim(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not claim this controller.');
    }
  };
  return (
    <main className="wg:mx-auto wg:max-w-6xl wg:p-4 wg:md:p-6">
      <div className="wg:mb-6 wg:flex wg:flex-wrap wg:items-end wg:justify-between wg:gap-3">
        <div>
          <h1 className="wg:text-2xl wg:font-semibold">WAGO controllers</h1>
          <p className="wg:text-sm wg:text-foreground-500">
            Discovery candidates cannot receive commands until physically claimed.
          </p>
        </div>
        <Button onPress={() => void refresh()} variant="secondary">
          Refresh
        </Button>
      </div>
      <section className="wg:mb-6 wg:flex wg:max-w-md wg:items-end wg:gap-2">
        <Input
          label="Default MQTT server ID"
          type="number"
          value={defaultServer}
          onChange={(event) => setDefaultServer(event.target.value)}
        />
        <Button onPress={() => void saveDefault()}>Save</Button>
      </section>
      {error && (
        <p role="alert" className="wg:mb-4 wg:text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <div className="wg:overflow-x-auto">
          <table className="wg:w-full wg:text-left">
            <thead>
              <tr className="wg:border-b">
                <th>Controller</th>
                <th>Trust</th>
                <th>Connection</th>
                <th>Runtime</th>
                <th>Last heartbeat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {controllers.map((controller) => (
                <tr key={controller.id} className="wg:border-b">
                  <td className="wg:py-3">
                    <strong>{controller.name ?? controller.hardwareId}</strong>
                    <br />
                    <span className="wg:text-xs wg:text-foreground-500">{controller.hardwareId}</span>
                  </td>
                  <td>
                    <Chip size="sm" variant="soft" color={controller.trustState === 'claimed' ? 'success' : 'warning'}>
                      {controller.trustState}
                    </Chip>
                  </td>
                  <td>
                    <Chip size="sm" variant="soft" color={statusColor(controller.connectivity)}>
                      {controller.connectivity}
                    </Chip>
                  </td>
                  <td>
                    {controller.protocolVersion} / {controller.runtimeVersion}
                    {controller.compatibilityError && (
                      <p className="wg:text-xs wg:text-danger">{controller.compatibilityError}</p>
                    )}
                  </td>
                  <td>
                    {controller.lastHeartbeatAt ? new Date(controller.lastHeartbeatAt).toLocaleString() : 'Never'}
                  </td>
                  <td>
                    {controller.trustState === 'untrusted' && (
                      <Button size="sm" onPress={() => setClaim({ id: controller.id, name: '', verifier: '' })}>
                        Claim
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {controllers.length === 0 && (
            <p className="wg:py-8 wg:text-center wg:text-foreground-500">
              No candidates yet. Configure a default MQTT server, then start the enrolled controller.
            </p>
          )}
        </div>
      )}
      {claim && (
        <section className="wg:mt-6 wg:max-w-md wg:space-y-3 wg:rounded-lg wg:border wg:p-4">
          <h2 className="wg:text-lg wg:font-medium">Claim controller</h2>
          <Input
            label="Controller name"
            value={claim.name}
            onChange={(event) => setClaim({ ...claim, name: event.target.value })}
          />
          <Input
            label="Physical pairing code or fingerprint"
            value={claim.verifier}
            onChange={(event) => setClaim({ ...claim, verifier: event.target.value })}
          />
          <div className="wg:flex wg:gap-2">
            <Button onPress={() => void submitClaim()}>Verify and claim</Button>
            <Button variant="secondary" onPress={() => setClaim(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
