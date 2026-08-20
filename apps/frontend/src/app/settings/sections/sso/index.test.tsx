import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../hooks/useAuth';
import { SsoSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (k: string) => k.split('.').pop() ?? k }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Navigate: ({ to }: { to: string }) => <div data-testid={`redirect-${to}`} />,
}));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../../sso/providers/SSOProvidersList', () => ({
  SSOProvidersList: () => <div data-testid="providers-list" />,
}));

function mockLicense(modules: string[] | undefined) {
  vi.mocked(useLicenseServiceGetLicenseInformation).mockReturnValue({
    data: modules !== undefined ? { modules } : undefined,
  } as ReturnType<typeof useLicenseServiceGetLicenseInformation>);
}

function mockAuth(canManage: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission: (p: string) => (p === 'system.sso.manage' ? canManage : false),
  } as ReturnType<typeof useAuth>);
}

// Ported from the standalone SSOProvidersPage's test when that page was removed (ATT-866). The gates
// are the same two; only the unlicensed branch differs — a section explains itself in the rail
// rather than rendering nothing, which off a settings rail would read as a broken page.
describe('SsoSection gates', () => {
  it('explains itself instead of listing providers when sso is absent from the license', () => {
    mockAuth(true);
    mockLicense([]);
    render(<SsoSection />);
    expect(screen.getByText('notLicensed')).toBeInTheDocument();
    expect(screen.queryByTestId('providers-list')).not.toBeInTheDocument();
  });

  it('renders the provider list when sso is present', () => {
    mockAuth(true);
    mockLicense(['sso']);
    render(<SsoSection />);
    expect(screen.getByTestId('providers-list')).toBeInTheDocument();
  });

  it('renders the provider list while the license is still loading', () => {
    mockAuth(true);
    mockLicense(undefined);
    render(<SsoSection />);
    expect(screen.getByTestId('providers-list')).toBeInTheDocument();
  });

  it('redirects when the user lacks system.sso.manage', () => {
    mockAuth(false);
    mockLicense(['sso']);
    render(<SsoSection />);
    expect(screen.getByTestId('redirect-/')).toBeInTheDocument();
  });
});
