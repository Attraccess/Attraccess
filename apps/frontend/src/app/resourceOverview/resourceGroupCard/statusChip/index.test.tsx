import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@attraccess/react-query-client';
import { StatusChip } from './index';

let sessionData: unknown;
let maintenanceData: unknown;
let sessionError: unknown;
let sessionPending: boolean;

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({
      t: (key: string) => {
        const dict: Record<string, string> = {
          'status.inUse': 'In Use',
          'status.available': 'Available',
          'status.maintenance': 'In Maintenance',
        };
        return dict[key] ?? key;
      },
    }),
  }))()),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import('@attraccess/react-query-client')>()).ApiError,
  useResourcesServiceResourceUsageGetActiveSession: () => ({
    data: sessionData,
    error: sessionError,
    isPending: sessionPending,
  }),
  useResourceMaintenancesServiceFindMaintenances: () => ({ data: maintenanceData }),
}));

const forbidden = () =>
  new ApiError(
    { method: 'GET', url: '/api/resources/1/usage/active' },
    { url: '/api/resources/1/usage/active', ok: false, status: 403, statusText: 'Forbidden', body: undefined },
    'Forbidden',
  );

describe('StatusChip', () => {
  beforeEach(() => {
    sessionData = undefined;
    maintenanceData = undefined;
    sessionError = undefined;
    sessionPending = false;
  });

  it('shows nothing while the session read is pending, not a provisional Available', () => {
    sessionPending = true;
    const { container } = render(<StatusChip resourceId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no activity status when activity is not visible to the viewer (403)', () => {
    sessionError = forbidden();
    const { container } = render(<StatusChip resourceId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still shows maintenance when activity is not visible to the viewer (403)', () => {
    sessionError = forbidden();
    maintenanceData = { data: [{ id: 1 }] };
    render(<StatusChip resourceId={1} />);
    expect(screen.getByText('In Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  it('shows Available when idle and not under maintenance', () => {
    render(<StatusChip resourceId={1} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('shows In Use when there is an active session', () => {
    sessionData = { usage: { id: 1 } };
    render(<StatusChip resourceId={1} />);
    expect(screen.getByText('In Use')).toBeInTheDocument();
  });

  it('shows In Maintenance when active maintenance exists and no session', () => {
    maintenanceData = { data: [{ id: 1 }] };
    render(<StatusChip resourceId={1} />);
    expect(screen.getByText('In Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  it('prioritizes an active session over maintenance', () => {
    sessionData = { usage: { id: 1 } };
    maintenanceData = { data: [{ id: 1 }] };
    render(<StatusChip resourceId={1} />);
    expect(screen.getByText('In Use')).toBeInTheDocument();
    expect(screen.queryByText('In Maintenance')).not.toBeInTheDocument();
  });
});
