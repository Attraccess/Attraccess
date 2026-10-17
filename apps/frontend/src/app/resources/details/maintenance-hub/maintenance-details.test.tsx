import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Accordion } from '@heroui/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ResourceMaintenanceScheduleTriggerType as Trigger,
  type ResourceMaintenance,
  type ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { HistorySection } from './history-section';
import { ScheduleAccordionItem } from './schedule-accordion-item';
import { ScheduleFormDrawer } from './schedule-form-drawer';
const state = vi.hoisted(() => ({
  update: vi.fn(),
  invalidate: vi.fn(),
  query: vi.fn(),
  success: undefined as undefined | (() => void),
  existing: undefined as undefined | { name: string },
  form: {} as {
    resourceId: number;
    scheduleId?: number;
    supportsOperatingDuration: boolean;
    onSaved: () => void;
    onCancel: () => void;
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey: 'schedules',
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule: ({ onSuccess }: { onSuccess: () => void }) => {
    state.success = onSuccess;
    return { mutate: state.update };
  },
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule: (...args: unknown[]) => {
    state.query(...args);
    return { data: state.existing };
  },
}));
vi.mock('./schedule-form', () => ({
  ScheduleForm: (props: typeof state.form) => {
    state.form = props;
    return (
      <>
        <button onClick={props.onSaved}>Save form</button>
        <button onClick={props.onCancel}>Cancel form</button>
      </>
    );
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.existing = undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows recent history and expands older entries with completion attribution', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-01T12:00:00Z'));
  const items = [
    {
      id: 1,
      reason: 'Recent repair',
      startTime: '2026-08-30T10:00:00Z',
      endTime: '2026-08-30T11:00:00Z',
      completedByUser: { username: 'Ada' },
    },
    { id: 2, reason: 'Old inspection', startTime: '2026-01-01T10:00:00Z' },
  ] as ResourceMaintenance[];
  render(<HistorySection pastMaintenances={items} />);
  expect(screen.getByText('Recent repair')).toBeTruthy();
  expect(screen.getByText(/Ada/)).toBeTruthy();
  expect(screen.queryByText('Old inspection')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'activity.history.showAll' }));
  expect(screen.getByText('Old inspection')).toBeTruthy();
  expect(screen.queryByText('activity.history.subtitle')).toBeNull();
});
it('shows empty maintenance history', () => {
  render(<HistorySection pastMaintenances={[]} />);
  expect(screen.getByText('activity.history.empty')).toBeTruthy();
});
it.each([Trigger.USAGE_HOURS, Trigger.USAGE_COUNT, Trigger.TIME_INTERVAL])(
  'edits, pauses and deletes a %s schedule',
  (triggerType) => {
    const edit = vi.fn();
    const remove = vi.fn();
    const schedule = {
      id: 4,
      name: 'Inspection',
      enabled: true,
      triggerType,
      durationBasis: 'ATTRIBUTABLE_OPERATING_DURATION',
      usageHoursConfig: { duration: 20, unit: 'HOURS' },
      usageCountConfig: { thresholdSessions: 20 },
      timeIntervalConfig: { duration: 20, unit: 'DAYS' },
    } as ResourceMaintenanceSchedule;
    render(
      <Accordion defaultExpandedKeys={[4]}>
        <ScheduleAccordionItem
          resourceId={7}
          schedule={schedule}
          trackingReadiness="waiting"
          onEdit={edit}
          onDelete={remove}
        />
      </Accordion>,
    );
    expect(screen.getByText('Inspection')).toBeTruthy();
    if (triggerType === Trigger.USAGE_HOURS) expect(screen.getByText('status.waiting')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'schedules.actions.edit' }));
    expect(edit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'schedules.actions.pause' }));
    expect(state.update).toHaveBeenCalledWith({ resourceId: 7, scheduleId: 4, requestBody: { enabled: false } });
    act(() => state.success?.());
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['schedules'] });
    fireEvent.click(screen.getByRole('button', { name: 'schedules.actions.delete' }));
    expect(remove).toHaveBeenCalledOnce();
  },
);
it('resumes a paused unnamed schedule', () => {
  render(
    <Accordion defaultExpandedKeys={[4]}>
      <ScheduleAccordionItem
        resourceId={7}
        schedule={{ id: 4, enabled: false, triggerType: Trigger.USAGE_COUNT } as ResourceMaintenanceSchedule}
        trackingReadiness="available"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </Accordion>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'schedules.actions.resume' }));
  expect(state.update).toHaveBeenCalledWith({ resourceId: 7, scheduleId: 4, requestBody: { enabled: true } });
});
it('opens new and existing schedules and closes on form save or cancel', async () => {
  const close = vi.fn();
  const view = render(<ScheduleFormDrawer resourceId={7} supportsOperatingDuration isOpen onClose={close} />);
  expect(await screen.findByText('form.titleCreate')).toBeTruthy();
  expect(state.query).toHaveBeenLastCalledWith({ resourceId: 7, scheduleId: 0 }, undefined, { enabled: false });
  expect(state.form).toMatchObject({ resourceId: 7, supportsOperatingDuration: true, scheduleId: undefined });
  fireEvent.click(screen.getByText('Save form'));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  state.existing = { name: 'Inspection' };
  render(<ScheduleFormDrawer resourceId={7} scheduleId={4} supportsOperatingDuration={false} isOpen onClose={close} />);
  expect(await screen.findByText('form.titleEdit')).toBeTruthy();
  expect(state.query).toHaveBeenLastCalledWith({ resourceId: 7, scheduleId: 4 }, undefined, { enabled: true });
  fireEvent.click(screen.getByText('Cancel form'));
  expect(close).toHaveBeenCalledTimes(2);
});
