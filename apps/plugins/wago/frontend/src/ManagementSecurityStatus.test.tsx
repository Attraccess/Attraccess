import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagementSecurityStatus } from './ManagementSecurityStatus';
import type { ManagementPublicStatus } from '../../backend/wago-management.types';

afterEach(cleanup);
const inspected: ManagementPublicStatus = {
  controllerId: 7,
  state: 'inspected',
  support: 'UNSUPPORTED',
  mode: null,
  exceptions: [],
  keyFingerprint: null,
  reviewToken: null,
  failure: null,
  recoveryRequired: false,
  hardened: false,
  inspection: {
    model: 'cc100',
    firmware: '31',
    ssh: 'dropbear',
    dropbearVersion: '2025.88',
    serviceControl: 'sysv',
    uid: 1004,
    wbm: 'not_observed',
    otherManagement: 'not_observed',
    networkScope: 'local_socket_observation',
    passwordAccess: 'unknown',
    defaultAccess: 'unknown',
  },
};
function credentials() {
  fireEvent.change(screen.getByLabelText('Temporary SSH username'), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText('Temporary SSH password'), { target: { value: 'fixture-only' } });
}
const confirm = () => fireEvent.click(screen.getByRole('checkbox', { name: /I confirm the reviewed change/ }));

describe('Dropbear management click journey', () => {
  it('inspects, reviews, enrolls and recovers a version-gated key without claiming a full baseline', async () => {
    const reviewed: ManagementPublicStatus = {
      ...inspected,
      state: 'reviewed',
      support: 'supported',
      mode: 'key_only',
      exceptions: ['unqualified_privileges'],
      reviewToken: 'fixture-review',
    };
    const enrolled: ManagementPublicStatus = {
      ...reviewed,
      state: 'key_enrolled',
      support: 'qualification_required',
      keyFingerprint: 'SHA256:fixture',
    };
    const onInspect = vi.fn(async () => inspected);
    const onReview = vi.fn(async () => reviewed);
    const onApply = vi.fn(async () => enrolled);
    const onRecover = vi.fn(async () => ({ ...inspected, state: 'recovered' as const }));
    render(
      <ManagementSecurityStatus
        controllerId={7}
        status={null}
        onInspect={onInspect}
        onReview={onReview}
        onApply={onApply}
        onRecover={onRecover}
      />,
    );
    credentials();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect management' }));
    await screen.findByText('2025.88');
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Add management key only' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Acknowledge unqualified account privileges/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await waitFor(() =>
      expect(onReview).toHaveBeenCalledWith({ mode: 'key_only', exceptions: ['unqualified_privileges'] }),
    );
    await screen.findByText(/Review: snapshot authorized keys/);
    credentials();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed change' }));
    await screen.findByText('SHA256:fixture');
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ reviewToken: 'fixture-review', confirm: true }));
    expect(screen.getByText(/Management baseline not verified/)).toBeTruthy();
    expect(screen.getByText(/forwarding and PTY allocation/)).toBeTruthy();
    credentials();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: /Recover/ }));
    await waitFor(() => expect(onRecover).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/recovered/)).toBeTruthy());
  });

  it('keeps apply disabled for an unsupported Dropbear version', async () => {
    if (!inspected.inspection) throw new Error('Fixture inspection missing');
    const unknown = { ...inspected, inspection: { ...inspected.inspection, dropbearVersion: 'unknown' as const } };
    render(
      <ManagementSecurityStatus
        controllerId={7}
        status={unknown}
        onInspect={vi.fn()}
        onReview={async () => ({ ...unknown, state: 'reviewed', mode: 'key_only', reviewToken: 'unsupported' })}
        onApply={vi.fn()}
        onRecover={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add management key only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await screen.findByText(/Review: snapshot authorized keys/);
    confirm();
    expect((screen.getByRole('button', { name: 'Apply reviewed change' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
