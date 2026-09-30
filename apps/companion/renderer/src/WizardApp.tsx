import { useState, useEffect } from 'react';
import { ThemeToggle } from '@attraccess/ui';
import type { Step, Permissions, CompanionSettings } from './types';
import { LoadingStep } from './steps/LoadingStep';
import { PermissionsStep } from './steps/PermissionsStep';
import { PinSetupStep } from './steps/PinSetupStep';
import { PinEntryStep } from './steps/PinEntryStep';
import { UrlStep } from './steps/UrlStep';
import { RegisterStep } from './steps/RegisterStep';
import { DoneStep } from './steps/DoneStep';
import { SettingsStep } from './steps/SettingsStep';

export function WizardApp() {
  const [step, setStep] = useState<Step>('loading');
  const [serverUrl, setServerUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [pendingAction, setPendingAction] = useState<'settings' | 'quit' | 'admin-override' | null>(null);
  const [registered, setRegistered] = useState(false);
  const [connected, setConnected] = useState(false);

  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');

  const [pinEntry, setPinEntry] = useState('');
  const [pinEntryError, setPinEntryError] = useState('');

  const [appSettings, setAppSettings] = useState<CompanionSettings>({
    idleTimeoutMinutes: 15,
    foregroundApp: true,
    usbDevices: true,
  });

  useEffect(() => {
    window.companion.onInit(async ({ serverUrl: saved, requirePin, registered: reg, connected: conn }) => {
      if (saved) setServerUrl(saved);
      setRegistered(reg);
      setConnected(conn);

      // Load settings on init
      window.companion
        .getSettings()
        .then(setAppSettings)
        .catch(() => undefined);

      if (requirePin) {
        setPendingAction(requirePin);
        setStep('pin-entry');
        return;
      }

      const [p, pinSet] = await Promise.all([window.companion.getPermissions(), window.companion.isPinSet()]);
      setPerms(p);

      // PIN is mandatory: route to setup whenever none is set, not just on a
      // brand-new install (already-registered devices must get prompted too).
      if (p.needed && !p.accessibility) {
        setStep('permissions');
      } else if (!pinSet) {
        setStep('pin-setup');
      } else {
        setStep('url');
      }
    });

    window.companion.onWsStatus((s) => {
      setConnected(s === 'connected');
      setStatusText(s === 'connected' ? 'Connected — awaiting registration…' : 'Reconnecting…');
    });
    window.companion.onRegistered(({ id }) => {
      setDeviceId(id);
      setStep('done');
    });
  }, []);

  useEffect(() => {
    if (step !== 'permissions') return;
    const id = setInterval(async () => {
      const [p, pinSet] = await Promise.all([window.companion.getPermissions(), window.companion.isPinSet()]);
      setPerms(p);
      if (p.accessibility) {
        clearInterval(id);
        setStep(!pinSet ? 'pin-setup' : 'url');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  async function handleGrantAccessibility() {
    const p = await window.companion.requestPermission('accessibility');
    setPerms(p);
    if (p.accessibility) {
      const pinSet = await window.companion.isPinSet();
      setStep(!pinSet ? 'pin-setup' : 'url');
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
    if (pendingAction === 'admin-override') {
      // Main process re-verifies the PIN itself; treat a false return as wrong PIN
      const ok = await window.companion.enableAdminOverride(pinEntry);
      if (!ok) {
        setPinEntryError('Incorrect PIN.');
      } else {
        setPinEntry(''); // clear plaintext PIN on success — window closes via main process
      }
      return;
    }
    const ok = await window.companion.verifyPin(pinEntry);
    if (!ok) {
      setPinEntryError('Incorrect PIN.');
      return;
    }
    setPinEntry(''); // clear plaintext PIN — settings path keeps the window open
    setPinEntryError('');
    if (pendingAction === 'quit') {
      await window.companion.confirmQuit();
    } else {
      setStep('url');
    }
  }

  async function handleDisconnect() {
    await window.companion.disconnect();
    setRegistered(false);
    setConnected(false);
    setConnectError('');
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
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 justify-end px-4 pt-2">
        <ThemeToggle label="Dark mode" />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 px-8 py-4">
          {step === 'loading' && <LoadingStep />}
          {step === 'permissions' && <PermissionsStep perms={perms} onGrant={handleGrantAccessibility} />}
          {step === 'pin-setup' && (
            <PinSetupStep
              pinInput={pinInput}
              pinConfirm={pinConfirm}
              error={pinSetupError}
              onPinInputChange={setPinInput}
              onPinConfirmChange={setPinConfirm}
              onSubmit={handleSetPin}
            />
          )}
          {step === 'pin-entry' &&
            (() => {
              const pinCopy = {
                quit: {
                  title: 'Confirm quit',
                  description: 'Enter your PIN to quit Attraccess Companion.',
                  submitLabel: 'Quit',
                },
                'admin-override': {
                  title: 'Admin override',
                  description: 'Enter your admin PIN to unlock the kiosk and ignore server commands.',
                  submitLabel: 'Enable override',
                },
                settings: {
                  title: 'Access settings',
                  description: 'Enter your PIN to access settings.',
                  submitLabel: 'Confirm',
                },
              }[pendingAction ?? 'settings'] ?? {
                title: 'Access settings',
                description: 'Enter your PIN to access settings.',
                submitLabel: 'Confirm',
              };
              return (
                <PinEntryStep
                  title={pinCopy.title}
                  description={pinCopy.description}
                  submitLabel={pinCopy.submitLabel}
                  pinEntry={pinEntry}
                  error={pinEntryError}
                  onPinEntryChange={setPinEntry}
                  onSubmit={handleVerifyPin}
                />
              );
            })()}
          {step === 'url' && (
            <UrlStep
              serverUrl={serverUrl}
              connectError={connectError}
              connecting={connecting}
              registered={registered}
              connected={connected}
              onServerUrlChange={setServerUrl}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onChangePin={pendingAction === 'settings' ? () => setStep('pin-setup') : undefined}
              onOpenSettings={pendingAction === 'settings' ? () => setStep('settings') : undefined}
            />
          )}
          {step === 'settings' && (
            <SettingsStep
              settings={appSettings}
              onSave={async (s) => {
                await window.companion.saveSettings(s);
                setAppSettings(s);
                setStep('url');
              }}
              onBack={() => setStep('url')}
            />
          )}
          {step === 'register' && <RegisterStep statusText={statusText} />}
          {step === 'done' && <DoneStep deviceId={deviceId} />}
        </section>
      </main>
    </div>
  );
}
