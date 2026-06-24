import { useState, useEffect, useRef } from 'react';
import { Card } from '@heroui/react';
import type { Step, Permissions } from './types';
import { LoadingStep } from './steps/LoadingStep';
import { PermissionsStep } from './steps/PermissionsStep';
import { PinSetupStep } from './steps/PinSetupStep';
import { PinEntryStep } from './steps/PinEntryStep';
import { UrlStep } from './steps/UrlStep';
import { RegisterStep } from './steps/RegisterStep';
import { DoneStep } from './steps/DoneStep';

export function WizardApp() {
  const [step, setStep] = useState<Step>('loading');
  const [serverUrl, setServerUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [pendingAction, setPendingAction] = useState<'settings' | 'quit' | null>(null);

  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');

  const [pinEntry, setPinEntry] = useState('');
  const [pinEntryError, setPinEntryError] = useState('');

  const isFirstRunRef = useRef(false);

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
          {step === 'pin-entry' && (
            <PinEntryStep
              title={pendingAction === 'quit' ? 'Confirm quit' : 'Access settings'}
              description={pendingAction === 'quit'
                ? 'Enter your PIN to quit Attraccess Companion.'
                : 'Enter your PIN to access settings.'}
              submitLabel={pendingAction === 'quit' ? 'Quit' : 'Confirm'}
              pinEntry={pinEntry}
              error={pinEntryError}
              onPinEntryChange={setPinEntry}
              onSubmit={handleVerifyPin}
            />
          )}
          {step === 'url' && (
            <UrlStep
              serverUrl={serverUrl}
              connectError={connectError}
              connecting={connecting}
              onServerUrlChange={setServerUrl}
              onConnect={handleConnect}
            />
          )}
          {step === 'register' && <RegisterStep statusText={statusText} />}
          {step === 'done' && <DoneStep deviceId={deviceId} />}
        </Card.Content>
      </Card>
    </div>
  );
}
