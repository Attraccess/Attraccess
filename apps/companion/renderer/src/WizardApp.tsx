import { useState, useEffect } from 'react';
import { Button, Card, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';

type Step = 'url' | 'register' | 'done';

interface CompanionBridge {
  checkHealth: (url: string) => Promise<boolean>;
  register: (url: string) => Promise<void>;
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
  const [step, setStep] = useState<Step>('url');
  const [serverUrl, setServerUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [statusText, setStatusText] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);

  useEffect(() => {
    window.companion.onInit(({ firstRun, serverUrl: saved }) => {
      if (!firstRun && saved) setServerUrl(saved);
    });
    window.companion.onWsStatus((s) => {
      setStatusText(s === 'connected' ? 'Connected — awaiting registration…' : 'Reconnecting…');
    });
    window.companion.onRegistered(({ id }) => {
      setDeviceId(id);
      setStep('done');
    });
  }, []);

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
    await window.companion.register(url);
  }

  return (
    <div className="flex items-center justify-center h-full p-6 bg-background">
      <Card className="w-full max-w-md">
        <Card.Content className="flex flex-col gap-4 p-8">
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
