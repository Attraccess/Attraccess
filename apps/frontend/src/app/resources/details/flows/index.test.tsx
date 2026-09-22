import { useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Node, Edge } from '@xyflow/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FlowsPage from './index';
const state = vi.hoisted(() => ({
  original: undefined as
    undefined | { nodes: Node[]; edges: Edge[]; validationErrors?: { nodeId: string; message: string }[] },
  fetching: false,
  failed: false,
  save: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
  refresh: vi.fn(),
  fit: vi.fn(),
  add: vi.fn(),
  copy: vi.fn(),
  cut: vi.fn(),
  paste: vi.fn(),
  receive: vi.fn(),
  remove: vi.fn(),
  validation: vi.fn(),
  imported: vi.fn(),
  exported: vi.fn(),
  confetti: vi.fn(),
  nodes: [] as Node[],
  edges: [] as Edge[],
  setNodes: undefined as unknown as Dispatch<SetStateAction<Node[]>>,
  setEdges: undefined as unknown as Dispatch<SetStateAction<Edge[]>>,
  options: {} as { onSuccess: () => void; onError: (e: unknown) => void },
  flowProps: {} as {
    nodes: Node[];
    edges: Edge[];
    panOnDrag: unknown;
    selectionOnDrag: boolean;
    onDrop: (e: unknown) => void;
  },
  live: undefined as undefined | ((log: { type: string }) => void),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@attraccess/ui', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../../../../stores/ptr.store', () => ({ usePtrStore: () => ({ setPullToRefreshIsEnabled: state.refresh }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => ({ apiError: state.error }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceFlowsServiceGetResourceFlow: () => ({
    data: state.original,
    isFetching: state.fetching,
    isError: state.failed,
  }),
  UseResourceFlowsServiceGetResourceFlowKeyFn: ({ resourceId }: { resourceId: number }) => ['flow', resourceId],
  useResourceFlowsServiceSaveResourceFlow: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.save };
  },
}));
vi.mock('js-confetti', () => ({
  default: class {
    addConfetti = state.confetti;
  },
}));
vi.mock('@xyflow/react', () => ({
  BackgroundVariant: { Dots: 'dots' },
  SelectionMode: { Partial: 'partial' },
  useReactFlow: () => ({
    fitView: state.fit,
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 10, y: y - 20 }),
  }),
  ReactFlow: ({ children, ...props }: typeof state.flowProps & { children: ReactNode }) => {
    state.flowProps = props;
    return <div data-testid="canvas">{children}</div>;
  },
  Panel: ({ children }: { children: ReactNode }) => children,
  Controls: () => null,
  Background: () => null,
}));
vi.mock('./flowContext', () => ({
  FlowProvider: ({ children }: { children: ReactNode }) => children,
  useFlowContext: () => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    Object.assign(state, { nodes, edges, setNodes, setEdges });
    return {
      nodes,
      edges,
      setNodes,
      setEdges,
      addNode: state.add,
      copySelectedNodes: state.copy,
      cutSelectedNodes: state.cut,
      pasteNodes: state.paste,
      addLiveLogReceiver: state.receive,
      removeLiveLogReceiver: state.remove,
      setValidationErrors: state.validation,
      flowNodeTypes: {},
    };
  },
}));
vi.mock('./flowImportExport', () => ({
  useFlowImportExport: () => ({ handleImportClick: state.imported, handleExport: state.exported }),
}));
vi.mock('./nodeCatalog', () => ({
  NodeCatalogPanel: ({ onSelect }: { onSelect: (type: string) => void }) => (
    <button onClick={() => onSelect('trigger')}>Insert trigger</button>
  ),
}));
vi.mock('./edgeWithDeleteButton', () => ({ EdgeWithDeleteButton: () => null }));
vi.mock('./FlowNodeQuerySelection', () => ({ FlowNodeQuerySelection: () => null }));
vi.mock('./logViewer', () => ({
  LogViewer: ({ children }: { children: (open: () => void) => ReactNode }) => children(vi.fn()),
}));
vi.mock('./variablesModal', () => ({
  VariablesModal: ({ children }: { children: (open: () => void) => ReactNode }) => children(vi.fn()),
}));
function show() {
  return render(
    <MemoryRouter initialEntries={['/resources/7/flows']}>
      <Routes>
        <Route path="/resources/:id/flows" element={<FlowsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
function saveButton() {
  return document.querySelector('svg.lucide-save')?.closest('button') as HTMLButtonElement;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.original = {
    nodes: [
      { id: 'one', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      { id: 'two', type: 'action', position: { x: 100, y: 200 }, data: {} },
    ],
    edges: [{ id: 'edge', source: 'one', target: 'two' }],
  };
  state.fetching = false;
  state.failed = false;
  state.receive.mockImplementation((listener: typeof state.live) => {
    state.live = listener;
  });
});
afterEach(cleanup);
it('loads saved nodes and validation, disables saving unchanged graphs and restores pull-to-refresh on unmount', () => {
  state.original!.validationErrors = [{ nodeId: 'one', message: 'Missing config' }];
  const view = show();
  expect(state.nodes).toEqual(state.original?.nodes);
  expect(state.validation).toHaveBeenCalledWith([{ nodeId: 'one', message: 'Missing config' }]);
  expect(saveButton()).toBeDisabled();
  expect(state.refresh).toHaveBeenCalledWith(false);
  view.unmount();
  expect(state.refresh).toHaveBeenLastCalledWith(true);
  expect(state.remove).toHaveBeenCalledWith(state.live);
});
it.each(['type', 'position', 'data', 'identity', 'count'] as const)(
  'detects changed node %s and saves the graph',
  (change) => {
    show();
    act(() =>
      state.setNodes((previous) =>
        change === 'count'
          ? previous.slice(1)
          : previous.map((node, index) =>
              index
                ? node
                : {
                    ...node,
                    ...(change === 'type'
                      ? { type: 'other' }
                      : change === 'position'
                        ? { position: { x: 30, y: 10 } }
                        : change === 'data'
                          ? { data: { value: true } }
                          : { id: 'new' }),
                  },
            ),
      ),
    );
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(state.save).toHaveBeenCalledWith({ resourceId: 7, requestBody: { nodes: state.nodes, edges: state.edges } });
    act(() => state.options.onSuccess());
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['flow', 7] });
  },
);
it.each(['source', 'target', 'identity', 'count'] as const)('detects changed edge %s', (change) => {
  show();
  act(() =>
    state.setEdges((previous) =>
      change === 'count'
        ? []
        : previous.map((edge) => ({
            ...edge,
            ...(change === 'source' ? { source: 'two' } : change === 'target' ? { target: 'one' } : { id: 'other' }),
          })),
    ),
  );
  expect(saveButton()).toBeEnabled();
});
it('supports keyboard copy/cut/paste/select-all without hijacking text inputs', () => {
  show();
  fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
  fireEvent.keyDown(document.body, { key: 'x', metaKey: true });
  fireEvent.mouseMove(screen.getByTestId('canvas'), { clientX: 200, clientY: 300 });
  fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
  expect(state.copy).toHaveBeenCalledOnce();
  expect(state.cut).toHaveBeenCalledOnce();
  expect(state.paste).toHaveBeenCalledWith({ x: 190, y: 280 });
  fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
  expect(state.nodes.every((node) => node.selected)).toBe(true);
  const input = document.createElement('input');
  document.body.append(input);
  fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
  expect(state.copy).toHaveBeenCalledOnce();
  input.remove();
});
it('adds catalog and dropped nodes, switches canvas mode and lays out the graph', () => {
  show();
  fireEvent.click(screen.getByText('Insert trigger'));
  expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'trigger', position: { x: 400, y: 0 } }));
  act(() =>
    state.flowProps.onDrop({
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => 'action' },
      clientX: 50,
      clientY: 100,
    }),
  );
  expect(state.add).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'action', position: { x: 40, y: 80 }, data: { __centerOnDrop: true } }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.modePan' }));
  expect(state.flowProps.panOnDrag).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'actions.modeSelect' }));
  expect(state.flowProps.selectionOnDrag).toBe(true);
  fireEvent.click(document.querySelector('svg.lucide-layout-grid')?.closest('button') as HTMLButtonElement);
  expect(state.fit).toHaveBeenCalled();
  expect(state.nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
});
it('animates running flows and distinguishes failed completion feedback', () => {
  show();
  act(() => state.live?.({ type: 'flow.start' }));
  expect(state.flowProps.edges[0].animated).toBe(true);
  act(() => state.live?.({ type: 'flow.completed' }));
  expect(state.flowProps.edges[0].animated).toBe(false);
  expect(state.confetti).toHaveBeenCalledWith();
  act(() => {
    state.live?.({ type: 'flow.start' });
    state.live?.({ type: 'node.processing.failed' });
  });
  act(() => state.live?.({ type: 'flow.completed' }));
  expect(state.confetti).toHaveBeenLastCalledWith(expect.objectContaining({ confettiNumber: 2 }));
});
it('shows loading and errors and routes import/export actions', () => {
  state.original = undefined;
  state.fetching = true;
  const view = show();
  expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'actions.import' })).toBeDisabled();
  view.unmount();
  state.fetching = false;
  state.failed = true;
  show();
  expect(screen.getByRole('alert', { name: 'loadError' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.import' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.export' }));
  expect(state.imported).toHaveBeenCalledOnce();
  expect(state.exported).toHaveBeenCalledOnce();
  const error = new Error('Denied');
  act(() => state.options.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
});
