import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { StartSessionControls } from './index';

const { startMutate, supervisionMode, requestForms } = vi.hoisted(() => ({
  startMutate: vi.fn(),
  requestForms: vi.fn().mockResolvedValue([]),
  supervisionMode: { value: 'introduction_required' },
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));

vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms, modal: null }),
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

vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
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
    requestForms.mockReset().mockResolvedValue([]);
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

it.each([
  { status: 400, body: { message: 'Please submit required forms' }, message: 'Bad request', retry: true },
  { status: 400, body: { message: ['Please submit', 'required forms'] }, message: 'Bad request', retry: true },
  { status: 400, body: {}, message: 'Submit form answers', retry: true },
  { status: 403, body: { message: 'Submit forms' }, message: 'Forbidden', retry: false },
  { status: 400, body: { message: 'Unrelated validation' }, message: 'Bad request', retry: false },
])('retries only missing-form validation responses ($status / $message)', async ({ status, body, message, retry }) => {
  startMutate.mockClear();
  requestForms.mockReset().mockResolvedValue([]);
  supervisionMode.value = 'introduction_required';
  render(<StartSessionControls resourceId={1} />);
  await userEvent.click(screen.getByText('start'));
  const callbacks = startMutate.mock.calls[0][1];
  const submissions = [{ formId: 7, data: { training: true } }];
  requestForms.mockResolvedValue(submissions);
  const error = new ApiError(
    { method: 'POST', url: '/start' },
    { url: '/start', ok: false, status, statusText: 'Error', body },
    message,
  );
  await act(() => callbacks.onError(error));
  expect(startMutate).toHaveBeenCalledTimes(retry ? 2 : 1);
  if (retry)
    expect(startMutate).toHaveBeenLastCalledWith({
      resourceId: 1,
      requestBody: { projectId: undefined, formSubmissions: submissions },
    });
});
it('does not retry ordinary errors or a cancelled form resubmission', async () => {
  startMutate.mockClear();
  requestForms.mockReset().mockResolvedValue([]);
  supervisionMode.value = 'introduction_required';
  render(<StartSessionControls resourceId={1} />);
  await userEvent.click(screen.getByText('start'));
  const callbacks = startMutate.mock.calls[0][1];
  await act(() => callbacks.onError(new Error('Network unavailable')));
  expect(startMutate).toHaveBeenCalledOnce();
  requestForms.mockRejectedValueOnce(new Error('user_cancelled_forms'));
  await act(() =>
    callbacks.onError(
      new ApiError(
        { method: 'POST', url: '/start' },
        { url: '/start', ok: false, status: 400, statusText: 'Error', body: { message: 'Submit forms' } },
        'Bad request',
      ),
    ),
  );
  expect(startMutate).toHaveBeenCalledOnce();
});
