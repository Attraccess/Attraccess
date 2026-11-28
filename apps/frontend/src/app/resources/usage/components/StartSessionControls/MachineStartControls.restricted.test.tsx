import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { MachineStartControls } from './MachineStartControls';

const state = vi.hoisted(() => ({ restricted: new Set<string>() }));

vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));
vi.mock('../../../../../components/projectsSelect', () => ({ ProjectsSelect: () => null }));

const props = { onProjectChange: vi.fn(), onStart: vi.fn(), onStartWithNotes: vi.fn(), isStarting: false };
const startButton = () => screen.getByRole('button', { name: 'Start Using Resource' });

describe('MachineStartControls outside the allowed network', () => {
  it('disables the start when usage.start is restricted, and explains why', () => {
    state.restricted = new Set([NetworkRestrictedAction.UsageStart]);
    render(<MachineStartControls {...props} />);
    expect(startButton()).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('Only available from the local network.');
  });

  it('judges a start that needs a supervisor as a supervision request', () => {
    state.restricted = new Set([NetworkRestrictedAction.SupervisionRequest]);
    render(<MachineStartControls {...props} needsSupervisor />);
    expect(startButton()).toBeDisabled();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('keeps a supervised start enabled when only the direct start is restricted', () => {
    state.restricted = new Set([NetworkRestrictedAction.UsageStart]);
    render(<MachineStartControls {...props} needsSupervisor />);
    expect(startButton()).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
