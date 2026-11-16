import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '@attraccess/react-query-client';
import { MachineTab } from './machine';

type Warning = {
  flowId: number | null;
  flowName: string | null;
  triggerNodeId: string;
  triggerType: string;
  effectNodes: { nodeId: string; nodeType: string }[];
};

const state = vi.hoisted(() => ({
  activeSessionCount: 0,
  warnings: [] as Warning[],
  warningsFailed: false,
  warningsEnabled: [] as boolean[],
}));

vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageGetActiveSession: () => ({
    data: { activeSessionCount: state.activeSessionCount },
  }),
  // Behaves like react-query: a disabled query has no data.
  useResourceFlowsServiceGetSharedMachineFlowWarnings: (_: unknown, __: unknown, options: { enabled: boolean }) => {
    state.warningsEnabled.push(options.enabled);
    if (!options.enabled) return { data: undefined, isError: false };
    return state.warningsFailed ? { data: undefined, isError: true } : { data: state.warnings, isError: false };
  },
  useResourceFlowsServiceGetNodeSchemas: () => ({
    data: [{ type: 'plugin.lights.switch', label: 'Switch lights' }],
  }),
}));

const stopWarning: Warning = {
  flowId: null,
  flowName: null,
  triggerNodeId: 'a',
  triggerType: 'input.resource.usage.stopped',
  effectNodes: [
    { nodeId: 'b', nodeType: 'output.http.sendRequest' },
    { nodeId: 'c', nodeType: 'plugin.lights.switch' },
    { nodeId: 'd', nodeType: 'plugin.unknown.node' },
  ],
};

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
    state.warnings = [];
    state.warningsFailed = false;
    state.warningsEnabled = [];
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

  it('shows no hint for a sufficient limit and does not check the flows at limit 1', () => {
    state.activeSessionCount = 1;
    state.warnings = [stopWarning];
    mount(1);
    expect(screen.queryByText(/belowActiveHint/)).not.toBeInTheDocument();
    expect(screen.queryByText(/flowsWarning/)).not.toBeInTheDocument();
    expect(state.warningsEnabled).not.toContain(true);
  });

  it('lists each trigger with its effects, titled like the flow editor, and opens the flows in a new tab', () => {
    state.warnings = [stopWarning];
    mount(3);
    expect(screen.getByText('inputs.machine.maxParallelSessions.flowsWarningTitle')).toBeInTheDocument();
    // Core titles from the flow editor translations, plugin titles from the schema label, else the raw type.
    expect(
      screen.getByText(
        'inputs.machine.maxParallelSessions.flowsWarningOwnFlow: Usage stopped → Send HTTP request, Switch lights, plugin.unknown.node',
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/resources/5/flows');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('labels warnings of a global flow with its name and links to the global flow editor', () => {
    state.warnings = [{ ...stopWarning, flowId: 7, flowName: 'Power off all', triggerNodeId: 'g' }];
    mount(3);
    const link = screen.getByRole('link', { name: 'Power off all' });
    expect(link).toHaveAttribute('href', '/devices/flows/7');
    expect(link).toHaveAttribute('target', '_blank');
    // Only global flows are affected, so the resource's own flow editor is not offered.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText(/flowsWarningOwnFlow/)).not.toBeInTheDocument();
  });

  it('labels each entry with its flow when both the own flow and a global flow are affected', () => {
    state.warnings = [stopWarning, { ...stopWarning, flowId: 7, flowName: 'Power off all', triggerNodeId: 'g' }];
    mount(3);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^inputs\.machine\.maxParallelSessions\.flowsWarningOwnFlow: Usage stopped/);
    expect(items[1]).toHaveTextContent(/^Power off all: Usage stopped/);
    expect(screen.getByRole('link', { name: 'Power off all' })).toHaveAttribute('href', '/devices/flows/7');
    expect(screen.getByRole('link', { name: 'inputs.machine.maxParallelSessions.flowsWarningOpen' })).toHaveAttribute(
      'href',
      '/resources/5/flows',
    );
  });

  it('shows the generic flow warning without a list when the check fails', () => {
    state.warningsFailed = true;
    mount(3);
    expect(screen.getByText('inputs.machine.maxParallelSessions.flowsWarning')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows no flow warning when no flow is affected', () => {
    mount(3);
    expect(screen.queryByText(/flowsWarning/)).not.toBeInTheDocument();
  });
});
