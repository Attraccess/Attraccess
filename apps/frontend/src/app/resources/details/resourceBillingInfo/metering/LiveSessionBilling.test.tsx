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
    useTranslationState: () => ({ language: 'en' }),
    useNumberFormatter: () => (value: number) => String(value),
  };
});

const props = { resourceId: 7, currency: 'EUR', minorUnit: 2, dlClass: '', valueClass: '' };

function mock(usage: object | null, live: object | null) {
  vi.mocked(useResourcesServiceResourceUsageGetActiveSession).mockReturnValue({
    data: { usage },
  } as ReturnType<typeof useResourcesServiceResourceUsageGetActiveSession>);
  vi.mocked(useResourceMeteringServiceGetResourceMeteringLive).mockReturnValue({
    data: {
      meters: live
        ? [{ id: 1, name: 'Renamed meter', session: { meterName: 'Heartbeats', creditsPerUnit: 30, ...live } }]
        : [],
    },
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
        billingFactor: 100,
      },
      { latestValue: '1.5', chargeCredits: 45, latestObservedAt: '2026-09-28T10:03:00Z' },
    );
    render(<LiveSessionBilling {...props} />);

    expect(screen.getByText('1.5')).toBeInTheDocument();
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
        billingFactor: 50,
      },
      { latestValue: '1.5', chargeCredits: 45, latestObservedAt: null },
    );
    render(<LiveSessionBilling {...props} />);
    // Settlement rounds the discount: 45 - round(45 * 50 / 100) = 22 minor units.
    expect(screen.getByText('0.22 EUR')).toBeInTheDocument();
  });

  it('uses the captured name and rate after a meter is renamed and repriced', () => {
    mock({ startTime: '2026-09-28T10:00:00Z' }, { latestValue: '0', chargeCredits: 0, creditsPerUnit: 0 });
    render(<LiveSessionBilling {...props} />);
    expect(screen.getByText('Heartbeats')).toBeInTheDocument();
    expect(screen.getByText('Heartbeats session rate')).toBeInTheDocument();
    expect(screen.getByText('0 EUR per measured value')).toBeInTheDocument();
    expect(screen.queryByText('Renamed meter')).not.toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('matches exact settlement for a large charge at a half-credit boundary', () => {
    mock(
      { startTime: '2026-09-28T10:00:00Z', billingFactor: 50 },
      {
        latestValue: '9007199254740991',
        chargeCredits: Number.MAX_SAFE_INTEGER,
      },
    );
    render(<LiveSessionBilling {...props} minorUnit={0} />);
    expect(screen.getByText('4503599627370495 EUR')).toBeInTheDocument();
  });

  it('shows an unavailable estimate when the combined meter charges exceed the supported range', () => {
    mock(
      { startTime: '2026-09-28T10:00:00Z', creditsPerUsage: 1 },
      {
        latestValue: '9007199254740991',
        chargeCredits: Number.MAX_SAFE_INTEGER,
      },
    );
    render(<LiveSessionBilling {...props} />);
    expect(screen.getByText(en.live.estimateUnavailable)).toBeInTheDocument();
  });

  it('says it is waiting for the first reading instead of showing a zero', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 0,
        sessionDurationCreditsPerMinute: 0,
        billingFactor: 100,
      },
      { latestValue: null, chargeCredits: null, latestObservedAt: null },
    );
    render(<LiveSessionBilling {...props} />);
    expect(screen.getByText(en.live.meterWaiting)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('queries tracking-only meters during a session', () => {
    mock(
      {
        startTime: '2026-09-28T10:00:00Z',
        creditsPerUsage: 5,
        sessionDurationCreditsPerMinute: 1,
      },
      null,
    );
    render(<LiveSessionBilling {...props} />);
    expect(useResourceMeteringServiceGetResourceMeteringLive).toHaveBeenCalledWith(
      { resourceId: 7 },
      undefined,
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.queryByText(en.live.meter)).not.toBeInTheDocument();
  });
});
