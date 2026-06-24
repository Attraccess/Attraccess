import { useState, useEffect } from 'react';
import { Button, Card, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';

type Step = 'loading' | 'permissions' | 'url' | 'register' | 'done';

interface Permissions {
  needed: boolean;
  accessibility: boolean;
}

interface CompanionBridge {
  checkHealth: (url: string) => Promise<boolean>;
  register: (url: string) => Promise<void>;
  getPermissions: () => Promise<Permissions>;
  requestPermission: (name: 'accessibility') => Promise<Permissions>;
  onInit: (cb: (data: { firstRun: boolean; serverUrl?: string }) => void) => void;
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
  const [errorMsg, setErrorMsg] = useState('');
  const [statusText, setStatusText] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);

  useEffect(() => {
    window.companion.getPermissions().then((p) => {
      setPerms(p);
      setStep(!p.needed || p.accessibility ? 'url' : 'permissions');
    });

    window.companion.onInit(({ serverUrl: saved }) => {
      if (saved) setServerUrl(saved);
    });
    window.companion.onWsStatus((s) => {
      setStatusText(s === 'connected' ? 'Connected — awaiting registration…' : 'Reconnecting…');
    });
    window.companion.onRegistered(({ id }) => {
      setDeviceId(id);
      setStep('done');
    });
  }, []);

  // poll while on permissions step — auto-advance when all granted
  useEffect(() => {
    if (step !== 'permissions') return;
    const id = setInterval(async () => {
      const p = await window.companion.getPermissions();
      setPerms(p);
      if (p.accessibility) {
        clearInterval(id);
        setStep('url');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  async function handleGrantAccessibility() {
    const p = await window.companion.requestPermission('accessibility');
    setPerms(p);
    if (p.accessibility) setStep('url');
  }

  async function handleConnect() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) {
      setErrorMsg('Please enter a server URL.');
      return;
    }
    setErrorMsg('');
    setConnecting(true);

    const ok = await window.companion.checkHealth(url);
    if (!ok) {
      setErrorMsg('Could not reach server. Check the URL and try again.');
      setConnecting(false);
      return;
    }

    setStep('register');
    try {
      await window.companion.register(url);
    } catch {
      setErrorMsg('Permissions are required before connecting. Please grant all permissions first.');
      setStep('permissions');
      setConnecting(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-6 bg-background">
      <Card className="w-full max-w-md">
        <Card.Content className="flex flex-col gap-4 p-8">
          {step === 'loading' && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
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
                  After granting access in System Settings, this page will update automatically.
                </p>
              )}
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
                isInvalid={!!errorMsg}
                fullWidth
              >
                <Label>Server URL</Label>
                <Input placeholder="https://attraccess.example.com" />
                <FieldError>{errorMsg}</FieldError>
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
