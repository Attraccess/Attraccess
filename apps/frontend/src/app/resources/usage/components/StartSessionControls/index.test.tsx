import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartSessionControls } from './index';

const { startMutate, supervisionMode } = vi.hoisted(() => ({
  startMutate: vi.fn(),
  supervisionMode: { value: 'introduction_required' },
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));

vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: () => Promise.resolve([]), modal: null }),
}));

// Stand-ins that expose exactly the two things this test cares about: a way to press Start, and
// whether the supervisor picker opened.
vi.mock('./MachineStartControls', () => ({
  MachineStartControls: ({ onStart }: { onStart: () => void }) => (
    <button type="button" onClick={onStart}>
      start
    </button>
  ),
}));
vi.mock('./DoorControls', () => ({ DoorControls: () => null }));
vi.mock('../SessionNotesModal', () => ({ SessionNotesModal: () => null, SessionModalMode: { START: 'start' } }));
vi.mock('./insufficientBalanceModal', () => ({ InsufficientBalanceModal: () => null }));
vi.mock('../SupervisedStartModal', () => ({
  SupervisedStartModal: () => <div data-testid="supervised-start-modal" />,
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  ResourceType: { MACHINE: 'machine', DOOR: 'door' },
  SupervisionMode: {
    INTRODUCTION_REQUIRED: 'introduction_required',
    SUPERVISION_ALLOWED: 'supervision_allowed',
    SUPERVISION_REQUIRED: 'supervision_required',
  },
  useResourcesServiceGetOneResourceById: () => ({
    data: { id: 1, type: 'machine', supervisionMode: supervisionMode.value },
  }),
  useResourcesServiceResourceUsageStartSession: () => ({ mutate: startMutate, isPending: false }),
  useResourcesServiceUnlockDoor: () => ({ mutate: vi.fn(), isPending: false }),
  useResourcesServiceLockDoor: () => ({ mutate: vi.fn(), isPending: false }),
  useResourcesServiceUnlatchDoor: () => ({ mutate: vi.fn(), isPending: false }),
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: () => ['activeSession'],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: () => ['history'],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe('StartSessionControls supervision gating', () => {
  beforeEach(() => {
    startMutate.mockClear();
    supervisionMode.value = 'introduction_required';
  });

  // ATT-815: the backend rejects a solo start on supervision_required for everyone, so the picker
  // has to open even when the caller passed no requiresSupervision prop at all — which is exactly
  // what the maintenance view does.
  it('opens the supervisor picker on supervision_required even without the prop', async () => {
    supervisionMode.value = 'supervision_required';
    render(<StartSessionControls resourceId={1} />);

    await userEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('supervised-start-modal')).toBeInTheDocument();
    expect(startMutate).not.toHaveBeenCalled();
  });

  it('opens the supervisor picker when the caller says the user cannot start solo', async () => {
    supervisionMode.value = 'supervision_allowed';
    render(<StartSessionControls resourceId={1} requiresSupervision />);

    await userEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('supervised-start-modal')).toBeInTheDocument();
    expect(startMutate).not.toHaveBeenCalled();
  });

  it('starts directly on supervision_allowed for a user who can start solo', async () => {
    supervisionMode.value = 'supervision_allowed';
    render(<StartSessionControls resourceId={1} requiresSupervision={false} />);

    await userEvent.click(screen.getByText('start'));

    expect(startMutate).toHaveBeenCalled();
    expect(screen.queryByTestId('supervised-start-modal')).not.toBeInTheDocument();
  });

  it('starts directly on introduction_required', async () => {
    render(<StartSessionControls resourceId={1} />);

    await userEvent.click(screen.getByText('start'));

    expect(startMutate).toHaveBeenCalled();
    expect(screen.queryByTestId('supervised-start-modal')).not.toBeInTheDocument();
  });
});
