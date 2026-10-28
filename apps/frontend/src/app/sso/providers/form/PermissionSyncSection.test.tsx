import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PermissionSyncSection } from './PermissionSyncSection';

const byCy = (cy: string) => document.querySelector(`[data-cy="${cy}"]`);

// Only Switch.Content is interactive under HeroUI 3.2 (ATT-729), so click the track inside it.
const toggle = () =>
  fireEvent.click(
    byCy('sso-provider-form-oidc-permission-sync-toggle')?.querySelector('[data-slot="switch-control"]') as HTMLElement,
  );

describe('PermissionSyncSection', () => {
  it('is off without an interval and still shows the identity provider requirements', () => {
    render(<PermissionSyncSection value={null} onChange={vi.fn()} />);

    expect(byCy('sso-provider-form-oidc-permission-sync-ttl-input')).toBeNull();
    expect(byCy('sso-provider-form-oidc-permission-sync-requirements')).toBeInTheDocument();
    expect(screen.getByText(/SSO Session Idle/)).toBeInTheDocument();
    expect(screen.getByText(/offline_access scope/)).toBeInTheDocument();
  });

  it('enables re-sync with a 60 minute default interval', () => {
    const onChange = vi.fn();
    render(<PermissionSyncSection value={null} onChange={onChange} />);

    toggle();

    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('shows the interval while enabled and clears it when turned off', () => {
    const onChange = vi.fn();
    render(<PermissionSyncSection value={90} onChange={onChange} />);

    expect(byCy('sso-provider-form-oidc-permission-sync-ttl-input')).toHaveValue('90');

    toggle();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('treats a stored 0 as off', () => {
    render(<PermissionSyncSection value={0} onChange={vi.fn()} />);

    expect(byCy('sso-provider-form-oidc-permission-sync-ttl-input')).toBeNull();
  });
});
