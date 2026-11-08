import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalFlowsListPage } from './GlobalFlowsListPage';
import { TestWrapper } from '../../test-utils/wrappers';

const state = vi.hoisted(() => ({
  flows: [] as Array<{ id: number; name: string; description: string | null; enabled: boolean; nodeCount: number }>,
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => state.navigate,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permission === 'resources.update' }),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useGlobalFlowsServiceListGlobalFlows: () => ({ data: state.flows, isLoading: false, isError: false }),
  useGlobalFlowsServiceUpdateGlobalFlow: () => ({ mutate: state.update, isPending: false }),
  useGlobalFlowsServiceDeleteGlobalFlow: () => ({ mutate: state.remove, isPending: false }),
  useGlobalFlowsServiceCreateGlobalFlow: (options: { onSuccess: (flow: { id: number }) => void }) => ({
    mutate: (variables: unknown) => {
      state.create(variables);
      options.onSuccess({ id: 42 });
    },
    isPending: false,
  }),
}));

function renderPage() {
  return render(
    <TestWrapper>
      <GlobalFlowsListPage />
    </TestWrapper>,
  );
}

beforeEach(() => {
  state.flows = [
    { id: 1, name: 'Power off all', description: 'Cuts the power', enabled: true, nodeCount: 3 },
    { id: 2, name: 'Notify', description: null, enabled: false, nodeCount: 0 },
  ];
  state.update.mockClear();
  state.remove.mockClear();
  state.create.mockClear();
  state.navigate.mockClear();
});

describe('GlobalFlowsListPage', () => {
  it('lists the flows with description, state and node count', () => {
    renderPage();

    const row = screen.getByRole('row', { name: /Power off all/ });
    expect(within(row).getByText('Cuts the power')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByRole('switch')).toBeChecked();
    expect(within(screen.getByRole('row', { name: /Notify/ })).getByRole('switch')).not.toBeChecked();
  });

  it('shows an empty state without flows', () => {
    state.flows = [];
    renderPage();

    expect(screen.getByText('There are no global flows yet.')).toBeInTheDocument();
  });

  it('switches a flow on and off through updateGlobalFlow', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(screen.getByRole('row', { name: /Power off all/ })).getByRole('switch'));
    expect(state.update).toHaveBeenCalledWith({ flowId: 1, requestBody: { enabled: false } });

    await user.click(within(screen.getByRole('row', { name: /Notify/ })).getByRole('switch'));
    expect(state.update).toHaveBeenCalledWith({ flowId: 2, requestBody: { enabled: true } });
  });

  it('names each switch by the state it shows', () => {
    renderPage();

    expect(screen.getByRole('switch', { name: 'Power off all enabled' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Notify enabled' })).not.toBeChecked();
  });

  it('locks only the switch of the flow being saved', async () => {
    const user = userEvent.setup();
    renderPage();

    // The mocked mutation never settles, so the first flow stays in its saving state.
    await user.click(screen.getByRole('switch', { name: 'Power off all enabled' }));

    expect(screen.getByRole('switch', { name: 'Power off all enabled' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Notify enabled' })).toBeEnabled();
  });

  it('opens the editor from the edit action', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Notify' }));
    expect(state.navigate).toHaveBeenCalledWith('/devices/flows/2');
  });

  it('deletes only after the confirmation dialog is confirmed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Power off all' }));
    expect(state.remove).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Delete the flow "Power off all"/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(state.remove).toHaveBeenCalledWith({ flowId: 1 });
  });

  it('creates a flow from the modal and opens its editor', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New flow' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Create flow' });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Lights');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Turn lights off');
    await user.click(submit);

    expect(state.create).toHaveBeenCalledWith({ requestBody: { name: 'Lights', description: 'Turn lights off' } });
    expect(state.navigate).toHaveBeenCalledWith('/devices/flows/42');
  });

  it('creates a flow when Enter is pressed in the name field', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New flow' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Lights{Enter}');

    expect(state.create).toHaveBeenCalledWith({ requestBody: { name: 'Lights', description: undefined } });
  });

  it('starts every opening of the create modal empty, even after a cancelled attempt', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New flow' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Abandoned');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'New flow' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(state.create).not.toHaveBeenCalled();
  });

  it('limits the name and the description to what the API accepts', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New flow' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAttribute('maxlength', '200');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveAttribute('maxlength', '2000');
  });

  it('edits the name and description of a flow without creating a new one', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit details of Power off all' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    const description = within(dialog).getByRole('textbox', { name: 'Description' });
    expect(name).toHaveValue('Power off all');
    expect(description).toHaveValue('Cuts the power');

    await user.clear(name);
    await user.type(name, 'Power off everything');
    await user.clear(description);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(state.update).toHaveBeenCalledWith({
      flowId: 1,
      requestBody: { name: 'Power off everything', description: null },
    });
    expect(state.create).not.toHaveBeenCalled();
  });

  it('keeps the flow unchanged when the edit is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit details of Notify' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' changed');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(state.update).not.toHaveBeenCalled();
  });
});
