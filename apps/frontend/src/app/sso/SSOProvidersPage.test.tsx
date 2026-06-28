import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../hooks/useAuth';
import { SSOProvidersPage } from './SSOProvidersPage';

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
vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./providers/SSOProvidersList', () => ({
  SSOProvidersList: () => <div data-testid="providers-list" />,
}));
vi.mock('../../components/pageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function mockLicense(modules: string[] | undefined) {
  vi.mocked(useLicenseServiceGetLicenseInformation).mockReturnValue({
    data: modules !== undefined ? { modules } : undefined,
  } as ReturnType<typeof useLicenseServiceGetLicenseInformation>);
}

function mockAuth(canManage: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission: (p: string) => p === 'system.settings.manage' ? canManage : false,
  } as ReturnType<typeof useAuth>);
}

describe('SSOProvidersPage license gate', () => {
  it('renders nothing when sso module is absent from license', () => {
    mockAuth(true);
    mockLicense([]);
    const { container } = render(<SSOProvidersPage />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders page when sso module is present', () => {
    mockAuth(true);
    mockLicense(['sso']);
    render(<SSOProvidersPage />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByTestId('providers-list')).toBeInTheDocument();
  });

  it('renders page while license is loading (undefined)', () => {
    mockAuth(true);
    mockLicense(undefined);
    render(<SSOProvidersPage />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('redirects when user lacks system.settings.manage permission', () => {
    mockAuth(false);
    mockLicense(['sso']);
    render(<SSOProvidersPage />);
    expect(screen.getByTestId('redirect-/')).toBeInTheDocument();
  });
});
