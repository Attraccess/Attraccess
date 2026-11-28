import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectsSelect } from './index';
const state = vi.hoisted(() => ({
  projects: undefined as undefined | { data: { id: number; name: string }[] },
  query: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useFindManyProjects: (params: unknown) => {
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
  expect(state.query).toHaveBeenCalledWith({ query: { includeArchived: true } });
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
  render(<ProjectsSelect value={undefined} placeholder="Choose project" includeUnassignedOption />);
  fireEvent.click(screen.getByRole('button', { name: /Choose project/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Unassigned' }));
  expect(state.query).toHaveBeenCalledWith({ query: { includeArchived: undefined } });
});
it('shows a chosen "unassigned" as the selected option, unlike nothing chosen yet', () => {
  const view = render(
    <ProjectsSelect
      value={undefined}
      placeholder="Choose project"
      includeUnassignedOption
      unassignedLabel="No project"
    />,
  );
  expect(screen.getByRole('button', { name: /Choose project/ })).toBeTruthy();
  view.rerender(
    <ProjectsSelect value={null} placeholder="Choose project" includeUnassignedOption unassignedLabel="No project" />,
  );
  expect(screen.getByRole('button', { name: /No project/ })).toBeTruthy();
});
it('locks the select while disabled', () => {
  render(<ProjectsSelect value={7} isDisabled label="Project" />);
  expect(screen.getByRole('button', { name: /Workshop/ }).hasAttribute('disabled')).toBe(true);
});
it('is named by its visible label alone, once', () => {
  render(<ProjectsSelect value={7} label="New project" />);
  expect(screen.getByRole('button', { name: /^Workshop New project$|^New project Workshop$/ })).toBeTruthy();
});
