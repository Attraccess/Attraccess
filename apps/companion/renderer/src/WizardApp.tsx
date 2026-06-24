import { useState, useEffect, useRef } from 'react';
import { Button, Card, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';

type Step = 'loading' | 'permissions' | 'pin-setup' | 'pin-entry' | 'url' | 'register' | 'done';

interface Permissions {
  needed: boolean;
  accessibility: boolean;
}

interface CompanionBridge {
  checkHealth: (url: string) => Promise<boolean>;
  register: (url: string) => Promise<void>;
  getPermissions: () => Promise<Permissions>;
  requestPermission: (name: 'accessibility') => Promise<Permissions>;
  isPinSet: () => Promise<boolean>;
  savePin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  confirmQuit: () => Promise<void>;
  onInit: (cb: (data: { firstRun: boolean; serverUrl?: string; requirePin?: 'settings' | 'quit' }) => void) => void;
  onWsStatus: (cb: (status: 'connected' | 'disconnected') => void) => void;
  onRegistered: (cb: (data: { id: number }) => void) => void;
  onAuthenticated: (cb: (data: unknown) => void) => void;
}

declare global {
  interface Window {
    companion: CompanionBridge;
  }
}

export function WizardApp() {
  const [step, setStep] = useState<Step>('loading');
  const [serverUrl, setServerUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [pendingAction, setPendingAction] = useState<'settings' | 'quit' | null>(null);

  // pin-setup
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');

  // pin-entry
  const [pinEntry, setPinEntry] = useState('');
  const [pinEntryError, setPinEntryError] = useState('');

  const isFirstRunRef = useRef(false);

  // determine initial step from init + permissions + pin state
  useEffect(() => {
    window.companion.onInit(async ({ firstRun, serverUrl: saved, requirePin }) => {
      isFirstRunRef.current = firstRun;
      if (saved) setServerUrl(saved);

      if (requirePin) {
        setPendingAction(requirePin);
        setStep('pin-entry');
        return;
      }

      const [p, pinSet] = await Promise.all([
        window.companion.getPermissions(),
        window.companion.isPinSet(),
      ]);
      setPerms(p);

      if (p.needed && !p.accessibility) {
        setStep('permissions');
      } else if (firstRun && !pinSet) {
        setStep('pin-setup');
      } else {
        setStep('url');
      }
    });

    window.companion.onWsStatus((s) => {
      setStatusText(s === 'connected' ? 'Connected — awaiting registration…' : 'Reconnecting…');
    });
    window.companion.onRegistered(({ id }) => {
      setDeviceId(id);
      setStep('done');
    });
  }, []);

  // poll permissions while on that step — auto-advance when granted
  useEffect(() => {
    if (step !== 'permissions') return;
    const id = setInterval(async () => {
      const [p, pinSet] = await Promise.all([
        window.companion.getPermissions(),
        window.companion.isPinSet(),
      ]);
      setPerms(p);
      if (p.accessibility) {
        clearInterval(id);
        setStep(isFirstRunRef.current && !pinSet ? 'pin-setup' : 'url');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  async function handleGrantAccessibility() {
    const p = await window.companion.requestPermission('accessibility');
    setPerms(p);
    if (p.accessibility) {
      const pinSet = await window.companion.isPinSet();
      setStep(isFirstRunRef.current && !pinSet ? 'pin-setup' : 'url');
    }
  }

  async function handleSetPin() {
    if (pinInput.length < 4) {
      setPinSetupError('PIN must be at least 4 characters.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinSetupError('PINs do not match.');
      return;
    }
    await window.companion.savePin(pinInput);
    setPinInput('');
    setPinConfirm('');
    setPinSetupError('');
    setStep('url');
  }

  async function handleVerifyPin() {
    const ok = await window.companion.verifyPin(pinEntry);
    if (!ok) {
      setPinEntryError('Incorrect PIN.');
      return;
    }
    setPinEntryError('');
    if (pendingAction === 'quit') {
      await window.companion.confirmQuit();
    } else {
      setStep('url');
    }
  }

  async function handleConnect() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) {
      setConnectError('Please enter a server URL.');
      return;
    }
    setConnectError('');
    setConnecting(true);

    const ok = await window.companion.checkHealth(url);
    if (!ok) {
      setConnectError('Could not reach server. Check the URL and try again.');
      setConnecting(false);
      return;
    }

    setStep('register');
    try {
      await window.companion.register(url);
    } catch {
      setConnectError('Permissions are required before connecting.');
      setStep('permissions');
      setConnecting(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-6 bg-background">
      <Card className="w-full max-w-md">
        <Card.Content className="flex flex-col gap-4 p-8">

          {step === 'loading' && (
            <div className="flex justify-center py-4"><Spinner /></div>
          )}

          {step === 'permissions' && (
            <>
              <div>
                <h1 className="text-xl font-bold">Permissions required</h1>
                <p className="text-fg-muted text-sm mt-1">
                  Grant the following permissions before connecting to your server.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 border-b border-divider">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Accessibility</p>
                  <p className="text-fg-muted text-xs mt-0.5">
                    Blocks keyboard and mouse input when a session is locked.
                  </p>
                </div>
                {perms?.accessibility ? (
                  <span className="text-success text-sm font-medium shrink-0">Granted</span>
                ) : (
                  <Button size="sm" variant="primary" onPress={handleGrantAccessibility} className="shrink-0">
                    Grant
                  </Button>
                )}
              </div>
              {!perms?.accessibility && (
                <p className="text-fg-muted text-xs">
                  After granting in System Settings, this page updates automatically.
                </p>
              )}
            </>
          )}

          {step === 'pin-setup' && (
            <>
              <div>
                <h1 className="text-xl font-bold">Set a PIN</h1>
                <p className="text-fg-muted text-sm mt-1">
                  You'll need this PIN to access settings and quit the app.
                </p>
              </div>
              <TextField
                value={pinInput}
                onChange={setPinInput}
                type="password"
                isInvalid={!!pinSetupError}
                fullWidth
              >
                <Label>PIN</Label>
                <Input placeholder="At least 4 characters" />
              </TextField>
              <TextField
                value={pinConfirm}
                onChange={setPinConfirm}
                type="password"
                isInvalid={!!pinSetupError}
                fullWidth
              >
                <Label>Confirm PIN</Label>
                <Input placeholder="Repeat PIN" />
                <FieldError>{pinSetupError}</FieldError>
              </TextField>
              <Button variant="primary" fullWidth onPress={handleSetPin}>
                Set PIN
              </Button>
            </>
          )}

          {step === 'pin-entry' && (
            <>
              <div>
                <h1 className="text-xl font-bold">
                  {pendingAction === 'quit' ? 'Confirm quit' : 'Access settings'}
                </h1>
                <p className="text-fg-muted text-sm mt-1">
                  {pendingAction === 'quit'
                    ? 'Enter your PIN to quit Attraccess Companion.'
                    : 'Enter your PIN to access settings.'}
                </p>
              </div>
              <TextField
                value={pinEntry}
                onChange={setPinEntry}
                type="password"
                isInvalid={!!pinEntryError}
                fullWidth
              >
                <Label>PIN</Label>
                <Input placeholder="Enter PIN" />
                <FieldError>{pinEntryError}</FieldError>
              </TextField>
              <Button
                variant="primary"
                fullWidth
                onPress={handleVerifyPin}
              >
                {pendingAction === 'quit' ? 'Quit' : 'Confirm'}
              </Button>
            </>
          )}

          {step === 'url' && (
            <>
              <div>
                <h1 className="text-xl font-bold">Attraccess Companion</h1>
                <p className="text-fg-muted text-sm mt-1">
                  Enter the URL of your Attraccess server to get started.
                </p>
              </div>
              <TextField
                value={serverUrl}
                onChange={setServerUrl}
                type="url"
                isInvalid={!!connectError}
                fullWidth
              >
                <Label>Server URL</Label>
                <Input placeholder="https://attraccess.example.com" />
                <FieldError>{connectError}</FieldError>
              </TextField>
              <Button
                variant="primary"
                fullWidth
                isDisabled={connecting}
                onPress={handleConnect}
              >
                {connecting ? <Spinner /> : 'Connect'}
              </Button>
            </>
          )}

          {step === 'register' && (
            <>
              <div>
                <h1 className="text-xl font-bold">Registering…</h1>
                <p className="text-fg-muted text-sm mt-1">
                  Opening a connection and registering this device. Please wait.
                </p>
              </div>
              <div className="flex items-center gap-2 text-fg-muted text-sm">
                <Spinner />
                <span>{statusText || 'Connecting to server…'}</span>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div>
                <h1 className="text-xl font-bold text-success">Setup complete!</h1>
                <p className="text-fg-muted text-sm mt-1">
                  This device has been registered. Name it in the Attraccess admin panel.
                </p>
              </div>
              {deviceId !== null && (
                <p className="text-success text-sm text-center">Device ID: {deviceId}</p>
              )}
            </>
          )}

        </Card.Content>
      </Card>
    </div>
  );
}
