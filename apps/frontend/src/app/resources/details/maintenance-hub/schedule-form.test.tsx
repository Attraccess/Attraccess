import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleForm } from './schedule-form';
import type { Props as SelectProps } from '../../../../components/select';

const create = vi.fn();
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule: () => ({ data: undefined }),
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule: () => ({ mutate: create }),
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule: () => ({ mutate: vi.fn() }),
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

describe('operating-duration maintenance schedule form', () => {
  beforeEach(() => create.mockClear());

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
