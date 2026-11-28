import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { SessionProjectSection } from './SessionProjectSection';

const state = vi.hoisted(() => ({
  restricted: new Set<string>(),
  projects: [] as Array<{ id: number; name: string }>,
  mutate: vi.fn(),
  requestForms: vi.fn(),
  pending: false,
  charging: 'continue',
  listState: 'ready' as 'ready' | 'loading' | 'error',
  refetch: vi.fn(),
  warning: vi.fn(),
  selectProps: {} as { value?: number | null; label?: string; ariaLabel?: string; disabledKeys?: unknown },
}));

vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));
vi.mock('../../../../../components/networkRestriction/NetworkRestrictedHint', () => ({
  NetworkRestrictedHint: () => <p role="note">onlyLocal</p>,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  ProjectChangeMode: { WHOLE_SESSION: 'whole-session', SPLIT: 'split' },
  ProjectSwitchCharging: { NEW_SESSION: 'new-session' },
  useGetResourceBillingConfiguration: () => ({ data: { configuration: { projectSwitchCharging: state.charging } } }),
  useFindManyProjects: () => ({
    data: state.listState === 'ready' ? { data: state.projects } : undefined,
    isLoading: state.listState === 'loading',
    isError: state.listState === 'error',
    refetch: state.refetch,
  }),
  UseResourceUsageGetActiveSessionKeyFn: () => ['active-session'],
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ warning: state.warning }),
}));
vi.mock('../../../../../components/projectsSelect', () => ({
  ProjectsSelect: ({
    onChange,
    ...props
  }: {
    onChange: (id: number | undefined) => void;
    value?: number | null;
    label?: string;
    ariaLabel?: string;
    disabledKeys?: unknown;
  }) => {
    state.selectProps = props;
    return (
      <div>
        <button onClick={() => onChange(undefined)}>pick none</button>
        <button onClick={() => onChange(7)}>pick current</button>
        <button onClick={() => onChange(8)}>pick other</button>
      </div>
    );
  },
}));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.requestForms, modal: null, clearFormsDraft: vi.fn() }),
}));
vi.mock('./useSwitchSessionProject', () => ({
  useSwitchSessionProject: () => ({ mutate: state.mutate, isPending: state.pending, reportError: vi.fn() }),
}));

const usage = (project: { id: number; name: string } | null, id = 22) =>
  ({ id, userId: 3, project }) as unknown as ResourceUsage;
let queryClient: QueryClient;
const section = (session: ResourceUsage) => (
  <QueryClientProvider client={queryClient}>
    <SessionProjectSection resourceId={11} usage={session} />
  </QueryClientProvider>
);
const mount = (project: { id: number; name: string } | null) => render(section(usage(project)));
const current = { id: 7, name: 'Rocket' };
const confirmButton = (mode = 'whole-session') => screen.getByRole('button', { name: `dialog.confirm.${mode}` });
const modeOption = (mode: string) => screen.getByRole('radio', { name: new RegExp(`mode\\.options\\.${mode}`) });

describe('switching the project of the running session', () => {
  beforeEach(() => {
    state.restricted = new Set();
    state.projects = [current, { id: 8, name: 'Boat' }];
    state.mutate.mockReset();
    state.requestForms.mockReset().mockResolvedValue([]);
    state.pending = false;
    state.charging = 'continue';
    state.listState = 'ready';
    state.refetch.mockReset();
    state.warning.mockReset();
    queryClient = new QueryClient();
  });

  const openAndPick = async (user: ReturnType<typeof userEvent.setup>, pick = 'pick other') => {
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: pick }));
  };

  it('shows the project the session is booked to', () => {
    mount(current);

    expect(screen.getByText('Rocket')).toBeInTheDocument();
  });

  it('shows nothing to somebody without any project whose session has none', () => {
    state.projects = [];
    const { container } = mount(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('follows the network rule of starting a session', () => {
    state.restricted = new Set(['usage.start']);
    mount(current);

    expect(screen.getByRole('button', { name: 'change' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('onlyLocal');
  });

  it('cannot confirm before another project is picked', async () => {
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(confirmButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'pick other' }));
    expect(confirmButton()).toBeEnabled();
  });

  it.each([
    ['its project', current, 7],
    ['"No project"', null, null],
  ])('does not offer the session %s as the new project', async (_name, project, disabledKey) => {
    const user = userEvent.setup();
    mount(project);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(state.selectProps.disabledKeys).toEqual([disabledKey]);
  });

  it('preselects the whole session', async () => {
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(modeOption('whole-session')).toBeChecked();
    expect(modeOption('split')).not.toBeChecked();
    expect(screen.getByText('mode.descriptions.whole')).toBeInTheDocument();
    expect(screen.getByText('mode.descriptions.split')).toBeInTheDocument();
  });

  it('says that the whole session of a continuation only reaches back to the last change', async () => {
    const user = userEvent.setup();
    render(section({ ...usage(current), previousUsageId: 21, startTime: new Date().toISOString() } as ResourceUsage));
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(screen.getByText('mode.descriptions.wholeSinceChange')).toBeInTheDocument();
    expect(screen.queryByText('mode.descriptions.whole')).not.toBeInTheDocument();
  });

  it('warns about the new fee only for a split on a machine that charges it like a new session', async () => {
    state.charging = 'new-session';
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(screen.queryByText('mode.newSessionFee')).not.toBeInTheDocument();
    await user.click(modeOption('split'));
    expect(screen.getByText('mode.newSessionFee')).toBeInTheDocument();
  });

  it.each([
    ['whole-session', 'project-reassign', 'pick other', 8],
    ['whole-session', 'project-reassign', 'pick none', null],
    ['split', 'project-switch', 'pick other', 8],
    ['split', 'project-switch', 'pick none', null],
  ])('asks for the forms of %s, then changes the named session', async (mode, formAction, pick, projectId) => {
    const forms = [{ formId: 3, answers: [] }];
    state.requestForms.mockResolvedValue(forms);
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: pick }));
    if (mode === 'split') await user.click(modeOption('split'));
    await user.click(confirmButton(mode));

    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.requestForms).toHaveBeenCalledWith(formAction);
    expect(state.mutate).toHaveBeenCalledWith({
      path: { resourceId: 11 },
      body: { mode, usageId: 22, projectId, formSubmissions: forms },
    });
  });

  it('says so once the session was moved to another project elsewhere', async () => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);

    view.rerender(section(usage({ id: 9, name: 'Plane' })));

    expect(screen.getByText('dialog.replaced.title')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('keeps the project when the forms are cancelled', async () => {
    state.requestForms.mockRejectedValue(new Error('user_cancelled_forms'));
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: 'pick other' }));
    await user.click(confirmButton());

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('announces the select by its label and keeps "No project" apart from nothing picked', async () => {
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    // The visible label alone names it: a second, equal name would be announced in addition.
    expect(state.selectProps.label).toBe('dialog.select');
    expect(state.selectProps.ariaLabel).toBeUndefined();
    expect(state.selectProps.value).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'pick none' }));
    expect(state.selectProps.value).toBeNull();
  });

  it('keeps naming the session it was opened for, and says so once that session was replaced', async () => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);

    view.rerender(section(usage({ id: 9, name: 'Plane' }, 23)));

    expect(screen.getByText('dialog.replaced.title')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('sends the session it was opened for when that is replaced while the forms are filled in', async () => {
    let submit: (forms: never[]) => void = () => undefined;
    state.requestForms.mockReturnValue(new Promise((resolve) => (submit = resolve)));
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);
    await user.click(confirmButton());

    view.rerender(section(usage({ id: 9, name: 'Plane' }, 23)));
    submit([]);

    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.mutate.mock.calls[0][0].body.usageId).toBe(22);
  });

  it('does not take its own switch for a change made elsewhere', async () => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);
    state.pending = true;

    view.rerender(section(usage({ id: 8, name: 'Boat' }, 23)));

    expect(screen.queryByText('dialog.replaced.title')).not.toBeInTheDocument();
  });

  it('stays open while the switch is in flight', async () => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);
    state.pending = true;
    view.rerender(section(usage(current)));

    expect(screen.getByRole('button', { name: 'dialog.cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('[data-slot="modal-backdrop"]') as HTMLElement);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  const runningSessions = (...usages: Array<{ id: number; userId: number }>) =>
    queryClient.setQueryData(['active-session'], { usage: usages[0] ?? null, usages });

  it('explains why the dialog vanished when the session ended', async () => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);

    runningSessions({ id: 40, userId: 4 });
    view.unmount();

    expect(state.warning).toHaveBeenCalledWith({ title: 'ended.title', description: 'ended.description' });
  });

  it.each([
    ['leaving the page', { id: 22, userId: 3 }],
    ['its own switch', { id: 23, userId: 3 }],
  ])('says nothing about an ended session after %s', async (_name, running) => {
    const user = userEvent.setup();
    const view = mount(current);
    await openAndPick(user);

    runningSessions(running);
    view.unmount();

    expect(state.warning).not.toHaveBeenCalled();
  });

  it('shows nothing while it is unknown whether somebody in a session without a project has projects', () => {
    state.listState = 'loading';
    const { container } = mount(null);

    expect(container).toBeEmptyDOMElement();
  });

  it.each(['loading', 'error'] as const)(
    'keeps the state of the project list (%s) out of the session card',
    async (listState) => {
      state.listState = listState;
      const user = userEvent.setup();
      mount(current);

      expect(screen.getByText('Rocket')).toBeInTheDocument();
      expect(screen.queryByText('projects.loading')).not.toBeInTheDocument();
      expect(screen.queryByText('projects.loadError')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'change' }));
      expect(screen.getByRole('dialog')).toHaveTextContent(
        listState === 'loading' ? 'projects.loading' : 'projects.loadError',
      );
    },
  );

  it('offers to retry loading the projects in the dialog', async () => {
    state.listState = 'error';
    const user = userEvent.setup();
    mount(null);
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: 'projects.retry' }));

    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('tells in the dialog that the projects are missing, not only offering "No project"', async () => {
    state.listState = 'error';
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('projects.loadError');
  });
});
