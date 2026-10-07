import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { ExplicitRecoveryActionTestScope } from './CommissioningModal.test';
import { fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { CommissioningModal } from './CommissioningModal';
import { waitFor } from '@testing-library/react';
import type { RootTestRegistrationsTestScope } from './CommissioningModal.test';
import type { Fw31SoftwareSupportBoundaryTestScope } from './CommissioningModal.test';
import { act } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { ExplicitInstallActionTestScope } from './CommissioningModal.test';

export function registerOffersManualRecoveryInSWithoutStartingIt(scope: ExplicitRecoveryActionTestScope): void {
  it.each(['delivery_failed', 'awaiting_discovery', 'awaiting_verification'] as const)(
    'offers manual recovery in %s without starting it',
    (state) => {
      scope.activeSession.state = state;
      scope.mount();
      expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByText(/Previous applications and CODESYS are not restored/)).toBeTruthy();
      expect(scope.requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
    },
  );
}

export function registerOffersPreparationCleanupAloneWithoutRuntimeRecoveryOwnershipS(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it.each([false, undefined])(
    'offers preparation cleanup alone without runtime recovery ownership (%s)',
    (available) => {
      scope.activeSession.state = 'delivery_failed';
      scope.activeSession.dockerProvisionState = 'recovery_required';
      scope.activeSession.runtimeRecoveryAvailable = available;
      scope.mount();
      expect(screen.queryByRole('button', { name: 'Clean up failed installation' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Clean up controller preparation' })).toBeTruthy();
    },
  );
}

export function registerOpensTheExistingVisualConfigurationWorkflowWithoutClaimingHardwareQualification(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it('opens the existing visual configuration workflow without claiming hardware qualification', async () => {
    scope.activeSession.state = 'awaiting_verification';
    scope.verificationControllerId = 5;
    const onConfigure = vi.fn();
    render(
      <QueryClientProvider client={scope.client}>
        <CommissioningModal isOpen session={scope.activeSession} onOpenChange={vi.fn()} onConfigure={onConfigure} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Configure inputs and outputs' }));
    expect(onConfigure).toHaveBeenCalledWith(5);
    expect(screen.getByText('Physical qualification: required before production use')).toBeTruthy();
  });
}

export function registerRequiresReviewedIdentityBeforeConfirmingAHostKeyIsolatedS(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each([false, true])('requires reviewed identity before confirming a host key (isolated=%s)', async (isolated) => {
    scope.activeSession.state = 'awaiting_identity_confirmation';
    scope.mount();
    const button = screen.getByRole('button', { name: 'Confirm host key' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reviewed SSH host-key fingerprint'), { target: { value: 'SHA256:wrong' } });
    expect(button.disabled).toBe(true);
    if (isolated) {
      fireEvent.click(screen.getByRole('button', { name: 'Use this controller' }));
    } else {
      fireEvent.change(screen.getByLabelText('Reviewed SSH host-key fingerprint'), {
        target: { value: 'SHA256:test' },
      });
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
    }
    await waitFor(() => expect(scope.requests.some(({ url }) => url.endsWith('/confirm-host-key'))).toBe(true));
    expect(JSON.parse(scope.requests.find(({ url }) => url.endsWith('/confirm-host-key'))?.body ?? '{}')).toEqual({
      hostKeyFingerprint: 'SHA256:test',
      physicalIdentityConfirmed: isolated,
      trustMethod: isolated ? 'isolated_service_connection' : 'trusted_inventory',
    });
  });
}

export function registerRetainsTheActiveCodesysWarningWhenDisablingFailed(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it('retains the active CODESYS warning when disabling failed', () => {
    scope.activeSession.state = 'delivery_failed';
    scope.activeSession.dockerProvisionState = 'recovery_required';
    scope.activeSession.codesysState = 'active';
    scope.activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'supported',
      hardware: 'accessible',
      exclusivity: 'codesys-active',
      docker: 'running',
      configDocker: 'present',
      provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    scope.mount();
    expect(screen.getByText(/CODESYS is active/)).toBeTruthy();
    expect(screen.queryByText(/Controller preparation verified CODESYS stopped and permanently disabled/)).toBeNull();
  });
}

export function registerRoutesCleanupThroughTheRuntimeWhenBothInstallationAndPreparationRecordsExist(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it('routes cleanup through the runtime when both installation and preparation records exist', () => {
    scope.activeSession.state = 'delivery_failed';
    scope.activeSession.dockerProvisionState = 'started';
    scope.activeSession.runtimeRecoveryAvailable = true;
    scope.mount();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBeNull();
  });
}

export function registerShowsASpecificFailureAndOnlyCleanupWhenAnInstallationNeedsRecovery(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows a specific failure and only cleanup when an installation needs recovery', () => {
    scope.activeSession = {
      ...scope.session,
      state: 'delivery_failed',
      runtimeRecoveryAvailable: true,
      failureReason:
        'Managed SSH setup failed (proof). The new management SSH key could not be verified. Check SSH access on port 22 and the scoped sudo policy.',
    };
    scope.mount();
    expect(screen.getByText(/Check SSH access on port 22/)).toBeTruthy();
    expect(screen.getByText('Controller: 192.0.2.7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry installation' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/Prüfe den SSH-Zugriff auf Port 22/)).toBeTruthy();
  });
}

export function registerShowsSavedUtcSkewActionAndResultWithoutClaimingLiveSynchronization(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it('shows saved UTC skew, action and result without claiming live synchronization', () => {
    scope.activeSession.platformReport = JSON.stringify({
      clock: {
        hostUtc: '2026-09-06T18:00:00.000Z',
        controllerUtc: '2026-09-06T18:00:00.000Z',
        previousSkewSeconds: -134972158,
        skewSeconds: 0,
        uncertaintySeconds: 1,
        observation: 'after-action',
        tool: 'supported',
        action: 'synchronize',
        result: 'synchronized',
      },
    });
    scope.mount();
    expect(screen.getByText('Saved clock result (not live)')).toBeTruthy();
    expect(screen.getByText('synchronized')).toBeTruthy();
    expect(screen.getByText('-134972158 seconds')).toBeTruthy();
    expect(screen.getByText('supported / synchronize')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Unterstützt / Synchronisieren')).toBeTruthy();
    expect(screen.getByText(/^Nach der Aktion; Unsicherheit 1 Sekunden\./)).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(scope.requests.some(({ url }) => url.endsWith('/deliver') || url.endsWith('/inspect'))).toBe(false);
  });
}

export function registerShowsTheLastControllerCheckpointOnTheFailureScreen(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows the last controller checkpoint on the failure screen', async () => {
    scope.activeSession = {
      ...scope.session,
      state: 'delivery_failed',
      failureReason: 'Controller operation timed out.',
      progressStep: 'Delivery failed',
      auditLog: JSON.stringify([{ at: new Date().toISOString(), event: 'progress: Checking controller hardware' }]),
    };
    scope.mount();
    await waitFor(() => expect(screen.getByText('Stopped while: Checking controller hardware')).toBeTruthy());
  });
}

export function registerShowsVerifiedEnrollmentSeparatelyFromUnfinishedConfigurationAndManagement(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows verified enrollment separately from unfinished configuration and management', async () => {
    scope.activeSession.state = 'awaiting_verification';
    scope.activeSession.progressStep = 'Verifying commissioned controller';
    scope.activeSession.progressDetail = 'Claim sent. Permanent connection still requires verification.';
    scope.verificationControllerId = 2;
    scope.verificationOverrides = {
      permanentConnection: true,
      enrollmentRevoked: true,
      managementHardening: 'unverified',
    };
    scope.mount();
    expect(await screen.findByText('Enrollment complete')).toBeTruthy();
    expect(screen.getByText('Runtime enrollment complete')).toBeTruthy();
    expect(screen.queryByText('Commissioning is not yet verified')).toBeNull();
    expect(screen.queryByText(scope.activeSession.progressDetail)).toBeNull();
    expect(screen.getByText('Desired/reported configuration: pending')).toBeTruthy();
    expect(screen.getByText('Secure update access: unverified')).toBeTruthy();
  });
}

export function registerShowsWhenTheControllerLastUpdatedAndTheRemainingOperationTime(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows when the controller last updated and the remaining operation time', async () => {
    const now = Date.now();
    scope.activeSession = {
      ...scope.session,
      state: 'delivering',
      progressPercent: 22,
      updatedAt: new Date(now - 125_000).toISOString(),
      operationDeadlineAt: new Date(now + 600_000).toISOString(),
    };
    scope.mount();
    await waitFor(() => expect(screen.getByText(/Status checked \d+s ago/)).toBeTruthy());
    expect(screen.getByText(/Last controller update 2m/)).toBeTruthy();
    expect(screen.getByText(/Installation time limit/)).toBeTruthy();
  });
}

export function registerSubmitsOnceAndClearsSecretsAfterSubmissionFailureS(
  scope: ExplicitInstallActionTestScope,
): void {
  it.each([false, true])('submits once and clears secrets after submission (failure=%s)', async (failure) => {
    scope.failInstall = failure;
    if (failure) scope.activeSession.state = 'delivery_failed';
    scope.mount();
    const install = screen.getByRole('button', { name: failure ? 'Retry installation' : 'Install runtime' });
    expect(screen.queryByLabelText('Temporary SSH username')).toBeNull();
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    expect(install.hasAttribute('disabled')).toBe(false);
    scope.fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(false);
    fireEvent.click(install);
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(scope.requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1));
    const request = scope.requests.find(({ url }) => url.endsWith('/deliver'));
    expect(JSON.parse(request?.body ?? '{}')).toEqual({
      confirmInstall: true,
      temporarySsh: { username: 'operator', password: 'test-only-password' },
    });
    await waitFor(() => expect(scope.client.isMutating()).toBe(0));
    expect(
      JSON.stringify(
        scope.client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('test-only-password');
    expect(
      JSON.stringify(
        scope.client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('"confirmInstall":true');
    expect(install.hasAttribute('disabled')).toBe(true);
    // Re-entering credentials enables a new explicit action; it never submits automatically.
    scope.fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(false);
    expect(scope.requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1);
  });
}
