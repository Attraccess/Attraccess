import { fireEvent } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { ExplicitRecoveryActionTestScope } from './CommissioningModal.test';
import type { ExplicitInstallActionTestScope } from './CommissioningModal.test';
import { render } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { CommissioningModal } from './CommissioningModal';
import type { RootTestRegistrationsTestScope } from './CommissioningModal.test';
import type { Fw31SoftwareSupportBoundaryTestScope } from './CommissioningModal.test';

export function registerClearsRecoveryCredentialsAndConsentOnSCloseChange(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it.each(['external', 'button', 'session'])('clears recovery credentials and consent on %s close/change', (mode) => {
    scope.activeSession.state = 'awaiting_discovery';
    const { rerender, view } = scope.mount();
    scope.fillRecoveryCredentials();
    if (mode === 'button') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    if (mode === 'session') scope.activeSession = { ...scope.activeSession, id: 8 };
    else rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
    expect(screen.queryByLabelText('Recovery SSH username')).toBeNull();
    scope.fillRecoveryCredentials();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
    expect(scope.requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });
}

export function registerClearsThePasswordOnTheCloseButton(scope: ExplicitInstallActionTestScope): void {
  it('clears the password on the Close button', () => {
    const { rerender, view, onOpenChange } = scope.mount();
    scope.fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    scope.fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(false);
  });
}

export function registerClearsThePasswordWhenClosedExternallyAndReopened(scope: ExplicitInstallActionTestScope): void {
  it('clears the password when closed externally and reopened', () => {
    const { rerender, view } = scope.mount();
    scope.fillCredentials();
    rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    scope.fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(false);
    expect(scope.requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
  });
}

export function registerCollectsOnlyNameAndIpWhenOneBrokerIsAvailableSelectsRuntimeAutomaticallyAndSupportsFo(
  scope: RootTestRegistrationsTestScope,
): void {
  it('collects only name and IP when one broker is available, selects runtime automatically and supports form submission', async () => {
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      const address = String(url);
      scope.requests.push({ url: address, body: options?.body as string | undefined });
      const data = address.endsWith('/settings')
        ? { defaultMqttServerId: 1 }
        : address.endsWith('/mqtt/servers')
          ? [{ id: 1, name: 'Default broker' }]
          : address.endsWith('/runtime-artifacts/current')
            ? {
                image: 'bundled-image',
                bytes: 1024,
                digest: 'digest',
                manifest: { runtimeVersion: '0.1.0', hardware: { model: '751-9301', firmwareBaseline: '31' } },
              }
            : options?.method === 'POST'
              ? { ...scope.activeSession, state: 'awaiting_identity_confirmation' }
              : address.includes('/commissioning/sessions')
                ? []
                : [];
      return { ok: true, text: async () => JSON.stringify(data) } as Response;
    });
    render(
      <QueryClientProvider client={scope.client}>
        <CommissioningModal isOpen session={null} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Controller name'), { target: { value: ' Workshop ' } });
    const nameForm = screen.getByLabelText('Controller name').closest('form');
    if (!nameForm) throw new Error('Name step must be a form');
    fireEvent.submit(nameForm);
    fireEvent.change(screen.getByLabelText('Controller IP address'), { target: { value: '10.77.0.7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    const connectionForm = screen.getByLabelText('Controller IP address').closest('form');
    if (!connectionForm) throw new Error('Connection step must be a form');
    fireEvent.submit(connectionForm);
    await screen.findByRole('button', { name: 'Use this controller' });
    const request = scope.requests.find(({ body }) => body?.includes('targetHost'));
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ name: 'Workshop', targetHost: '10.77.0.7', mqttServerId: 1 });
  });
}

export function registerDistinguishesSavedSInspectionFromVerifiedPreparationAfterALaterFailure(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it.each(['codesys-active', 'codesys-boot-enabled'])(
    'distinguishes saved %s inspection from verified preparation after a later failure',
    (exclusivity) => {
      scope.activeSession.state = 'delivery_failed';
      scope.activeSession.dockerProvisionState = 'started';
      scope.activeSession.codesysState = 'disabled';
      scope.activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'accessible',
        exclusivity,
        docker: 'running',
        configDocker: 'present',
        provision: 'prepare-controller',
        qualification: 'software-supported',
      });
      scope.mount();
      expect(screen.getByText(/Controller preparation verified CODESYS stopped and permanently disabled/)).toBeTruthy();
      expect(screen.getByText(/Saved inspection snapshot; these values are not live controller status/)).toBeTruthy();
      expect(screen.getByText(exclusivity, { exact: true })).toBeTruthy();
      expect(screen.queryByText(/CODESYS is active/)).toBeNull();
      expect(screen.queryByText(/CODESYS is configured to start at boot/)).toBeNull();
    },
  );
}

export function registerDoesNotOfferActivationForAnUnsupportedFirmwareReportEvenWhenAnInstalledRuntimeIsStopp(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it('does not offer activation for an unsupported firmware report even when an installed runtime is stopped', () => {
    scope.activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'unsupported-firmware',
      hardware: 'accessible',
      exclusivity: 'clear',
      docker: 'installed-stopped',
      configDocker: 'present',
      provision: 'review-start-installed-runtime',
      qualification: 'required',
    });
    scope.mount();
    expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
    expect(screen.getByText(/BSP version alone is insufficient/)).toBeTruthy();
    expect(scope.requests.some(({ url }) => url.endsWith('/activate'))).toBe(false);
  });
}

export function registerExplainsLostAuthenticationWithoutLosingTheLastKnownControllerProgress(
  scope: RootTestRegistrationsTestScope,
): void {
  it('explains lost authentication without losing the last known controller progress', async () => {
    scope.activeSession = {
      ...scope.session,
      state: 'delivering',
      progressPercent: 20,
      updatedAt: new Date().toISOString(),
    };
    const originalFetch = vi.mocked(fetch).getMockImplementation();
    if (!originalFetch) throw new Error('Fetch fixture is missing');
    vi.mocked(fetch).mockImplementation((url, options) =>
      String(url).includes('/commissioning/sessions?')
        ? Promise.resolve({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) } as Response)
        : originalFetch(url, options),
    );
    scope.mount();
    await waitFor(() => expect(screen.getByText(/Your login has expired/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
  });
}

export function registerExplainsMandatoryPlcDisablementAndReportsUnsupportedDockerDependencies(
  scope: Fw31SoftwareSupportBoundaryTestScope,
): void {
  it('explains mandatory PLC disablement and reports unsupported Docker dependencies', () => {
    scope.activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'supported',
      hardware: 'uid10001-access-denied',
      exclusivity: 'codesys-boot-enabled',
      docker: 'installed-stopped',
      configDocker: 'present',
      provision: 'unsupported-lifecycle-dependencies',
      qualification: 'required',
    });
    scope.mount();
    expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
    expect(screen.getByText(/CODESYS is configured to start at boot/)).toBeTruthy();
    expect(screen.getByText(/Installation must validate a supported activation path/)).toBeTruthy();
  });
}

export function registerExposesGuardedRecordDeletionForRevokedCommissioningHistory(
  scope: ExplicitRecoveryActionTestScope,
): void {
  it('exposes guarded record deletion for revoked commissioning history', async () => {
    scope.activeSession.state = 'revoked';
    const { onOpenChange } = scope.mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete commissioning record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, options]) => String(url).endsWith('/commissioning/sessions/7') && options?.method === 'DELETE',
        ),
    ).toBe(true);
  });
}

export function registerKeepsAFreshlyResumedSessionInsteadOfRegressingToAnOlderCachedResponse(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps a freshly resumed session instead of regressing to an older cached response', async () => {
    const old = {
      ...scope.session,
      state: 'delivering' as const,
      progressPercent: 20,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    scope.client.setQueryData(['wago', 'commissioning-sessions'], [old]);
    scope.activeSession = {
      ...old,
      progressPercent: 55,
      progressStep: 'Transferring runtime',
      updatedAt: '2026-01-01T00:05:00Z',
    };
    const originalFetch = vi.mocked(fetch).getMockImplementation();
    if (!originalFetch) throw new Error('Fetch fixture is missing');
    vi.mocked(fetch).mockImplementation((url, options) =>
      String(url).includes('/commissioning/sessions?')
        ? Promise.resolve({ ok: true, text: async () => JSON.stringify([old]) } as Response)
        : originalFetch(url, options),
    );
    scope.mount();
    await waitFor(() => expect(screen.getByText('Transferring runtime')).toBeTruthy());
    expect(screen.getByText('55%')).toBeTruthy();
  });
}

export function registerKeepsEnrollmentPendingWhenSHasNotBeenVerified(scope: RootTestRegistrationsTestScope): void {
  it.each(['permanentConnection', 'enrollmentRevoked'] as const)(
    'keeps enrollment pending when %s has not been verified',
    async (missing) => {
      scope.activeSession.state = 'awaiting_verification';
      scope.verificationControllerId = 2;
      scope.verificationOverrides = { permanentConnection: true, enrollmentRevoked: true, [missing]: false };
      scope.mount();
      await screen.findByText('Desired/reported configuration: pending');
      expect(screen.queryByText('Enrollment complete')).toBeNull();
    },
  );
}

export function registerLetsTheOperatorKeepEnrollmentAfterOpeningCancellationWithoutSendingARevocation(
  scope: RootTestRegistrationsTestScope,
): void {
  it('lets the operator keep enrollment after opening cancellation without sending a revocation', () => {
    scope.mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel enrollment' }));
    expect(
      screen.getByText('Canceling revokes the enrollment credential and deletes this commissioning session.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep enrollment' }));
    expect(
      screen.queryByText('Canceling revokes the enrollment credential and deletes this commissioning session.'),
    ).toBeNull();
    expect(scope.requests.some(({ url }) => url.endsWith('/cancel'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel enrollment' })).toBeTruthy();
  });
}
