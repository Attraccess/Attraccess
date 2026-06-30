import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { BillingDashboardPage } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (k: string) => k.split('.').pop() ?? k }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock('./topup', () => ({ BillingDashboardTopupCard: () => <div data-testid="topup" /> }));
vi.mock('./summary', () => ({ SummaryCard: () => <div data-testid="summary" /> }));
vi.mock('../../../components/pageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function mockLicense(modules: string[] | undefined) {
  vi.mocked(useLicenseServiceGetLicenseInformation).mockReturnValue({
    data: modules !== undefined ? { modules } : undefined,
  } as ReturnType<typeof useLicenseServiceGetLicenseInformation>);
}

describe('BillingDashboardPage license gate', () => {
  it('renders nothing when billing module is absent from license', () => {
    mockLicense([]);
    const { container } = render(<BillingDashboardPage />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders page when billing module is present', () => {
    mockLicense(['billing']);
    render(<BillingDashboardPage />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByTestId('topup')).toBeInTheDocument();
  });

  it('renders page while license is still loading (undefined)', () => {
    mockLicense(undefined);
    render(<BillingDashboardPage />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
