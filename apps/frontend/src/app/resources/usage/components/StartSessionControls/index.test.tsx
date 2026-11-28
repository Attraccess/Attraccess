import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { StartSessionControls } from './index';

const {
  startMutate,
  supervisionMode,
  resourceType,
  accessOnly,
  doorMutate,
  startBlocked,
  requestForms,
  toastError,
  bothCallbacks,
  durationSettings,
} = vi.hoisted(() => ({
  bothCallbacks: (options: unknown, callbacks: unknown, variables: unknown) => {
    // Mirrors TanStack: the hook-level callbacks run first, then the per-call ones.
    type Callbacks = {
      onSuccess?: (data: unknown, v: unknown) => void;
      onError?: (error: unknown, v: unknown) => void;
    };
    const [hook, call] = [options as Callbacks | undefined, callbacks as Callbacks | undefined];
    return {
      onSuccess: (data: unknown, _variables?: unknown) => {
        hook?.onSuccess?.(data, variables);
        call?.onSuccess?.(data, variables);
      },
      onError: (error: unknown) => {
        hook?.onError?.(error, variables);
        call?.onError?.(error, variables);
      },
    };
  },
  startMutate: vi.fn(),
  toastError: vi.fn(),
  requestForms: vi.fn().mockResolvedValue([]),
  supervisionMode: { value: 'introduction_required' },
  resourceType: { value: 'machine' },
  accessOnly: { value: false },
  doorMutate: { lock: vi.fn(), unlock: vi.fn(), unlatch: vi.fn(), open: vi.fn() },
  startBlocked: { value: { blocked: false } as Record<string, unknown> },
  durationSettings: { required: false, maxMinutes: null as number | null },
}));

vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: () => false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  }))()),
}));

vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn(), error: toastError }),
}));

vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms, modal: null, clearFormsDraft: vi.fn() }),
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
// The real door buttons, so a click reaches the door mutation the controls wire up.
vi.mock('./DoorControls', async (importOriginal) => {
  const { DoorControls } = await importOriginal<typeof import('./DoorControls')>();
  return {
    DoorControls: (props: Parameters<typeof DoorControls>[0]) => (
      <div data-testid="door-controls">
        <DoorControls {...props} />
      </div>
    ),
  };
});
vi.mock('../SessionNotesModal', () => ({ SessionNotesModal: () => null, SessionModalMode: { START: 'start' } }));
vi.mock('./insufficientBalanceModal', () => ({ InsufficientBalanceModal: () => null }));
vi.mock('../SupervisedStartModal', () => ({
  SupervisedStartModal: ({ requestBody }: { requestBody: unknown }) => (
    <div data-testid="supervised-start-modal" data-body={JSON.stringify(requestBody)} />
  ),
}));

vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  ResourceType: { MACHINE: 'machine', DOOR: 'door' },
  SupervisionMode: {
    INTRODUCTION_REQUIRED: 'introduction_required',
    SUPERVISION_ALLOWED: 'supervision_allowed',
    SUPERVISION_REQUIRED: 'supervision_required',
  },
  useGetOneResourceById: () => ({
    data: {
      id: 1,
      type: resourceType.value,
      supervisionMode: supervisionMode.value,
      accessOnly: accessOnly.value,
      requireSessionDurationEstimate: durationSettings.required,
      maxSessionDurationMinutes: durationSettings.maxMinutes,
    },
  }),
  // The real StartBlockedGate renders; only its query answer is faked.
  useResourceUsageStartBlocked: () => ({
    data: startBlocked.value,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  // The shared start hook passes onSuccess/onError at hook level and plugin handling per call.
  useResourceUsageStartSession: (_mutationKey: unknown, options: unknown) => ({
    mutate: (variables: unknown, callbacks: unknown) =>
      startMutate(variables, bothCallbacks(options, callbacks, variables)),
    isPending: false,
  }),
  useUnlockDoor: () => ({ mutate: doorMutate.unlock, isPending: false }),
  useLockDoor: () => ({ mutate: doorMutate.lock, isPending: false }),
  useUnlatchDoor: () => ({ mutate: doorMutate.unlatch, isPending: false }),
  useOpenDoor: () => ({ mutate: doorMutate.open, isPending: false }),
  UseResourceUsageGetActiveSessionKeyFn: () => ['activeSession'],
  UseResourceUsageGetHistoryKeyFn: () => ['history'],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe('StartSessionControls supervision gating', () => {
  beforeEach(() => {
    startMutate.mockClear();
    requestForms.mockReset().mockResolvedValue([]);
    supervisionMode.value = 'introduction_required';
    resourceType.value = 'machine';
    startBlocked.value = { blocked: false };
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
    expect(startMutate).toHaveBeenLastCalledWith(
      { path: { resourceId: 1 }, body: { projectId: undefined, formSubmissions: submissions } },
      expect.any(Object),
    );
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

it('asks for a plugin confirmation on 409 CONFIRMATION_REQUIRED and retries with the step id', async () => {
  startMutate.mockClear();
  requestForms.mockReset().mockResolvedValue([]);
  supervisionMode.value = 'introduction_required';
  render(<StartSessionControls resourceId={1} />);
  await userEvent.click(screen.getByText('start'));
  const callbacks = startMutate.mock.calls[0][1];
  const error = new ApiError(
    { method: 'POST', url: '/start' },
    {
      url: '/start',
      ok: false,
      status: 409,
      statusText: 'Conflict',
      body: {
        code: 'CONFIRMATION_REQUIRED',
        stepId: 'step-1',
        confirmation: { title: 'Reserved from 14:00', body: 'Start anyway?' },
      },
    },
    'Conflict',
  );
  await act(() => callbacks.onError(error));
  expect(screen.getByText('Reserved from 14:00')).toBeInTheDocument();
  expect(startMutate).toHaveBeenCalledOnce();

  await userEvent.click(document.querySelector('[data-cy="start-confirmation-confirm"]') as HTMLElement);
  expect(startMutate).toHaveBeenCalledTimes(2);
  expect(startMutate.mock.calls[1][0].body).toMatchObject({ confirmedStepIds: ['step-1'] });
});

it('shows the plugin reason on 403 START_BLOCKED instead of a generic error', async () => {
  startMutate.mockClear();
  toastError.mockClear();
  render(<StartSessionControls resourceId={1} />);
  await userEvent.click(screen.getByText('start'));
  const callbacks = startMutate.mock.calls[0][1];
  const reason = { code: 'RESERVED', title: 'Reserved', body: 'Booked until 14:00' };
  const error = new ApiError(
    { method: 'POST', url: '/start' },
    { url: '/start', ok: false, status: 403, statusText: 'Forbidden', body: { code: 'START_BLOCKED', reason } },
    'Forbidden',
  );
  await act(() => callbacks.onError(error));
  expect(toastError).toHaveBeenCalledWith({ title: 'Reserved', description: 'Booked until 14:00' });
  expect(startMutate).toHaveBeenCalledOnce();
});

describe('StartSessionControls start-blocked gate', () => {
  const reason = { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' };
  beforeEach(() => {
    supervisionMode.value = 'introduction_required';
    startBlocked.value = { blocked: true, reason, until: '2026-06-01T14:00:00.000Z' };
  });

  it('replaces the machine start controls with the plugin notice', () => {
    resourceType.value = 'machine';
    render(<StartSessionControls resourceId={1} />);

    expect(screen.getByText(reason.body)).toBeInTheDocument();
    expect(screen.queryByText('start')).not.toBeInTheDocument();
  });

  // Door actions never pass the pre-start hook, so a booking must not hide lock/unlock from anyone.
  it('keeps the door controls while a plugin reports a blocked start', () => {
    resourceType.value = 'door';
    render(<StartSessionControls resourceId={1} />);

    expect(screen.getByTestId('door-controls')).toBeInTheDocument();
    expect(screen.queryByText(reason.body)).not.toBeInTheDocument();
  });
});

describe('StartSessionControls door actions', () => {
  beforeEach(() => {
    resourceType.value = 'door';
    startBlocked.value = { blocked: false };
    for (const mutate of Object.values(doorMutate)) mutate.mockClear();
  });

  it('opens an access-only door through the open-door call, never unlock', async () => {
    accessOnly.value = true;
    render(<StartSessionControls resourceId={1} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'door.open' }));

    expect(doorMutate.open).toHaveBeenCalledWith({ path: { resourceId: 1 } });
    expect(doorMutate.unlock).not.toHaveBeenCalled();
    expect(doorMutate.lock).not.toHaveBeenCalled();
  });

  it('unlocks a regular door through the unlock call', async () => {
    accessOnly.value = false;
    render(<StartSessionControls resourceId={1} />);

    await userEvent.click(screen.getByRole('button', { name: 'door.unlock' }));

    expect(doorMutate.unlock).toHaveBeenCalledWith({ path: { resourceId: 1 } });
    expect(doorMutate.open).not.toHaveBeenCalled();
  });
});

describe('StartSessionControls duration estimate', () => {
  const formsMissing = () =>
    new ApiError(
      { method: 'POST', url: '/start' },
      { url: '/start', ok: false, status: 400, statusText: 'Error', body: { message: 'Submit forms' } },
      'Bad request',
    );
  const confirmationRequired = () =>
    new ApiError(
      { method: 'POST', url: '/start' },
      {
        url: '/start',
        ok: false,
        status: 409,
        statusText: 'Conflict',
        body: { code: 'CONFIRMATION_REQUIRED', stepId: 'step-1', confirmation: { title: 'Reserved', body: 'Go?' } },
      },
      'Conflict',
    );
  const confirmButton = () => document.querySelector('[data-cy="session-duration-confirm"]') as HTMLElement;

  /** Presses start and answers the dialog with the given hours. */
  const startWithEstimate = async (hours: string) => {
    render(<StartSessionControls resourceId={1} />);
    await userEvent.click(screen.getByText('start'));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'hours' }), { target: { value: hours } });
    await userEvent.click(confirmButton());
  };

  beforeEach(() => {
    startMutate.mockClear();
    requestForms.mockReset().mockResolvedValue([]);
    supervisionMode.value = 'introduction_required';
    resourceType.value = 'machine';
    startBlocked.value = { blocked: false };
    durationSettings.required = true;
    durationSettings.maxMinutes = null;
  });
  afterEach(() => {
    durationSettings.required = false;
  });

  it('asks before the forms and the start, and sends the estimate in the start body', async () => {
    render(<StartSessionControls resourceId={1} />);
    await userEvent.click(screen.getByText('start'));

    expect(confirmButton()).toBeInTheDocument();
    expect(requestForms).not.toHaveBeenCalled();
    expect(startMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'hours' }), { target: { value: '2' } });
    await userEvent.click(confirmButton());

    await waitFor(() => expect(startMutate).toHaveBeenCalledOnce());
    expect(requestForms).toHaveBeenCalledOnce();
    expect(startMutate.mock.calls[0][0].body).toMatchObject({ estimatedDurationMinutes: 120 });
  });

  it('sends nothing when the dialog is cancelled', async () => {
    render(<StartSessionControls resourceId={1} />);
    await userEvent.click(screen.getByText('start'));
    await userEvent.click(screen.getByRole('button', { name: 'cancel' }));

    await waitFor(() => expect(confirmButton()).toBeNull());
    expect(requestForms).not.toHaveBeenCalled();
    expect(startMutate).not.toHaveBeenCalled();
  });

  it('keeps the estimate in the retry after the forms were missing', async () => {
    await startWithEstimate('3');
    await waitFor(() => expect(startMutate).toHaveBeenCalledOnce());
    const submissions = [{ formId: 7, data: { training: true } }];
    requestForms.mockResolvedValue(submissions);

    await act(() => startMutate.mock.calls[0][1].onError(formsMissing()));

    expect(startMutate).toHaveBeenCalledTimes(2);
    expect(startMutate.mock.calls[1][0].body).toMatchObject({
      formSubmissions: submissions,
      estimatedDurationMinutes: 180,
    });
  });

  it('keeps the estimate in the retry after a plugin confirmation', async () => {
    await startWithEstimate('2');
    await waitFor(() => expect(startMutate).toHaveBeenCalledOnce());

    await act(() => startMutate.mock.calls[0][1].onError(confirmationRequired()));
    await userEvent.click(document.querySelector('[data-cy="start-confirmation-confirm"]') as HTMLElement);

    expect(startMutate).toHaveBeenCalledTimes(2);
    expect(startMutate.mock.calls[1][0].body).toMatchObject({
      confirmedStepIds: ['step-1'],
      estimatedDurationMinutes: 120,
    });
  });

  it('carries the estimate in the supervised start request', async () => {
    supervisionMode.value = 'supervision_required';
    await startWithEstimate('4');

    const modal = await screen.findByTestId('supervised-start-modal');
    expect(JSON.parse(modal.dataset.body ?? '{}')).toMatchObject({ estimatedDurationMinutes: 240 });
    expect(startMutate).not.toHaveBeenCalled();
  });
});
