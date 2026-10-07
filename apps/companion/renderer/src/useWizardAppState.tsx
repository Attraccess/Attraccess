import { useState, useEffect } from 'react';
import type { Step, Permissions, CompanionSettings } from './types';

export function useWizardAppState() {
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
  return {
    step,
    setStep,
    serverUrl,
    setServerUrl,
    connectError,
    statusText,
    connecting,
    deviceId,
    perms,
    pendingAction,
    registered,
    connected,
    pinInput,
    setPinInput,
    pinConfirm,
    setPinConfirm,
    pinSetupError,
    pinEntry,
    setPinEntry,
    pinEntryError,
    appSettings,
    setAppSettings,
    handleGrantAccessibility,
    handleSetPin,
    handleVerifyPin,
    handleDisconnect,
    handleConnect,
  } as const;
}
