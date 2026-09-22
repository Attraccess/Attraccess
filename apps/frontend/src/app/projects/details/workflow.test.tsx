import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectDetailsPage } from './index';
import { ProjectTeamPage } from './team';
const state = vi.hoisted(() => ({
  project: undefined as
    | undefined
    | {
        id: number;
        name: string;
        description: string;
        logo: string | null;
        archivedAt: string | null;
        access: { isOwner: boolean };
      },
  query: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  openEditor: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  invalidate: vi.fn(),
  callbacks: {} as Record<string, { onSuccess: () => void; onError: (error: Error) => void }>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useProjectsServiceFindOneProject: (...args: unknown[]) => {
    state.query(...args);
    return { data: state.project };
  },
  useProjectsServiceFindManyProjectsKey: 'projects',
  useProjectsServiceFindOneProjectKey: 'project',
  useProjectsServiceDeleteOneProject: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.remove = options;
    return { mutate: state.remove, isPending: false };
  },
  useProjectsServiceArchiveProject: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.archive = options;
    return { mutate: state.archive, isPending: false };
  },
  useProjectsServiceUnarchiveProject: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.unarchive = options;
    return { mutate: state.unarchive, isPending: false };
  },
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../upsertModal', () => ({
  UpsertProjectModal: ({ children }: { children: (open: () => void) => ReactNode }) => children(state.openEditor),
}));
vi.mock('./components/projectSummaryCards', () => ({
  ProjectSummaryCards: ({ projectId }: { projectId: number }) => <p>Summary {projectId}</p>,
}));
vi.mock('./components/projectUsageCharts', () => ({
  ProjectUsageCharts: ({ projectId }: { projectId: number }) => <p>Charts {projectId}</p>,
}));
vi.mock('./components/projectUsageHistory', () => ({
  ProjectUsageHistory: ({ projectId }: { projectId: number }) => <p>History {projectId}</p>,
}));
vi.mock('./components/projectTeam/TeamInviteCard', () => ({
  TeamInviteCard: ({ projectId, isOwner }: { projectId: number; isOwner: boolean }) => (
    <p>
      Invite {projectId} {String(isOwner)}
    </p>
  ),
}));
vi.mock('./components/projectTeam/TeamPendingInvitesCard', () => ({
  TeamPendingInvitesCard: ({ projectId, isOwner }: { projectId: number; isOwner: boolean }) => (
    <p>
      Pending {projectId} {String(isOwner)}
    </p>
  ),
}));
vi.mock('./components/projectTeam/TeamMembersCard', () => ({
  TeamMembersCard: ({ projectId, isOwner }: { projectId: number; isOwner: boolean }) => (
    <p>
      Members {projectId} {String(isOwner)}
    </p>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.callbacks = {};
  state.project = {
    id: 7,
    name: 'Workshop',
    description: 'Shared tools',
    logo: 'logo.png',
    archivedAt: null,
    access: { isOwner: true },
  };
});
afterEach(cleanup);
function mount(path = '/projects/7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailsPage />} />
        <Route path="/projects/:id/team" element={<ProjectTeamPage />} />
        <Route path="/projects" element={<p>Project list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function action(name: string) {
  const button = screen.queryByRole('button', { name });
  if (button) {
    fireEvent.click(button);
    return;
  }
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}
it('scopes summary content and allows owners to edit and archive a project', async () => {
  mount();
  expect(state.query).toHaveBeenCalledWith({ id: 7 }, undefined, { enabled: true });
  expect(screen.getByAltText('Workshop')).toHaveAttribute('src', expect.stringContaining('logo.png'));
  expect(screen.getByText('Summary 7')).toBeTruthy();
  await action('Update Project');
  expect(state.openEditor).toHaveBeenCalledOnce();
  await action('Archive Project');
  expect(state.archive).toHaveBeenCalledWith({ id: 7 });
  act(() => state.callbacks.archive.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['project'] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Project archived' }));
});
it('unarchives archived projects and confirms deletion before navigating away', async () => {
  state.project!.archivedAt = '2026-09-01';
  mount();
  expect(screen.getByText('Archived')).toBeTruthy();
  await action('Unarchive Project');
  expect(state.unarchive).toHaveBeenCalledWith({ id: 7 });
  act(() => state.callbacks.unarchive.onSuccess());
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Project unarchived' }));
  await action('Delete Project');
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await action('Delete Project');
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 7 });
  act(() => state.callbacks.remove.onSuccess());
  expect(screen.getByText('Project list')).toBeTruthy();
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Project successfully deleted' }));
});
it('routes owners to the team page and forwards ownership to all team controls', async () => {
  mount();
  await action('Team members');
  expect(screen.getByText('Invite 7 true')).toBeTruthy();
  expect(screen.getByText('Pending 7 true')).toBeTruthy();
  expect(screen.getByText('Members 7 true')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByText('Summary 7')).toBeTruthy();
});
it('hides owner actions for members and forwards read-only team state', () => {
  state.project!.access.isOwner = false;
  state.project!.logo = null;
  const view = mount();
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  view.unmount();
  mount('/projects/7/team');
  expect(screen.getByText('Invite 7 false')).toBeTruthy();
  expect(screen.getByText('Members 7 false')).toBeTruthy();
});
it('disables invalid-id queries, shows loading placeholders and reports all mutation errors', () => {
  state.project = undefined;
  const view = mount('/projects/invalid');
  expect(state.query).toHaveBeenCalledWith({ id: NaN }, undefined, { enabled: false });
  expect(screen.queryByText(/Summary/)).toBeNull();
  expect(view.container.querySelector('.skeleton')).toBeTruthy();
  const error = new Error('Forbidden');
  for (const operation of ['remove', 'archive', 'unarchive']) act(() => state.callbacks[operation].onError(error));
  expect(state.apiError).toHaveBeenCalledTimes(3);
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  view.unmount();
  mount('/projects/invalid/team');
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByText('Project list')).toBeTruthy();
});
