import { ThemeToggle } from '@attraccess/ui';
import { LoadingStep } from './steps/LoadingStep';
import { PermissionsStep } from './steps/PermissionsStep';
import { PinSetupStep } from './steps/PinSetupStep';
import { PinEntryStep } from './steps/PinEntryStep';
import { UrlStep } from './steps/UrlStep';
import { RegisterStep } from './steps/RegisterStep';
import { DoneStep } from './steps/DoneStep';
import { SettingsStep } from './steps/SettingsStep';
import { useWizardAppState } from './useWizardAppState';

export function WizardApp() {
  const {
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
  } = useWizardAppState();

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
