import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { Fw31SoftwareSupportBoundaryTestScope } from './CommissioningModal.test';
import { act } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { RootTestRegistrationsTestScope } from './CommissioningModal.test';
import { fireEvent } from '@testing-library/react';
import type { ExplicitRecoveryActionTestScope } from './CommissioningModal.test';
import type { ExplicitInstallActionTestScope } from './CommissioningModal.test';

export function registerSuppressesStaleSavedActivationWhileRetainingPendingRecoveryS(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it.each([null, 'starting'] as const)(
    'suppresses stale saved activation while retaining pending recovery (%s)',
    (state) => {
      scope.activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'accessible',
        exclusivity: 'clear',
        docker: 'installed-stopped',
        configDocker: 'present',
        provision: 'review-start-installed-runtime',
        qualification: 'required',
      });
      scope.activeSession.dockerProvisionState = state;
      scope.mount();
      expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
      expect(!!screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBe(!!state);
      expect(scope.requests.some(({ url }) => url.endsWith('/activate'))).toBe(false);
    },
  );
}

export function registerSwitchesSavedCommissioningFailuresWithoutNewRequestsS(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each(['delivery_failed', 'claim_interrupted'] as const)(
    'switches saved commissioning failures without new requests: %s',
    async (state) => {
      scope.activeSession = { ...scope.session, state, failureReason: 'Commissioning was interrupted.' };
      scope.mount();
      await screen.findAllByText(scope.activeSession.failureReason!);
      await waitFor(() => expect(scope.requests.some(({ url }) => url.endsWith('/settings'))).toBe(true));
      const count = scope.requests.length;
      act(() => useTranslationState.getState().setLanguage('de'));
      expect(screen.getAllByText('Die Inbetriebnahme wurde unterbrochen.').length).toBeGreaterThan(0);
      expect(scope.requests).toHaveLength(count);
    },
  );
}

export function registerSwitchesTheSavedPreparationStatusWithoutAnotherRequestS(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it.each([
    ['starting', 'Wird gestartet'],
    ['started', 'Gestartet'],
    ['recovering', 'Wird wiederhergestellt'],
    ['restored', 'Wiederhergestellt'],
    ['recovery_required', 'Wiederherstellung erforderlich'],
    ['vendor.preparation-v2', 'vendor.preparation-v2'],
  ])('switches the saved preparation status without another request (%s)', async (state, german) => {
    scope.activeSession.dockerProvisionState = state;
    scope.mount();
    await screen.findByText((text) => text.startsWith(`Saved controller preparation: ${state}.`));
    const requestCount = scope.requests.length;
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText((text) => text.startsWith(`Gespeicherte Steuerungsvorbereitung: ${german}.`))).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.getByText((text) => text.startsWith(`Saved controller preparation: ${state}.`))).toBeTruthy();
    expect(scope.requests).toHaveLength(requestCount);
    expect(scope.requests.some(({ url }) => url.endsWith('/deliver') || url.endsWith('/inspect'))).toBe(false);
  });
}

export function registerSwitchesVerificationAndCompletedSummaryStatusesWithTheHostLanguageCompleteS(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each([false, true])(
    'switches verification and completed-summary statuses with the host language (complete: %s)',
    async (complete) => {
      scope.activeSession.state = 'awaiting_verification';
      scope.activeSession.updatedAt = '2026-09-06T18:00:00.000Z';
      scope.verificationControllerId = 2;
      scope.verificationOverrides = {
        permanentConnection: true,
        enrollmentRevoked: true,
        configurationApplied: complete,
        managementHardening: 'supported',
        hardwareReadiness: 'ready',
      };
      scope.mount();
      await screen.findByText(complete ? 'supported' : 'Secure update access: supported');
      act(() => useTranslationState.getState().setLanguage('de'));
      expect(screen.getByText(complete ? 'Unterstützt' : 'Sicherer Update-Zugang: Unterstützt')).toBeTruthy();
      if (!complete) expect(screen.getByText('Hardware-Prüfung der Laufzeitumgebung: Bereit')).toBeTruthy();
      act(() => useTranslationState.getState().setLanguage('en'));
      expect(screen.getByText(complete ? 'supported' : 'Secure update access: supported')).toBeTruthy();
    },
  );
}

export function registerTargetsTheNewlyOpenedSessionAfterAnEarlierRecovery(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it('targets the newly opened session after an earlier recovery', async () => {
    scope.activeSession.state = 'awaiting_discovery';
    const { rerender, view } = scope.mount();
    scope.fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/7/recover'))).toHaveLength(1));
    await waitFor(() => expect(scope.client.isMutating()).toBe(0));
    scope.activeSession = { ...scope.activeSession, id: 8 };
    rerender(view(true));
    scope.fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/8/recover'))).toHaveLength(1));
  });
}

export function registerUsesASingleCleanupActionScrubsCredentialsAndNeverRetriesFailureS(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it.each([false, true])(
    'uses a single cleanup action, scrubs credentials, and never retries (failure=%s)',
    async (failure) => {
      scope.activeSession.state = 'delivery_failed';
      scope.failRecovery = failure;
      scope.mount();
      const recover = screen.getByRole('button', { name: 'Clean up failed installation' });
      expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
      scope.fillRecoveryCredentials();
      expect(recover.hasAttribute('disabled')).toBe(false);
      fireEvent.click(recover);
      expect((screen.getByLabelText('Recovery SSH password') as HTMLInputElement).value).toBe('');
      await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(1));
      expect(JSON.parse(scope.requests.find(({ url }) => url.endsWith('/recover'))?.body ?? '{}')).toEqual({
        confirmInstall: true,
        temporarySsh: { username: 'recovery-operator', password: 'recovery-secret' },
      });
      await waitFor(() => expect(scope.client.isMutating()).toBe(0));
      const mutations = scope.client.getMutationCache().getAll();
      expect(mutations.every((mutation) => mutation.options.retry === false)).toBe(true);
      const variables = JSON.stringify(mutations.map((mutation) => mutation.state.variables));
      expect(variables).not.toContain('recovery-secret');
      expect(variables).not.toContain('recovery-operator');
      expect(variables).not.toContain('"confirmInstall":true');
      if (failure) expect(screen.getByText('Runtime snapshot unavailable')).toBeTruthy();
      scope.fillRecoveryCredentials();
      expect(recover.hasAttribute('disabled')).toBe(false);
      expect(screen.queryByRole('button', { name: 'Retry installation' })).toBeNull();
      expect(scope.requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
    },
  );
}

export function registerUsesFactorySshAccessWithoutAskingForAPasswordInTheNormalPath(
  scope: ExplicitInstallActionTestScope,
): void {
  it('uses factory SSH access without asking for a password in the normal path', async () => {
    scope.mount();
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    expect(screen.getAllByText('SSH login: Default root account').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Install runtime' }));
    await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1));
    expect(JSON.parse(scope.requests.find(({ url }) => url.endsWith('/deliver'))?.body ?? '{}').temporarySsh).toEqual({
      username: 'root',
      password: 'wago',
    });
  });
}

export function registerUsesTheDefaultRootLoginForCleanupWithoutAnotherCredentialPrompt(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it('uses the default root login for cleanup without another credential prompt', async () => {
    scope.activeSession.state = 'delivery_failed';
    scope.mount();
    expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(1));
    expect(JSON.parse(scope.requests.find(({ url }) => url.endsWith('/recover'))?.body ?? '{}').temporarySsh).toEqual({
      username: 'root',
      password: 'wago',
    });
  });
}

export function registerUsesTheInstallButtonAsTheConsequenceConfirmationForSWithoutPreservationOrWbmGates(
  scope: ExplicitInstallActionTestScope,
): void {
  it.each(['codesys-active', 'codesys-boot-enabled'])(
    'uses the install button as the consequence confirmation for %s without preservation or WBM gates',
    (exclusivity) => {
      scope.activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'uid10001-access-denied',
        exclusivity,
        docker: 'installed-stopped',
        configDocker: 'present',
        provision: 'prepare-controller',
        qualification: 'software-supported',
      });
      scope.mount();
      expect(screen.getByText('Before installing')).toBeTruthy();
      expect(screen.getByText(/Back up existing applications/)).toBeTruthy();
      expect(screen.getByText(/make connected equipment safe/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Recover saved runtime' })).toBeNull();
      scope.fillCredentials();
      const install = screen.getByRole('button', { name: 'Install runtime' });
      expect(install.hasAttribute('disabled')).toBe(false);
      expect(install.hasAttribute('disabled')).toBe(false);
      expect(scope.requests.filter(({ body }) => body)).toHaveLength(0);
    },
  );
}
