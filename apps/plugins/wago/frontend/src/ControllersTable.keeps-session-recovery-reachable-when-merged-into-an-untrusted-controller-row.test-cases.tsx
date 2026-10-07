import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import type { RootTestRegistrationsTestScope } from './ControllersTable.test';
import { fireEvent } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { act } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

export function registerKeepsSessionRecoveryReachableWhenMergedIntoAnUntrustedControllerRow(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps session recovery reachable when merged into an untrusted controller row', async () => {
    scope.getSessionStatus.mockResolvedValue({ management: 'recovery_required', sessionId: 7, update: null });
    render(
      <QueryClientProvider client={scope.client}>
        <ControllersTable
          controllers={[{ ...scope.controller, trustState: 'untrusted' }]}
          sessions={[{ ...scope.session, managedAccessAvailable: true }]}
          onResume={vi.fn()}
          onConfigure={vi.fn()}
          onClaim={vi.fn()}
          onRemove={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await scope.openDetails();
    expect(await screen.findByText('Managed SSH needs attention')).toBeTruthy();
    expect(scope.getSessionStatus).toHaveBeenCalledWith(7);
    expect(scope.getUpdateStatus).not.toHaveBeenCalled();
  });
}

export function registerOffersARuntimeRetryForAManagedControllerInSWithoutRetryingEnrolment(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each(['failed', 'blocked', 'recovery_required'])(
    'offers a runtime retry for a managed controller in %s without retrying enrolment',
    async (phase) => {
      scope.getUpdateStatus.mockResolvedValue({
        management: 'managed',
        sessionId: 7,
        update: { phase, desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
      });
      scope.mount();
      await scope.openDetails();
      fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
      fireEvent.click(screen.getByRole('button', { name: 'Retry runtime update' }));
      expect(scope.retryRuntimeUpdate).toHaveBeenCalledWith(1);
    },
  );
}

export function registerOffersManagedAccessRetryForAnEnrolmentRequiringRecovery(
  scope: RootTestRegistrationsTestScope,
): void {
  it('offers managed access retry for an enrolment requiring recovery', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'recovery_required',
      sessionId: 7,
      update: null,
    });
    scope.mount();
    await scope.openDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
    const retry = screen.getByRole('button', { name: 'Retry update access setup' });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    expect(scope.retryManagedAccess).toHaveBeenCalledWith(7);
    expect(scope.retryRuntimeUpdate).not.toHaveBeenCalled();
  });
}

export function registerRendersAndPollsOnlyTheCurrentPageAndFindsDevicesByNameIdAndAddress(
  scope: RootTestRegistrationsTestScope,
): void {
  it('renders and polls only the current page, and finds devices by name, ID and address', async () => {
    const fleet = Array.from({ length: 70 }, (_, index) => ({
      ...scope.controller,
      id: index + 1,
      hardwareId: `cc100-${index + 1}`,
      name: `Workshop ${index + 1}`,
    }));
    render(
      <QueryClientProvider client={scope.client}>
        <ControllersTable
          controllers={fleet}
          sessions={[{ ...scope.session, state: 'completed', hardwareId: 'cc100-69', targetHost: '192.168.1.69' }]}
          onResume={vi.fn()}
          onConfigure={vi.fn()}
          onClaim={vi.fn()}
          onRemove={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(scope.getUpdateStatus).toHaveBeenCalledTimes(25));
    const table = screen.getByRole('grid');
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(scope.getUpdateStatus).not.toHaveBeenCalledWith(26);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await within(table).findByText('Workshop 26')).toBeTruthy();
    expect(within(table).queryByText('Workshop 1')).toBeNull();
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: '192.168.1.69' } });
    expect(await within(table).findByText('Workshop 69')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByRole('navigation', { name: 'Controller pages' })).toBeNull();
    fireEvent.change(search, { target: { value: 'cc100-70' } });
    expect(await within(table).findByText('Workshop 70')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'Workshop 68' } });
    expect(await within(table).findByText('Workshop 68')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'does not exist' } });
    expect(await within(table).findByText('No matching controllers.')).toBeTruthy();
  });
}

export function registerShowsAnUnderstandableFallbackForFutureUnknownUpdateFailures(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows an understandable fallback for future unknown update failures', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: { phase: 'failed', failure: 'future-error', desiredImageId: 'sha256:desired', retryAt: 0 },
    });
    scope.mount();
    await scope.openDetails();
    expect(await screen.findByText(/An unrecognized update failure occurred/)).toBeTruthy();
    expect(screen.queryByText(/runtimeManagement.failures.future-error/)).toBeNull();
  });
}

export function registerShowsAutomaticUpdateProgressAndBeforeAfterVersionsInlineThroughCompletion(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows automatic update progress and before/after versions inline through completion', async () => {
    const status = {
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      runtime: {
        runningVersion: '0.1.0',
        runningImageId: 'sha256:aaaaaaaa',
        desiredVersion: '0.2.0',
        desiredImageId: 'sha256:bbbbbbbb',
      },
      update: {
        phase: 'staging',
        previousRuntimeVersion: '0.1.0',
        desiredRuntimeVersion: '0.2.0',
        previousImageId: 'sha256:aaaaaaaa',
        desiredImageId: 'sha256:bbbbbbbb',
        retryAt: 0,
      },
    };
    scope.getUpdateStatus.mockResolvedValue(status);
    scope.mount();
    expect(await screen.findByLabelText('Runtime v0.1.0 → v0.2.0')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Transferring software' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Runtime updates' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByRole('progressbar', { name: 'Software wird geladen' })).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    scope.getUpdateStatus.mockResolvedValue({ ...status, update: { ...status.update, phase: 'verifying' } });
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    expect(await screen.findByRole('progressbar', { name: 'Checking software' })).toBeTruthy();
    scope.getUpdateStatus.mockResolvedValue({
      ...status,
      runtimeUpdateRequired: false,
      runtime: { ...status.runtime, runningVersion: '0.2.0', runningImageId: 'sha256:bbbbbbbb' },
      update: { ...status.update, phase: 'current' },
    });
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    expect(await screen.findByText('Runtime updated')).toBeTruthy();
    expect(screen.getByLabelText('Runtime v0.1.0 → v0.2.0')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // A newer server release must replace the completed transition even before
    // the next update transaction has been persisted.
    scope.getUpdateStatus.mockResolvedValue({
      ...status,
      runtimeUpdateRequired: false,
      runtime: {
        ...status.runtime,
        runningVersion: '0.2.0',
        runningImageId: 'sha256:bbbbbbbb',
        desiredVersion: '0.3.0',
        desiredImageId: 'sha256:cccccccc',
      },
      update: { ...status.update, phase: 'current' },
    });
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    expect(await screen.findByLabelText('Runtime v0.2.0 → v0.3.0')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Update queued' })).toBeTruthy();
    expect(screen.queryByText('Runtime updated')).toBeNull();
    scope.getUpdateStatus.mockRejectedValue(new Error('Connection lost'));
    await scope.client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
    expect(await screen.findByText('Status unavailable')).toBeTruthy();
    expect(screen.queryByText('Runtime updated')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
}

export function registerShowsDurableUpdateFailureAndRequestsRecoverySecretsOnlyOnTheExplicitAuditedAction(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows durable update failure and requests recovery secrets only on the explicit audited action', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: { phase: 'failed', desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
      physicalQualification: 'unverified',
    });
    scope.getRootPassword.mockResolvedValue({ password: 'fixture-recovery-secret' });
    scope.mount();
    await scope.openDetails();
    await screen.findByText('Setup complete');
    expect(await screen.findByText(/Last failure: readiness/)).toBeTruthy();
    expect(scope.getRootPassword).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
    expect(await screen.findByText('fixture-recovery-secret')).toBeTruthy();
    expect(scope.getRootPassword).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole('button', { name: 'Hide recovery password' }));
    expect(screen.queryByText('fixture-recovery-secret')).toBeNull();
  });
}

export function registerShowsStartupSoftwareVerificationWithoutAnnouncingOrQueuingAnUpdate(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows startup software verification without announcing or queuing an update', async () => {
    scope.getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      runtimeUpdateRequired: true,
      runtime: {
        runningVersion: '0.1.0',
        runningImageId: null,
        desiredVersion: '0.1.0',
        desiredImageId: 'sha256:desired',
      },
      update: null,
    });
    scope.mount(vi.fn(), vi.fn(), { ...scope.controller, connectivity: 'runtime_check' });
    await waitFor(() => expect(scope.getUpdateStatus).toHaveBeenCalled());
    await waitFor(() => expect(scope.client.isFetching()).toBe(0));

    expect(screen.getByText('Checking software')).toBeTruthy();
    expect(screen.queryByText('Software update')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Update queued' })).toBeNull();
    expect(screen.getByText('v0.1.0')).toBeTruthy();
  });
}
