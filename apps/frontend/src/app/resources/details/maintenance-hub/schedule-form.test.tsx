import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleForm } from './schedule-form';
import type { Props as SelectProps } from '../../../../components/select';

const create = vi.fn();
const update = vi.fn();
const state = vi.hoisted(() => ({
  existing: undefined as unknown,
  error: undefined as Error | undefined,
  onSuccess: () => undefined as void,
  invalidate: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule: () => ({ data: state.existing }),
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule: (options: { onSuccess: () => void }) => {
    state.onSuccess = options.onSuccess;
    return { mutate: create, error: state.error };
  },
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule: () => ({ mutate: update }),
}));
vi.mock('../operating-readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../operating-readiness')>()),
  useOperatingTrackingReadiness: () => 'missing',
}));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../components/select', () => ({
  Select: ({ label, value, onChange, items }: SelectProps) => (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange?.(event.target.value)}>
        {items.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.existing = undefined;
  state.error = undefined;
});

describe('operating-duration maintenance schedule form', () => {
  it('keeps session duration as the default without showing tracking guidance', async () => {
    render(<ScheduleForm resourceId={42} supportsOperatingDuration onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Duration basis')).toHaveValue('SESSION_DURATION');
    expect(screen.queryByText('Tracking not configured')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ durationBasis: 'SESSION_DURATION' }) }),
    );
  });

  it('allows saving an enabled operating schedule before a source is configured', async () => {
    render(<ScheduleForm resourceId={42} supportsOperatingDuration onSaved={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Duration basis'), 'ATTRIBUTABLE_OPERATING_DURATION');
    expect(screen.getByText('Tracking not configured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up operating/idle signals' })).toHaveAttribute(
      'href',
      '/resources/42/flows',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ durationBasis: 'ATTRIBUTABLE_OPERATING_DURATION', enabled: true }),
      }),
    );
  });
});

it.each(['USAGE_COUNT', 'TIME_INTERVAL'] as const)('saves %s schedules with their own thresholds', async (type) => {
  const saved = vi.fn();
  render(<ScheduleForm resourceId={42} supportsOperatingDuration={false} onSaved={saved} onCancel={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText('Trigger type'), type);
  const label = type === 'USAGE_COUNT' ? 'Sessions threshold' : 'Duration';
  fireEvent.change(screen.getByLabelText(label), { target: { value: '12' } });
  if (type === 'TIME_INTERVAL') await userEvent.selectOptions(screen.getByLabelText('Unit'), 'DAYS');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(create).toHaveBeenCalledWith({
    resourceId: 42,
    requestBody: {
      name: undefined,
      triggerType: type,
      enabled: true,
      durationBasis: 'SESSION_DURATION',
      ...(type === 'USAGE_COUNT'
        ? { usageCountConfig: { thresholdSessions: 12 } }
        : { timeIntervalConfig: { duration: 12, unit: 'DAYS' } }),
    },
  });
  act(() => state.onSuccess());
  expect(saved).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalled();
});
it('loads an existing schedule and updates it while retaining its trigger configuration', async () => {
  state.existing = {
    name: 'Daily check',
    triggerType: 'TIME_INTERVAL',
    enabled: false,
    timeIntervalConfig: { duration: 2, unit: 'DAYS' },
  };
  const cancel = vi.fn();
  render(<ScheduleForm resourceId={42} scheduleId={5} supportsOperatingDuration onSaved={vi.fn()} onCancel={cancel} />);
  expect(screen.getByLabelText('Name')).toHaveValue('Daily check');
  expect(screen.getByLabelText('Duration')).toHaveValue(2);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(update).toHaveBeenCalledWith({
    resourceId: 42,
    scheduleId: 5,
    requestBody: {
      name: 'Daily check',
      triggerType: 'TIME_INTERVAL',
      enabled: false,
      durationBasis: 'SESSION_DURATION',
      timeIntervalConfig: { duration: 2, unit: 'DAYS' },
    },
  });
  expect(create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
});
it('rejects nonpositive thresholds and displays API failures', async () => {
  state.error = new Error('Connection unavailable');
  render(<ScheduleForm resourceId={42} supportsOperatingDuration onSaved={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '0' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Connection unavailable')).toBeTruthy();
});
