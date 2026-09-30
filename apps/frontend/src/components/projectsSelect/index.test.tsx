import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectsSelect } from './index';
const state = vi.hoisted(() => ({
  projects: undefined as undefined | { data: { id: number; name: string }[] },
  query: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useProjectsServiceFindManyProjects: (params: unknown) => {
    state.query(params);
    return { data: state.projects };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.projects = {
    data: [
      { id: 7, name: 'Workshop' },
      { id: 8, name: 'Research' },
    ],
  };
});
afterEach(cleanup);
it('shows the selected project and emits numeric selections while preserving archive query options', async () => {
  const change = vi.fn();
  const legacyChange = vi.fn();
  render(<ProjectsSelect value={7} onValueChange={change} onChange={legacyChange} includeArchived label="Project" />);
  expect(screen.getByRole('button', { name: /Workshop/ })).toBeTruthy();
  expect(state.query).toHaveBeenCalledWith({ includeArchived: true });
  fireEvent.click(screen.getByRole('button', { name: /Workshop/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Research' }));
  expect(change).toHaveBeenCalledWith(8);
  expect(legacyChange).not.toHaveBeenCalled();
});
it('supports clearing assignment through the legacy change callback', async () => {
  const change = vi.fn();
  render(<ProjectsSelect value={7} onChange={change} includeUnassignedOption unassignedLabel="No project" />);
  fireEvent.click(screen.getByRole('button', { name: /Workshop/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'No project' }));
  expect(change).toHaveBeenCalledWith(undefined);
});
it('renders the placeholder before projects arrive and supports an optional change handler', async () => {
  state.projects = undefined;
  render(<ProjectsSelect value={null} placeholder="Choose project" includeUnassignedOption />);
  fireEvent.click(screen.getByRole('button', { name: /Choose project/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Unassigned' }));
  expect(state.query).toHaveBeenCalledWith({ includeArchived: undefined });
});
