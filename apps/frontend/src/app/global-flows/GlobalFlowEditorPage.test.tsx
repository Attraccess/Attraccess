import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GlobalFlowEditorPage } from './GlobalFlowEditorPage';
import { TestWrapper } from '../../test-utils/wrappers';

const state = vi.hoisted(() => ({ update: vi.fn(), owner: undefined as unknown }));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../resources/details/flows/index', () => ({
  FlowEditor: ({ owner }: { owner: unknown }) => {
    state.owner = owner;
    return <div>editor</div>;
  },
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useGlobalFlowsServiceGetGlobalFlow: () => ({
    data: { id: 9, name: 'Power off all', description: null, enabled: true },
    isError: false,
  }),
  useGlobalFlowsServiceUpdateGlobalFlow: () => ({ mutate: state.update, isPending: false }),
}));

describe('GlobalFlowEditorPage', () => {
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

    await userEvent.setup().click(screen.getByRole('switch'));
    expect(state.update).toHaveBeenCalledWith({ flowId: 9, requestBody: { enabled: false } });
  });
});
