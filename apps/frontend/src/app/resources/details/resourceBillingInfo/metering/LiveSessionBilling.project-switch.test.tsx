import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGetResourceMeteringLive,
  useGetRunningPartBilling,
  useResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { LiveSessionBilling } from './LiveSessionBilling';
import en from './en.json';

vi.mock('@attraccess/react-query-client', () => ({
  useGetResourceMeteringLive: vi.fn(),
  useGetRunningPartBilling: vi.fn(),
  useResourceUsageGetActiveSession: vi.fn(),
}));
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    t: (key: string, params?: Record<string, string | number>) =>
      Object.entries(params ?? {}).reduce(
        (out, [name, value]) => out.replaceAll(`{{${name}}}`, String(value)),
        String(
          key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], en) ??
            key,
        ),
      ),
  }),
  useTranslationState: () => ({ language: 'en' }),
  useNumberFormatter: () => (value: number) => String(value),
}));

const props = { resourceId: 7, currency: 'EUR', minorUnit: 2, dlClass: '', valueClass: '' };
/** Session start; the running part started 70 s later. */
const SESSION_START = '2026-11-28T10:00:00Z';
const PART_START = '2026-11-28T10:01:10Z';

interface PartBilling {
  flatCredits: number;
  roundingStartTime: string;
  priorCredits: number;
}

// 1000 per use and 200 per started minute, in minor units.
function mock(mode: string, billing: PartBilling | undefined, usage: object = {}, query: object = {}) {
  vi.mocked(useResourceUsageGetActiveSession).mockReturnValue({
    data: {
      usage: {
        id: 10,
        user: { id: 1, username: 'Alex' },
        startTime: PART_START,
        sessionStartTime: SESSION_START,
        previousUsageId: 9,
        projectSwitchCharging: mode,
        creditsPerUsage: 1000,
        sessionDurationCreditsPerMinute: 200,
        billingFactor: 100,
        ...usage,
      },
    },
  } as unknown as ReturnType<typeof useResourceUsageGetActiveSession>);
  vi.mocked(useGetResourceMeteringLive).mockReturnValue({ data: { meters: [] } } as unknown as ReturnType<
    typeof useGetResourceMeteringLive
  >);
  vi.mocked(useGetRunningPartBilling).mockReturnValue({ data: billing, isError: false, ...query } as ReturnType<
    typeof useGetRunningPartBilling
  >);
}

const estimate = () => document.querySelector('[data-cy="live-bill-estimate"]')?.textContent;

describe('LiveSessionBilling of a switched session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T10:01:20Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('continue: neither a second fee per use nor a minute the earlier part already paid', () => {
    // 80 s in total are two started minutes, and the part before the switch already billed both.
    mock('continue', { flatCredits: 0, roundingStartTime: SESSION_START, priorCredits: 1400 });
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe('0 EUR');
  });

  it('continue: bills the minute that starts after the one the earlier part paid', () => {
    vi.setSystemTime(new Date('2026-11-28T10:02:01Z'));
    mock('continue', { flatCredits: 0, roundingStartTime: SESSION_START, priorCredits: 1400 });
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe('2 EUR');
  });

  it('continue-per-part-rounding: rounds the part on its own, without a fee per use', () => {
    mock('continue-per-part-rounding', { flatCredits: 0, roundingStartTime: PART_START, priorCredits: 0 });
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe('2 EUR');
  });

  it('new-session: the fee per use and the own started minute', () => {
    mock('new-session', { flatCredits: 1000, roundingStartTime: PART_START, priorCredits: 0 });
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe('12 EUR');
  });

  it('follows the anchor of the server after the mode changed in the middle of the session', () => {
    // An earlier part started at 10:00:50 as a new session: minutes count from there, not from the session start.
    vi.setSystemTime(new Date('2026-11-28T10:01:55Z'));
    mock('continue', { flatCredits: 0, roundingStartTime: '2026-11-28T10:00:50Z', priorCredits: 1200 });
    render(<LiveSessionBilling {...props} />);
    // ceil(65 s) - ceil(20 s) = 1 minute. Counted from the session start it would be 0.
    expect(estimate()).toBe('2 EUR');
  });

  it('rounds the billing factor on the running total, like the bill', () => {
    vi.setSystemTime(new Date('2026-11-28T10:02:01Z'));
    // factor 33 on 999 + 199 before and 199 now: charged(1397) - charged(1198) = 461 - 395 = 66.
    mock(
      'continue',
      { flatCredits: 0, roundingStartTime: SESSION_START, priorCredits: 1198 },
      {
        creditsPerUsage: 999,
        sessionDurationCreditsPerMinute: 199,
        billingFactor: 33,
      },
    );
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe('0.66 EUR');
  });

  it('says that time and estimate are those of the part since the switch', () => {
    mock('continue', { flatCredits: 0, roundingStartTime: SESSION_START, priorCredits: 1400 });
    render(<LiveSessionBilling {...props} />);
    expect(screen.getByText(en.live.partTime)).toBeInTheDocument();
    expect(screen.getByText(en.live.partEstimate)).toBeInTheDocument();
    expect(screen.getByText(en.live.partEstimateNote)).toBeInTheDocument();
    expect(screen.queryByText(en.live.sessionTime)).not.toBeInTheDocument();
    expect(screen.getByText('0:00:10')).toBeInTheDocument();
  });

  it('shows no figure while the server has not answered yet', () => {
    mock('continue', undefined);
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe(en.live.estimateLoading);
  });

  it('says so when the viewer cannot get the figures of the part', () => {
    mock('continue', undefined, {}, { isError: true });
    render(<LiveSessionBilling {...props} />);
    expect(estimate()).toBe(en.live.estimatePartUnavailable);
  });

  it('asks only for a continuation and leaves a session that was never switched as it was', () => {
    mock('continue', undefined, { previousUsageId: null, projectSwitchCharging: null, sessionStartTime: null });
    render(<LiveSessionBilling {...props} />);
    expect(vi.mocked(useGetRunningPartBilling).mock.calls[0][2]).toMatchObject({ enabled: false });
    expect(estimate()).toBe('12 EUR');
    expect(screen.getByText(en.live.sessionTime)).toBeInTheDocument();
    expect(screen.getByText(en.live.estimate)).toBeInTheDocument();
    expect(screen.getByText(en.live.estimateNote)).toBeInTheDocument();
  });
});
