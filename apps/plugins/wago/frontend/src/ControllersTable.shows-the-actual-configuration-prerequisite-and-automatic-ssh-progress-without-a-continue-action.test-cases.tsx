import { act } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { RootTestRegistrationsTestScope } from './ControllersTable.test';
import { fireEvent } from '@testing-library/react';
import { within } from '@testing-library/react';

export function registerShowsTheActualConfigurationPrerequisiteAndAutomaticSshProgressWithoutAContinueAction(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows the actual configuration prerequisite and automatic SSH progress without a continue action', async () => {
    const status = {
      management: 'verified',
      sessionId: 7,
      update: null,
      managementSetup: { state: 'waiting', reason: 'configuration' },
    };
    scope.getUpdateStatus.mockResolvedValue(status);
    const onConfigure = vi.fn();
    scope.mount(vi.fn(), onConfigure);
    await scope.openDetails();
    expect(await screen.findByText(/Select Configure, review and publish/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Configure' })).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/prüfe und veröffentliche die Ein- und Ausgangskonfiguration/)).toBeTruthy();
    expect(screen.queryByText(/Setze die Inbetriebnahme fort/)).toBeNull();
    act(() => useTranslationState.getState().setLanguage('en'));
    scope.getUpdateStatus.mockResolvedValue({ ...status, managementSetup: { state: 'running', reason: 'reboot' } });
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    expect(
      await screen.findByRole('progressbar', { name: 'Rebooting the CC100 and checking secure update access…' }),
    ).toBeTruthy();
    expect(screen.queryByText(/Select Configure, review and publish/)).toBeNull();
    scope.getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null });
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
    expect(screen.queryByText(/The update access key is verified/)).toBeNull();
    expect(scope.getRootPassword).not.toHaveBeenCalled();
  });
}

export function registerShowsTheSavedSshSetupFailureInTheDetailsDrawerInTheSelectedLanguage(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows the saved SSH setup failure in the details drawer in the selected language', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'recovery_required',
      sessionId: 7,
      update: null,
      managementFailure:
        'Automatic SSH setup failed (key_commit). The update access key could not be confirmed on the controller. Another installation or supervisor check may still be running. Keep the controller connected and retry update access setup.',
    });
    scope.mount();
    await scope.openDetails();
    expect(await screen.findByText(/Another installation or supervisor check may still be running/)).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(
      screen.getByText(/Möglicherweise läuft noch eine Installation oder eine Prüfung der Laufzeitüberwachung/),
    ).toBeTruthy();
  });
}

export function registerTranslatesRecognizedSavedFailuresOnMountedControllerRowsWhileRetainingUnknownText(
  scope: RootTestRegistrationsTestScope,
): void {
  it('translates recognized saved failures on mounted controller rows while retaining unknown text', async () => {
    const reason = 'Commissioning was interrupted.';
    scope.session.failureReason = reason;
    try {
      scope.mount();
      await scope.openDetails();
      await screen.findByText(reason);
      const count = scope.getVerification.mock.calls.length;
      act(() => useTranslationState.getState().setLanguage('de'));
      expect(screen.getByText(/Die Inbetriebnahme wurde unterbrochen/)).toBeTruthy();
      expect(scope.getVerification.mock.calls.length).toBe(count);
    } finally {
      scope.session.failureReason = null;
    }
  });
}

export function registerTranslatesRuntimeRetriesAndRecoveryInPlaceWhenTheHostLanguageChanges(
  scope: RootTestRegistrationsTestScope,
): void {
  it('translates runtime retries and recovery in place when the host language changes', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: { phase: 'failed', desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
    });
    scope.mount();
    await scope.openDetails();
    await screen.findByText(/Last failure: readiness/);
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/Letzter Fehler: Betriebsbereitschaft/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellungsoptionen' }));
    expect(screen.getByRole('button', { name: 'Software-Update erneut versuchen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Root-Passwort anzeigen (protokolliert)' })).toBeTruthy();
    expect(scope.getRootPassword).not.toHaveBeenCalled();
  });
}

export function registerUsesNaturalGermanColumnAndRegistrationLabels(scope: RootTestRegistrationsTestScope): void {
  it('uses natural German column and registration labels', async () => {
    useTranslationState.setState({ language: 'de' });
    scope.mount();
    const table = screen.getByRole('grid');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((element) => element.textContent),
    ).toEqual(['Gerät', 'Status', 'Software', 'Zuletzt gesehen', 'Aktionen']);
    expect(screen.queryByText('Vertrauen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details zu Fixture' }));
    expect(await screen.findByText('Registriert')).toBeTruthy();
    expect(screen.queryByText('Übernommen')).toBeNull();
  });
}

export function registerWithdrawsCachedSuccessWhenVerificationPollingFails(
  scope: RootTestRegistrationsTestScope,
): void {
  it('withdraws cached success when verification polling fails', async () => {
    scope.mount();
    await scope.openDetails();
    await screen.findByText('Setup complete');
    scope.getVerification.mockRejectedValue(new Error('offline'));
    await scope.client.invalidateQueries({ queryKey: ['wago', 'commissioning-verification', 7] });
    expect(await within(screen.getByRole('dialog')).findByText('Status unavailable')).toBeTruthy();
    expect(screen.queryByText('Setup complete')).toBeNull();
  });
}

export function registerWithholdsTheRuntimeVerifiedLabelWhileAnEnrolledControllerRequiresAnUpdate(
  scope: RootTestRegistrationsTestScope,
): void {
  it('withholds the runtime verified label while an enrolled controller requires an update', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      update: null,
    });
    scope.mount(vi.fn(), vi.fn(), { ...scope.controller, connectivity: 'runtime_update' });
    expect(await screen.findByText('Software update')).toBeTruthy();
    expect(screen.queryByText('Setup complete')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Update queued' })).toBeTruthy();
  });
}
