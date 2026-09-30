import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useResourceMeteringServiceGetResourceMeteringStatus,
  useResourceMeteringServiceRetryResourceMeteringSettlement,
  useResourceMeteringServiceWaiveResourceMeteringSettlement,
} from '@attraccess/react-query-client';
import { EnergySettlementNotices, MeterSetupNotice } from './MeterNotices';
import en from './en.json';

vi.mock('@attraccess/react-query-client', () => ({
  useResourceMeteringServiceGetResourceMeteringStatus: vi.fn(),
  UseResourceMeteringServiceGetResourceMeteringStatusKeyFn: () => ['status'],
  useResourceMeteringServiceRetryResourceMeteringSettlement: vi.fn(),
  useResourceMeteringServiceWaiveResourceMeteringSettlement: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
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
      tExists: (key: string) => resolve(key) !== undefined,
    }),
  };
});
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('../../../../../components/button', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
}));

const retry = vi.fn();
const waive = vi.fn();

function mockStatus(status: object) {
  vi.mocked(useResourceMeteringServiceGetResourceMeteringStatus).mockReturnValue({
    data: { activeSession: null, interimIntervalMinutes: 1, ...status },
  } as ReturnType<typeof useResourceMeteringServiceGetResourceMeteringStatus>);
}

describe('meter notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useResourceMeteringServiceRetryResourceMeteringSettlement).mockReturnValue({
      mutate: retry,
      isPending: false,
    } as never);
    vi.mocked(useResourceMeteringServiceWaiveResourceMeteringSettlement).mockReturnValue({
      mutate: waive,
      isPending: false,
    } as never);
  });

  it('tells what is missing from the meter and links to the flows when energy billing is on', () => {
    mockStatus({ configured: false, problems: ['ready-unreachable', 'collect-trigger-missing'], unsettled: [] });
    render(<MeterSetupNotice resourceId={7} energyBillingEnabled />);
    expect(screen.getByText(en.setup.problems['ready-unreachable'])).toBeInTheDocument();
    expect(screen.getByText(en.setup.problems['collect-trigger-missing'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.setup.action })).toHaveAttribute('href', '/resources/7/flows');
  });

  it('stays silent for a complete meter or when energy billing is off', () => {
    mockStatus({ configured: true, problems: [], unsettled: [] });
    const { container } = render(<MeterSetupNotice resourceId={7} energyBillingEnabled />);
    expect(container).toBeEmptyDOMElement();
    mockStatus({ configured: false, problems: ['start-trigger-missing'], unsettled: [] });
    const off = render(<MeterSetupNotice resourceId={7} energyBillingEnabled={false} />);
    expect(off.container).toBeEmptyDOMElement();
  });

  it('offers retry and waive for a pending energy charge and only waive for a failed one', () => {
    mockStatus({
      configured: true,
      problems: [],
      unsettled: [
        {
          sessionId: 'a',
          usageId: 11,
          status: 'pending',
          reason: 'meter unreachable',
          latestKwh: '1.2',
          retryable: true,
        },
        { sessionId: 'b', usageId: 12, status: 'failed', reason: 'later session', latestKwh: null, retryable: false },
      ],
    });
    render(<EnergySettlementNotices resourceId={7} />);

    expect(
      screen.getByText(en.unsettled.pending.description.replace('{{usageId}}', '11')),
    ).toBeInTheDocument();
    expect(screen.getByText('Reason: meter unreachable')).toBeInTheDocument();
    expect(screen.getByText('Last accepted reading: 1.2 kWh (not billed)')).toBeInTheDocument();
    expect(screen.getAllByText(en.unsettled.retry)).toHaveLength(1);
    expect(screen.getAllByText(en.unsettled.waive)).toHaveLength(2);

    fireEvent.click(screen.getByText(en.unsettled.retry));
    expect(retry).toHaveBeenCalledWith({ resourceId: 7, sessionId: 'a' });
    fireEvent.click(screen.getAllByText(en.unsettled.waive)[1]);
    expect(waive).toHaveBeenCalledWith({ resourceId: 7, sessionId: 'b' });
  });

  it('renders nothing when every energy charge is settled', () => {
    mockStatus({ configured: true, problems: [], unsettled: [] });
    const { container } = render(<EnergySettlementNotices resourceId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
