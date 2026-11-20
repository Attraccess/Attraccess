import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalFlowEditorPage } from './GlobalFlowEditorPage';
import { TestWrapper } from '../../test-utils/wrappers';

const FLOW = { id: 9, name: 'Power off all', description: null, enabled: true };
const state = vi.hoisted(() => ({
  update: vi.fn(),
  owner: undefined as unknown,
  query: undefined as unknown as { data: unknown; isError: boolean },
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../resources/details/flows/FlowEditor', () => ({
  FlowEditor: ({ owner }: { owner: unknown }) => {
    state.owner = owner;
    return <div>editor</div>;
  },
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useGetGlobalFlow: () => state.query,
  useUpdateGlobalFlow: () => ({ mutate: state.update, isPending: false }),
}));

function show() {
  render(
    <TestWrapper
      initialRoute="/devices/flows/9"
      routes={<Route path="/devices/flows/:flowId" element={<GlobalFlowEditorPage />} />}
    />,
  );
}

beforeEach(() => {
  state.query = { data: FLOW, isError: false };
});

describe('GlobalFlowEditorPage', () => {
  it('keeps the editor, and its unsaved edits, when a background refetch fails', () => {
    state.query = { data: FLOW, isError: true };
    show();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.queryByText('This flow could not be loaded.')).toBeNull();
  });

  it('shows the load error when the flow never loaded', () => {
    state.query = { data: undefined, isError: true };
    show();
    expect(screen.getByText('This flow could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('editor')).toBeNull();
  });

  it('opens the editor for the global flow with its name, the notice and the enabled switch', async () => {
    render(
      <TestWrapper
        initialRoute="/devices/flows/9"
        routes={<Route path="/devices/flows/:flowId" element={<GlobalFlowEditorPage />} />}
      />,
    );

    expect(screen.getByText('Power off all')).toBeInTheDocument();
    expect(screen.getByText(/Runs for every resource; a failing or slow global flow/)).toBeInTheDocument();
    expect(state.owner).toEqual({ kind: 'global', flowId: 9 });

    // The switch sits in the page header, next to the name.
    const header = screen.getByRole('heading', { name: 'Power off all' }).closest('.justify-between') as HTMLElement;
    const toggle = within(header).getByRole('switch', { name: 'Enabled' });
    expect(toggle).toBeChecked();

    await userEvent.setup().click(toggle);
    expect(state.update).toHaveBeenCalledWith({ path: { flowId: 9 }, body: { enabled: false } });
  });

  it('edits the flow name and description from the header', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper
        initialRoute="/devices/flows/9"
        routes={<Route path="/devices/flows/:flowId" element={<GlobalFlowEditorPage />} />}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Power off all');

    await user.clear(name);
    await user.type(name, 'Power off the lab');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(state.update).toHaveBeenCalledWith({
      path: { flowId: 9 },
      body: { name: 'Power off the lab', description: null },
    });
  });
});
