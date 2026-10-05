import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useResourceMeteringServiceListResourceMeters,
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  useLicenseServiceGetLicenseInformation,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { ResourceBillingInfo } from './index';
import en from './en.json';

const auth = vi.hoisted(() => ({ canManageBilling: true }));

vi.mock('@attraccess/react-query-client', () => ({
  useResourceMeteringServiceListResourceMeters: vi.fn(),
  useBillingServiceGetBillingBalance: vi.fn(),
  useBillingServiceGetBillingConfiguration: vi.fn(),
  useBillingServiceGetResourceBillingConfiguration: vi.fn(),
  useLicenseServiceGetLicenseInformation: vi.fn(),
  useResourcesServiceGetOneResourceById: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const translations = (await import('./en.json')).default as Record<string, unknown>;
  const resolve = (key: string): string | undefined =>
    key
      .split('.')
      .reduce<unknown>(
        (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
        translations,
      ) as string | undefined;
  const t = (key: string, params?: Record<string, string | number>) => {
    let out = resolve(key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) {
      out = out.replaceAll(`{{${name}}}`, String(value));
    }
    return out;
  };
  return {
    useTranslations: () => ({ t, tExists: (key: string) => resolve(key) !== undefined }),
    useTranslationState: () => ({ language: 'en' }),
    useNumberFormatter: () => (value: number) => String(value),
  };
});
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => auth.canManageBilling }),
}));
vi.mock('../../../../components/flatSection', () => ({
  FlatSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock('./metering/LiveSessionBilling', () => ({ LiveSessionBilling: () => null }));
vi.mock('./metering/MeterNotices', () => ({ MeterSetupNotice: () => null, EnergySettlementNotices: () => null }));
vi.mock('./editor', () => ({
  ResourceBillingInfoEditor: ({ children }: { children: (onOpen: () => void) => ReactNode }) => (
    <>{children(vi.fn())}</>
  ),
}));

function mockData() {
  vi.mocked(useResourceMeteringServiceListResourceMeters).mockReturnValue({
    data: [{ id: 1, name: 'Heartbeats', creditsPerUnit: 30 }],
  } as never);
  vi.mocked(useBillingServiceGetBillingConfiguration).mockReturnValue({
    data: { currency: 'credits', minorUnit: 2 },
  } as ReturnType<typeof useBillingServiceGetBillingConfiguration>);
  vi.mocked(useBillingServiceGetResourceBillingConfiguration).mockReturnValue({
    data: {
      configuration: { creditsPerUsage: 100, creditsPerMinute: 200, creditsPerOperatingMinute: 300 },
      additionalItems: [],
    },
  } as ReturnType<typeof useBillingServiceGetResourceBillingConfiguration>);
  vi.mocked(useResourcesServiceGetOneResourceById).mockReturnValue({
    data: { type: 'machine' },
  } as ReturnType<typeof useResourcesServiceGetOneResourceById>);
  vi.mocked(useLicenseServiceGetLicenseInformation).mockReturnValue({
    data: { modules: ['billing'] },
  } as ReturnType<typeof useLicenseServiceGetLicenseInformation>);
  vi.mocked(useBillingServiceGetBillingBalance).mockReturnValue({
    data: { value: 10000 },
  } as ReturnType<typeof useBillingServiceGetBillingBalance>);
}

describe('ResourceBillingInfo operating-minute billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.canManageBilling = true;
    mockData();
  });

  it('keeps the live session visible to regular users after current meter prices are removed', async () => {
    auth.canManageBilling = false;
    vi.mocked(useResourceMeteringServiceListResourceMeters).mockReturnValue({
      data: [
        { id: 1, name: 'Renamed meter', creditsPerUnit: 0, session: { meterName: 'Heartbeats', creditsPerUnit: 30 } },
      ],
    } as never);
    vi.mocked(useBillingServiceGetResourceBillingConfiguration).mockReturnValue({
      data: {
        configuration: { creditsPerUsage: 0, creditsPerMinute: 0, creditsPerOperatingMinute: 0 },
        additionalItems: [],
      },
    } as never);
    const onVisibilityChange = vi.fn();
    render(<ResourceBillingInfo resourceId={205} onVisibilityChange={onVisibilityChange} />);
    expect(await screen.findByText(en.title)).toBeInTheDocument();
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('preserves the cents in a large configured meter rate', async () => {
    vi.mocked(useResourceMeteringServiceListResourceMeters).mockReturnValue({
      data: [{ id: 1, name: 'Heartbeats', creditsPerUnit: Number.MAX_SAFE_INTEGER }],
    } as never);
    render(<ResourceBillingInfo resourceId={1} />);
    expect(await screen.findByText('90,071,992,547,409.91 credits')).toBeInTheDocument();
  });

  it('displays the configured operating-minute rate', async () => {
    render(<ResourceBillingInfo resourceId={205} />);

    expect(await screen.findByText(en.perOperatingMinute.label)).toBeInTheDocument();
    // 300 minor units at minorUnit 2 => 3 credits per operating minute
    expect(screen.getByText('3 credits')).toBeInTheDocument();
  });

  it('displays a configured meter rate', async () => {
    render(<ResourceBillingInfo resourceId={205} />);

    expect(await screen.findByText('Heartbeats')).toBeInTheDocument();
    // 30 minor units at minorUnit 2 => 0.3 credits per kWh
    expect(screen.getByText('0.3 credits')).toBeInTheDocument();
  });

  it('includes the operating-minute rate in the default example cost', async () => {
    const onExampleAmountChange = vi.fn();
    render(<ResourceBillingInfo resourceId={205} onExampleAmountChange={onExampleAmountChange} />);

    // 1 (per use) + 2 * 10 (session minutes) + 3 * 10 (operating minutes) = 51
    await waitFor(() => expect(onExampleAmountChange).toHaveBeenCalledWith(51));
    expect(screen.getByText('Session duration (min)')).toBeInTheDocument();
    expect(screen.getByText('Attributed operating duration (min)')).toBeInTheDocument();
  });
});
