import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '@attraccess/react-query-client';
import { MachineTab } from './machine';

const state = vi.hoisted(() => ({ activeSessionCount: 0 }));

vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageGetActiveSession: () => ({
    data: { activeSessionCount: state.activeSessionCount },
  }),
}));

const t = (key: string, params?: { count: number }) => (params ? `${key} ${params.count}` : key);

function mount(maxParallelSessions: number) {
  const setField = vi.fn();
  render(
    <MachineTab
      t={t as never}
      formData={{ allowTakeOver: false, maxParallelSessions }}
      setField={setField}
      resource={{ id: 5 } as Resource}
    />,
  );
  return setField;
}

describe('MachineTab max parallel sessions', () => {
  beforeEach(() => {
    state.activeSessionCount = 0;
  });

  it('sets the clamped limit', () => {
    const setField = mount(1);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });
    expect(setField).toHaveBeenLastCalledWith('maxParallelSessions', 5);
    fireEvent.change(input, { target: { value: '5000' } });
    expect(setField).toHaveBeenLastCalledWith('maxParallelSessions', 1000);
    fireEvent.change(input, { target: { value: '0' } });
    expect(setField).toHaveBeenLastCalledWith('maxParallelSessions', 1);
  });

  it('warns when the limit is below the number of active sessions', () => {
    state.activeSessionCount = 3;
    mount(2);
    expect(screen.getByText('inputs.machine.maxParallelSessions.belowActiveHint 3')).toBeInTheDocument();
    // Part of the field's description, so screen readers announce it with the input.
    expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription(
      /inputs\.machine\.maxParallelSessions\.belowActiveHint 3/,
    );
  });

  it('shows no hint for a sufficient limit and no flow warning at limit 1', () => {
    state.activeSessionCount = 1;
    mount(1);
    expect(screen.queryByText(/belowActiveHint/)).not.toBeInTheDocument();
    expect(screen.queryByText(/flowsWarning/)).not.toBeInTheDocument();
  });

  it('warns about per-session flows above limit 1', () => {
    mount(3);
    expect(screen.getByText('inputs.machine.maxParallelSessions.flowsWarning')).toBeInTheDocument();
  });
});
