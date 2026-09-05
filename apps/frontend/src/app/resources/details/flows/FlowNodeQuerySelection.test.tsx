import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { type Node } from '@xyflow/react';
import { FlowNodeQuerySelection } from './FlowNodeQuerySelection';

const mocks = vi.hoisted(() => ({ initialized: false, fitView: vi.fn() }));
vi.mock('@xyflow/react', () => ({
  useNodesInitialized: () => mocks.initialized,
  useReactFlow: () => ({ fitView: mocks.fitView }),
}));
const id = 'node /?#&+%';
const initial: Node[] = [id, 'other'].map((id) => ({ id, position: { x: 1, y: 2 }, data: { unsaved: true } }));

function Host() {
  const [nodes, setNodes] = useState(initial);
  const navigate = useNavigate();
  return (
    <>
      <FlowNodeQuerySelection nodes={nodes} setNodes={setNodes} />
      <output>{JSON.stringify(nodes)}</output>
      <button onClick={() => setNodes((current) => current.map((node) => ({ ...node, selected: false })))}>
        Deselect
      </button>
      <button onClick={() => navigate('?node=other')}>Other</button>
    </>
  );
}

beforeEach(() => {
  mocks.initialized = false;
  mocks.fitView.mockClear();
});

it('waits for measured nodes, selects the decoded ID and preserves unsaved edits', async () => {
  const view = render(
    <MemoryRouter initialEntries={[`/resources/42/flows?node=${encodeURIComponent(id)}`]}>
      <Host />
    </MemoryRouter>,
  );
  expect(mocks.fitView).not.toHaveBeenCalled();
  mocks.initialized = true;
  view.rerender(
    <MemoryRouter>
      <Host />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mocks.fitView).toHaveBeenCalledWith({ nodes: [{ id }], duration: 300, maxZoom: 1 }));
  expect(JSON.parse(screen.getByRole('status').textContent ?? '')).toEqual(
    initial.map((node) => ({ ...node, selected: node.id === id })),
  );
  fireEvent.click(screen.getByText('Deselect'));
  expect(mocks.fitView).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Other'));
  expect(mocks.fitView).toHaveBeenLastCalledWith({ nodes: [{ id: 'other' }], duration: 300, maxZoom: 1 });
});

it.each(['', '?node=missing', '?node='])('ignores missing or unknown query targets: %s', (search) => {
  mocks.initialized = true;
  render(
    <MemoryRouter initialEntries={[`/resources/42/flows${search}`]}>
      <Host />
    </MemoryRouter>,
  );
  expect(mocks.fitView).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByRole('status').textContent ?? '')).toEqual(initial);
});
