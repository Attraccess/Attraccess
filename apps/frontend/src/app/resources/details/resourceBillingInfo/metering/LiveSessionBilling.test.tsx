import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useResourceMeteringServiceGetResourceMeteringLive,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { LiveSessionBilling } from './LiveSessionBilling';
import en from './en.json';

vi.mock('@attraccess/react-query-client', () => ({
  useResourceMeteringServiceGetResourceMeteringLive: vi.fn(),
  useResourcesServiceResourceUsageGetActiveSession: vi.fn(),
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
  return {
    useTranslations: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce(
          (out, [name, value]) => out.replaceAll(`{{${name}}}`, String(value)),
          resolve(key) ?? key,
        ),
    }),
    useNumberFormatter: () => (value: number) => String(value),
  };
});

const props = { resourceId: 7, currency: 'EUR', minorUnit: 2, dlClass: '', valueClass: '' };

function mock(usage: object | null, live: object | null) {
  vi.mocked(useResourcesServiceResourceUsageGetActiveSession).mockReturnValue({
    data: { usage },
  } as ReturnType<typeof useResourcesServiceResourceUsageGetActiveSession>);
  vi.mocked(useResourceMeteringServiceGetResourceMeteringLive).mockReturnValue({
    data: { session: live },
  } as ReturnType<typeof useResourceMeteringServiceGetResourceMeteringLive>);
}

describe('LiveSessionBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T10:03:30Z'));
  });

  it('renders nothing without a running session', () => {
    mock(null, null);
    const { container } = render(<LiveSessionBilling {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the live meter value, the exact energy cost and an estimate of the whole bill', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 100,
        sessionDurationCreditsPerMinute: 10,
        energyCreditsPerKwh: 30,
        billingFactor: 100,
      },
      { latestKwh: '1.5', energyCredits: 45, latestObservedAt: '2026-09-28T10:03:00Z' },
    );
    render(<LiveSessionBilling {...props} />);

    expect(screen.getByText('1.5 kWh')).toBeInTheDocument();
    // energy 45 minor units => 0.45
    expect(screen.getByText('0.45 EUR')).toBeInTheDocument();
    // 100 + 10 * ceil(3.5 min) + 45 = 185 minor units => 1.85
    expect(screen.getByText('1.85 EUR')).toBeInTheDocument();
    expect(screen.getByText('0:03:30')).toBeInTheDocument();
  });

  it('applies the usage billing factor to the estimate', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 0,
        sessionDurationCreditsPerMinute: 0,
        energyCreditsPerKwh: 30,
        billingFactor: 50,
      },
      { latestKwh: '1.5', energyCredits: 45, latestObservedAt: null },
    );
    render(<LiveSessionBilling {...props} />);
    // round(45 * 50 / 100) = 23 minor units
    expect(screen.getByText('0.23 EUR')).toBeInTheDocument();
  });

  it('says it is waiting for the first reading instead of showing a zero', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 0,
        sessionDurationCreditsPerMinute: 0,
        energyCreditsPerKwh: 30,
        billingFactor: 100,
      },
      { latestKwh: null, energyCredits: null, latestObservedAt: null },
    );
    render(<LiveSessionBilling {...props} />);
    expect(screen.getByText(en.live.meterWaiting)).toBeInTheDocument();
    expect(screen.queryByText('0 kWh')).not.toBeInTheDocument();
  });

  it('does not query the meter for sessions without an energy rate', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 5,
        sessionDurationCreditsPerMinute: 1,
        energyCreditsPerKwh: null,
      },
      null,
    );
    render(<LiveSessionBilling {...props} />);
    expect(useResourceMeteringServiceGetResourceMeteringLive).toHaveBeenCalledWith(
      { resourceId: 7 },
      undefined,
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.queryByText(en.live.meter)).not.toBeInTheDocument();
  });
});
