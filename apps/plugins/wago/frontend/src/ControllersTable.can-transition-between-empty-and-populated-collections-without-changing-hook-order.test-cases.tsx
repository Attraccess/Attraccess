import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import type { WagoController } from './api';
import type { RootTestRegistrationsTestScope } from './ControllersTable.test';
import { fireEvent } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';

export function registerCanTransitionBetweenEmptyAndPopulatedCollectionsWithoutChangingHookOrder(
  scope: RootTestRegistrationsTestScope,
): void {
  it('can transition between empty and populated collections without changing hook order', () => {
    const props = { sessions: [], onResume: vi.fn(), onConfigure: vi.fn(), onClaim: vi.fn(), onRemove: vi.fn() };
    const wrap = (controllers: WagoController[]) => (
      <QueryClientProvider client={scope.client}>
        <ControllersTable {...props} controllers={controllers} />
      </QueryClientProvider>
    );
    const { rerender } = render(wrap([]));
    expect(screen.getByText('No controllers or commissioning sessions yet.')).toBeTruthy();
    rerender(wrap([scope.controller]));
    expect(screen.getByText('Fixture')).toBeTruthy();
    rerender(wrap([]));
    expect(screen.getByText('No controllers or commissioning sessions yet.')).toBeTruthy();
  });
}

export function registerDiscardsARecoveryPasswordResponseWhenTheDetailsDrawerCloses(
  scope: RootTestRegistrationsTestScope,
): void {
  it('discards a recovery password response when the details drawer closes', async () => {
    scope.getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null });
    let finish!: (value: { password: string }) => void;
    scope.getRootPassword.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    scope.mount();
    await scope.openDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    finish({ password: 'late-drawer-secret' });
    await scope.openDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
    expect(screen.queryByText('late-drawer-secret')).toBeNull();
    expect(scope.getRootPassword).toHaveBeenCalledTimes(1);
  });
}

export function registerDistinguishesBuildsSharingAVersionAndShowsFailuresWithoutAnActiveProgressBar(
  scope: RootTestRegistrationsTestScope,
): void {
  it('distinguishes builds sharing a version and shows failures without an active progress bar', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      update: {
        phase: 'failed',
        previousRuntimeVersion: '0.1.0',
        desiredRuntimeVersion: '0.1.0',
        previousImageId: 'sha256:aaaaaaaa1234',
        desiredImageId: 'sha256:bbbbbbbb1234',
        failure: 'storage',
        storageDiagnostics: [{ path: '/var/lib', requiredKiB: 180396, availableKiB: 179724 }],
        retryAt: 0,
      },
    });
    scope.mount();
    expect(await screen.findByLabelText('Runtime v0.1.0 (aaaaaaaa) → v0.1.0 (bbbbbbbb)')).toBeTruthy();
    expect(screen.queryByText(/insufficient free space/)).toBeNull();
    await scope.openDetails();
    expect(await screen.findByText(/insufficient free space/)).toBeTruthy();
    expect(
      await screen.findByText('/var/lib needs 176.2 MiB; 175.5 MiB is available. At least 0.7 MiB more is needed.'),
    ).toBeTruthy();
    expect(await screen.findByText(/The previous runtime is running/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry runtime update' })).toBeNull();
  });
}

export function registerDoesNotAskUsersToResumeCommissioningWhenVerifiedManagementFinishesAutomatically(
  scope: RootTestRegistrationsTestScope,
): void {
  it('does not ask users to resume commissioning when verified management finishes automatically', async () => {
    scope.getUpdateStatus.mockResolvedValue({ management: 'verified', sessionId: 7, update: null });
    scope.mount();
    await scope.openDetails();
    await screen.findByText(/update access key is verified/i);
    expect(screen.queryByText(/Resume commissioning/i)).toBeNull();
    expect(screen.getByText(/automatically/i)).toBeTruthy();
    expect(screen.queryByText(/needs attention/)).toBeNull();
  });
}

export function registerDoesNotDisplayALateRecoverySecretResponseAfterTheRecoverySectionCloses(
  scope: RootTestRegistrationsTestScope,
): void {
  it('does not display a late recovery-secret response after the recovery section closes', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: null,
      physicalQualification: 'unverified',
    });
    let finish!: (value: { password: string }) => void;
    scope.getRootPassword.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    scope.mount();
    await scope.openDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
    finish({ password: 'late-secret' });
    fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
    expect(await screen.findByRole('button', { name: 'Reveal root password (audited)' })).toBeTruthy();
    expect(screen.queryByText('late-secret')).toBeNull();
  });
}

export function registerDoesNotInferEnrollmentVerificationFromAnOnlineClaimedRow(
  scope: RootTestRegistrationsTestScope,
): void {
  it('does not infer enrollment verification from an online claimed row', async () => {
    scope.getVerification.mockResolvedValue({ ...scope.verified, enrollmentRevoked: false });
    scope.mount();
    await scope.openDetails();
    expect(await screen.findByText('Checking setup')).toBeTruthy();
    expect(screen.queryByText('Setup complete')).toBeNull();
  });
}

export function registerExplainsTheDestructiveReEnrolmentRequiredForLegacyControllers(
  scope: RootTestRegistrationsTestScope,
): void {
  it('explains the destructive re-enrolment required for legacy controllers', async () => {
    scope.mount();
    await scope.openDetails();
    await screen.findByText('Setup complete');
    expect(await screen.findByText('Re-enrolment required')).toBeTruthy();
    expect(screen.getByText(/wipes applications, data and configuration/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Runtime updates' })).toBeNull();
  });
}

export function registerHidesViewProgressOnceEnrollmentIsVerifiedKeepingConfigurationAndRuntimeInfoReachable(
  scope: RootTestRegistrationsTestScope,
): void {
  it('hides "View progress" once enrollment is verified, keeping configuration and runtime info reachable', async () => {
    const onResume = vi.fn();
    const onConfigure = vi.fn();
    scope.mount(onResume, onConfigure);
    expect(screen.queryByRole('button', { name: 'Setup progress' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    await scope.openDetails();
    expect(await screen.findByText('Setup complete')).toBeTruthy();
    expect(onConfigure).toHaveBeenCalledWith(1);
    expect(onResume).not.toHaveBeenCalled();
  });
}

export function registerKeepsAdministratorRecoveryAvailableForARemovedControllerSession(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps administrator recovery available for a removed controller session', async () => {
    scope.getSessionStatus.mockResolvedValue({
      management: 'retired',
      sessionId: 7,
      update: null,
      physicalQualification: 'unverified',
    });
    render(
      <QueryClientProvider client={scope.client}>
        <ControllersTable
          controllers={[]}
          sessions={[{ ...scope.session, state: 'revoked', managedAccessAvailable: true }]}
          onResume={vi.fn()}
          onConfigure={vi.fn()}
          onClaim={vi.fn()}
          onRemove={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Recovery available')).toBeTruthy();
    expect(screen.queryByText('Enrolling')).toBeNull();
    expect(screen.queryByText('In progress')).toBeNull();
    expect(scope.getSessionStatus).not.toHaveBeenCalled();
    await scope.openDetails('fixture');
    expect(await screen.findByText('Automatic management retired')).toBeTruthy();
    expect(scope.getSessionStatus).toHaveBeenCalledWith(7);
    expect(scope.getRootPassword).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
    expect(screen.getByRole('button', { name: 'Reveal root password (audited)' })).toBeTruthy();
  });
}

export function registerKeepsAnOfflineControllerVisiblyNotRespondingWhileRuntimeVerificationIsPending(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps an offline controller visibly not responding while runtime verification is pending', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      update: null,
    });
    scope.mount(vi.fn(), vi.fn(), { ...scope.controller, connectivity: 'stale' });
    await waitFor(() => expect(scope.getUpdateStatus).toHaveBeenCalled());
    await waitFor(() => expect(scope.client.isFetching()).toBe(0));

    expect(screen.getByText('Not responding')).toBeTruthy();
    expect(screen.queryByText('Software update')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Update queued' })).toBeNull();
  });
}

export function registerKeepsAnOfflineUpdateFailureVisibleWithoutReplacingConnectivityWithThePendingImageMismat(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps an offline update failure visible without replacing connectivity with the pending image mismatch', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      runtime: {
        runningVersion: '0.1.0',
        runningImageId: 'sha256:previous',
        desiredVersion: '0.2.0',
        desiredImageId: 'sha256:desired',
      },
      update: { phase: 'blocked', desiredImageId: 'sha256:desired', failure: 'offline' },
    });
    scope.mount(vi.fn(), vi.fn(), { ...scope.controller, connectivity: 'stale' });
    await waitFor(() => expect(scope.getUpdateStatus).toHaveBeenCalled());
    await waitFor(() => expect(scope.client.isFetching()).toBe(0));

    expect(screen.getByText('Not responding')).toBeTruthy();
    expect(screen.queryByText('Software update')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('blocked');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
}

export function registerKeepsDetailedFailuresAndAdministratorControlsOutOfTheCompactTable(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps detailed failures and administrator controls out of the compact table', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: { phase: 'failed', failure: 'storage', desiredImageId: 'sha256:desired', retryAt: 0 },
    });
    scope.mount();
    const table = screen.getByRole('grid');
    expect(await within(table).findByText('Needs attention')).toBeTruthy();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((element) => element.textContent),
    ).toEqual(['Device', 'Status', 'Software', 'Last seen', 'Actions']);
    expect(within(table).queryByText(/insufficient free space/)).toBeNull();
    expect(within(table).queryByRole('button', { name: 'Recovery tools' })).toBeNull();
    expect(within(table).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(table).getAllByRole('button')).toHaveLength(2);
    const drawer = await scope.openDetails();
    expect(await within(drawer).findByText(/insufficient free space/)).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Remove' })).toBeTruthy();
  });
}
