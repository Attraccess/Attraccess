import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectsListPage } from './index';
import { UpsertProjectModal } from './upsertModal';
type MutationOptions = {
  onSuccess: (value: unknown) => void;
  onError: (error: unknown) => void;
  onSettled?: () => void;
};
const state = vi.hoisted(() => ({
  projects: undefined as
    undefined | { data: { id: number; name: string; description: string; archivedAt?: string; logo?: string }[] },
  existing: undefined as undefined | { id: number; name: string; description: string; logo?: string },
  invitations: [] as {
    id: number;
    project?: { name: string };
    inviter?: { username: string };
    requestedRole: string;
    createdAt: string;
  }[],
  loading: false,
  invitationsLoading: false,
  list: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
  options: {} as Record<string, MutationOptions>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useProjectsServiceFindManyProjectsKey: 'projects',
  UseProjectInvitationsServiceListMyProjectInvitationsKeyFn: () => ['invitations'],
  UseProjectsServiceFindOneProjectKeyFn: ({ id }: { id: number }) => ['project', id],
  useProjectsServiceFindManyProjects: (args: unknown) => {
    state.list(args);
    return { data: state.projects, isLoading: state.loading };
  },
  useProjectsServiceFindOneProject: () => ({ data: state.existing }),
  useProjectInvitationsServiceListMyProjectInvitations: () => ({
    data: state.invitations,
    isLoading: state.invitationsLoading,
  }),
  useProjectInvitationsServiceAcceptProjectInvitation: (o: MutationOptions) => {
    state.options.accept = o;
    return { mutateAsync: state.accept };
  },
  useProjectInvitationsServiceDeclineProjectInvitation: (o: MutationOptions) => {
    state.options.decline = o;
    return { mutateAsync: state.decline };
  },
  useProjectsServiceCreateProject: (o: MutationOptions) => {
    state.options.create = o;
    return { mutate: state.create };
  },
  useProjectsServiceUpdateProject: (o: MutationOptions) => {
    state.options.update = o;
    return { mutate: state.update };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error, error: state.error }),
}));
vi.mock('../../api', () => ({ filenameToUrl: (name: string) => (name ? '/assets/' + name : '') }));
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    projects: undefined,
    existing: undefined,
    invitations: [],
    loading: false,
    invitationsLoading: false,
  });
  state.accept.mockResolvedValue(undefined);
  state.decline.mockResolvedValue(undefined);
});
afterEach(cleanup);
function Location() {
  return <output>{useLocation().search}</output>;
}
function show(path = '/projects') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <ProjectsListPage />
    </MemoryRouter>,
  );
}
it('shows project cards, archived state and switches the archive query filter', () => {
  state.projects = { data: [{ id: 1, name: 'Restoration', description: 'Repair a lathe', archivedAt: '2026-01-01' }] };
  show();
  expect(screen.getByRole('link', { name: /Restoration/ })).toHaveAttribute('href', '/projects/1');
  expect(screen.getByAltText('Restoration')).toHaveAttribute('src', '/project-no-thumbnail.svg');
  expect(screen.getByText('filters.archivedBadge')).toBeTruthy();
  fireEvent.click(screen.getByRole('switch', { name: 'filters.includeArchived' }));
  expect(state.list).toHaveBeenLastCalledWith({ page: 1, includeArchived: true });
});
it('highlights a linked invitation, accepts it and refreshes both lists', async () => {
  state.invitations = [
    {
      id: 7,
      project: { name: 'Invited project' },
      inviter: { username: 'Ada' },
      requestedRole: 'member',
      createdAt: '2026-01-01',
    },
  ];
  show('/projects?invitationId=7&keep=yes');
  expect(screen.getByText('?keep=yes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'invitations.actions.accept' }));
  expect(state.accept).toHaveBeenCalledWith({ invitationId: 7 });
  act(() => {
    state.options.accept.onSuccess({});
    state.options.accept.onSettled?.();
  });
  await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] }));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['invitations'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'invitations.success.accept' });
});
it('declines invitations and reports API failures without dropping the invitation', () => {
  state.invitations = [{ id: 9, requestedRole: 'member', createdAt: '2026-01-01' }];
  show('/projects?invitationId=invalid');
  fireEvent.click(screen.getByRole('button', { name: 'invitations.actions.decline' }));
  expect(state.decline).toHaveBeenCalledWith({ invitationId: 9 });
  const error = new Error('Denied');
  act(() => {
    state.options.decline.onError(error);
    state.options.decline.onSettled?.();
  });
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  act(() => state.options.decline.onSuccess({}));
  expect(state.success).toHaveBeenCalledWith({ title: 'invitations.success.decline' });
});
it('opens project creation and submits the form before refreshing cached details', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'inputs.name.label' }), {
    target: { value: 'New project' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'inputs.description.label' }), {
    target: { value: 'Description' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'actions.create.label' }));
  expect(state.create).toHaveBeenCalledWith({
    formData: { name: 'New project', description: 'Description', logo: undefined },
  });
  act(() => state.options.create.onSuccess({ id: 8, name: 'New project' }));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['project', 8] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'actions.create.success.title' }));
});
it('loads existing project fields and explicitly deletes the previous logo', async () => {
  state.existing = { id: 4, name: 'Existing', description: 'Original', logo: 'logo.png' };
  render(
    <MemoryRouter>
      <UpsertProjectModal projectId={4}>{(open) => <button onClick={open}>Edit project</button>}</UpsertProjectModal>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Edit project'));
  expect(await screen.findByRole('textbox', { name: 'inputs.name.label' })).toHaveValue('Existing');
  fireEvent.click(
    screen.getByAltText('Preview').closest('div.relative')?.parentElement?.querySelector('button') as HTMLButtonElement,
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.update.label' }));
  expect(state.update).toHaveBeenCalledWith({
    id: 4,
    formData: { name: 'Existing', description: 'Original', logo: undefined, deleteLogo: true },
  });
  const error = new Error('Denied');
  act(() => state.options.update.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  act(() => state.options.update.onSuccess({ id: 4, name: 'Existing' }));
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'actions.update.success.title' }));
});
