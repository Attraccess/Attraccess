import { useState, useEffect } from 'react';
import { Card, Button, Input, FormField, StatusText } from '@attraccess/ui';

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
  const [status, setStatus] = useState<{ text: string; variant: 'default' | 'ok' | 'error' }>({ text: '', variant: 'default' });
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);

  useEffect(() => {
    window.companion.onInit(({ firstRun, serverUrl: saved }) => {
      if (!firstRun && saved) setServerUrl(saved);
    });
    // ponytail: ws-status text is only visible on the register step; safe to update unconditionally
    window.companion.onWsStatus((s) => {
      setStatus({ text: s === 'connected' ? 'Connected — awaiting registration…' : 'Reconnecting…', variant: 'default' });
    });
    window.companion.onRegistered(({ id }) => {
      setDeviceId(id);
      setStep('done');
    });
  }, []);

  async function handleConnect() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) {
      setStatus({ text: 'Please enter a server URL.', variant: 'error' });
      return;
    }
    setConnecting(true);
    setStatus({ text: 'Checking connectivity…', variant: 'default' });

    const ok = await window.companion.checkHealth(url);
    if (!ok) {
      setStatus({ text: 'Could not reach server. Check the URL and try again.', variant: 'error' });
      setConnecting(false);
      return;
    }

    setStatus({ text: '', variant: 'default' });
    setStep('register');
    await window.companion.register(url);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '24px' }}>
      <Card>
        {step === 'url' && (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Attraccess Companion</h1>
            <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              Enter the URL of your Attraccess server to get started.
            </p>
            <FormField label="Server URL" htmlFor="serverUrl">
              <Input
                id="serverUrl"
                type="url"
                placeholder="https://attraccess.example.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </FormField>
            <Button onClick={handleConnect} disabled={connecting}>Connect</Button>
            <StatusText variant={status.variant}>{status.text}</StatusText>
          </>
        )}

        {step === 'register' && (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Registering…</h1>
            <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              The app is opening a connection and registering this device. Please wait.
            </p>
            <StatusText variant="default">{status.text || 'Connecting to server…'}</StatusText>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>Setup complete!</h1>
            <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              This device has been registered. Please name it in the Attraccess admin panel.
            </p>
            {deviceId !== null && (
              <StatusText variant="ok">Device ID: {deviceId}</StatusText>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
