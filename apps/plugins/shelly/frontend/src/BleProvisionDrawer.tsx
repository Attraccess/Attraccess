// Bluetooth provisioning drawer (ATT-502): push WiFi credentials to a Shelly
// that has never been on the network, then hand the address it gets to the
// registry — the same endpoint the "Add device" flow uses.
//
// The Bluetooth radio is the operator's, not the server's: an off-network device
// is unreachable over IP, and the API typically runs in a container far away
// from the device being installed.
import { Button, Chip, DrawerBody, DrawerHeader, Form, Spinner } from '@heroui/react';
import { BluetoothIcon, CheckCircle2Icon, CircleIcon, XIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { addDevice, type ShellyDevice } from './api';
import { connectShellyOverBle, disableBleRadio, getBluetooth, provisionWifiOverBle, type ProvisionStage } from './ble';
import { PasswordFieldRow, StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

type Step = 'connecting' | ProvisionStage | 'registering' | 'disabling-bluetooth';

const STEPS: { id: Step; label: string }[] = [
  { id: 'connecting', label: 'Connect over Bluetooth' },
  { id: 'identifying', label: 'Identify the device' },
  { id: 'sending-credentials', label: 'Send WiFi credentials' },
  { id: 'joining', label: 'Wait for the device to join' },
  { id: 'registering', label: 'Add to the registry' },
  { id: 'disabling-bluetooth', label: "Turn off the device's Bluetooth" },
];

function StepList({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="sh:flex sh:flex-col sh:gap-2" data-cy="shelly-ble-steps">
      {STEPS.map((step, index) => (
        <li key={step.id} className="sh:flex sh:items-center sh:gap-2 sh:text-sm">
          {index < currentIndex ? (
            <CheckCircle2Icon className="sh:h-4 sh:w-4 sh:shrink-0 sh:text-success" aria-hidden="true" />
          ) : index === currentIndex ? (
            <Spinner color="accent" size="sm" />
          ) : (
            <CircleIcon className="sh:h-4 sh:w-4 sh:shrink-0 sh:text-muted" aria-hidden="true" />
          )}
          <span className={index <= currentIndex ? 'sh:text-foreground' : 'sh:text-muted'}>{step.label}</span>
          {index === currentIndex && <span className="sh:sr-only">in progress</span>}
        </li>
      ))}
    </ol>
  );
}

interface Outcome {
  advertisedName: string;
  model?: string;
  /** Set once the device joined and we could read its address. */
  device: ShellyDevice | null;
  restartRequired: boolean;
  /** null while the device was never registered, so its radio was left alone. */
  bluetoothDisabled: boolean | null;
}

export function BleProvisionDrawer({
  isOpen,
  onOpenChange,
  onProvisioned,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onProvisioned: () => void;
}) {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Evaluated once per mount: navigator.bluetooth never appears mid-session.
  const supported = useMemo(() => !!getBluetooth(), []);
  const running = step !== null;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // The button is both type="submit" and onPress={submit}, so one click can call
  // this twice; a ref (not the state) because both calls land in the same tick.
  const inFlight = useRef(false);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    const network = ssid.trim();
    if (!network) {
      setError('The WiFi network name is required.');
      return;
    }
    inFlight.current = true;
    setError(null);
    setOutcome(null);
    setStep('connecting');

    let disconnect: (() => void) | undefined;
    try {
      // Nothing may be awaited before this call: Chrome only opens the device
      // chooser while the click's user activation is still live.
      const connection = await connectShellyOverBle();
      disconnect = connection.disconnect;

      const result = await provisionWifiOverBle(connection.rpc, { ssid: network, password }, { onStage: setStep });

      let device: ShellyDevice | null = null;
      let bluetoothDisabled: boolean | null = null;
      if (result.ipAddress) {
        setStep('registering');
        // Name it after the advertisement; the registry would otherwise fall
        // back to the IP address and show it twice in the same row.
        device = await addDevice({ ipAddress: result.ipAddress, name: connection.advertisedName });
        onProvisioned();

        // Only now, with the device onboarded, is its radio surplus. A failure
        // here does not undo any of the above, so it is reported, not thrown.
        setStep('disabling-bluetooth');
        bluetoothDisabled = await disableBleRadio(connection.rpc).then(
          () => true,
          () => false,
        );
      }
      setOutcome({
        advertisedName: connection.advertisedName,
        model: result.info.model,
        device,
        restartRequired: result.restartRequired,
        bluetoothDisabled,
      });
    } catch (err) {
      // The chooser's "cancel" surfaces as NotFoundError; not worth an alert.
      const message = err instanceof Error ? err.message : String(err);
      setError(/user cancelled|user denied/i.test(message) ? null : message);
    } finally {
      disconnect?.();
      inFlight.current = false;
      setStep(null);
    }
  }, [onProvisioned, password, ssid]);

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!running}
      isKeyboardDismissDisabled={running}
    >
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <BluetoothIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">Provision over Bluetooth</h2>
            </div>
            <p className="sh:text-sm sh:text-muted">
              Send WiFi credentials to a Shelly that is not on the network yet. Your browser does the talking, so stay
              within a few metres of the device.
            </p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close} isDisabled={running}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {!supported ? (
          <div className="sh:flex sh:flex-col sh:gap-4">
            <StatusAlert status="warning" title="Bluetooth is not available here" dataCy="shelly-ble-unsupported">
              Web Bluetooth needs Chrome or Edge on an HTTPS page (or <code>http://localhost</code>). Firefox and Safari
              do not support it. Alternatively, join the device's own WiFi access point, configure it there, and then
              use Discover.
            </StatusAlert>
            <div className="sh:flex sh:justify-end sh:pt-2">
              <Button variant="secondary" onPress={close} isDisabled={running}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <Form onSubmit={submit} className="sh:flex sh:flex-col sh:gap-4">
            <TextFieldRow
              label="WiFi network (SSID)"
              value={ssid}
              onChange={setSsid}
              placeholder="Workshop"
              required
              description="Shelly devices only join 2.4 GHz networks."
              dataCy="shelly-ble-ssid"
            />
            <PasswordFieldRow
              label="WiFi password"
              value={password}
              onChange={setPassword}
              description="Leave empty for an open network."
              autoComplete="off"
              dataCy="shelly-ble-password"
            />

            {error && (
              <StatusAlert status="danger" title="Provisioning failed" dataCy="shelly-ble-error">
                {error}
              </StatusAlert>
            )}

            {running && <StepList current={step} />}

            {outcome && !running && (
              <div className="sh:flex sh:flex-col sh:gap-3" data-cy="shelly-ble-result">
                {outcome.restartRequired ? (
                  <StatusAlert status="warning" title="Device is restarting">
                    {outcome.advertisedName} took the credentials but has to reboot to apply them. Once it is on the
                    network, run Discover to add it to the registry.
                  </StatusAlert>
                ) : (
                  <StatusAlert status="success" title="Device provisioned">
                    {outcome.advertisedName} joined {ssid.trim()} and was added to the registry
                    {outcome.bluetoothDisabled ? ', and its Bluetooth was switched off' : ''}.
                  </StatusAlert>
                )}
                {outcome.bluetoothDisabled === false && (
                  <StatusAlert status="warning" title="Bluetooth is still on" dataCy="shelly-ble-still-enabled">
                    The device is onboarded, but it refused to switch its Bluetooth off. Turn it off in the device's own
                    settings — an enabled Shelly radio accepts commands from anyone in range.
                  </StatusAlert>
                )}
                {outcome.device && (
                  <div className="sh:flex sh:flex-wrap sh:items-center sh:justify-between sh:gap-2 sh:rounded-lg sh:bg-surface sh:px-3 sh:py-2">
                    <div className="sh:min-w-0">
                      <div className="sh:truncate sh:font-medium sh:text-foreground">{outcome.device.name}</div>
                      <div className="sh:text-xs sh:text-muted">
                        {outcome.device.ipAddress}
                        {outcome.model ? ` · ${outcome.model}` : ''}
                      </div>
                    </div>
                    <Chip variant="soft" color="success">
                      Added
                    </Chip>
                  </div>
                )}
              </div>
            )}

            <div className="sh:flex sh:justify-end sh:gap-2 sh:pt-2">
              <Button variant="secondary" onPress={close}>
                {outcome ? 'Done' : 'Cancel'}
              </Button>
              <Button variant="primary" type="submit" isPending={running} onPress={submit} data-cy="shelly-ble-submit">
                <BluetoothIcon className="sh:h-4 sh:w-4" /> {outcome ? 'Provision another' : 'Select device'}
              </Button>
            </div>
            <input type="submit" hidden />
          </Form>
        )}
      </DrawerBody>
    </StandardDrawer>
  );
}
