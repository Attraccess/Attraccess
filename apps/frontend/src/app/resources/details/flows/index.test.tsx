import { useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Node, Edge } from '@xyflow/react';
import { afterEach, beforeEach, vi } from 'vitest';
import FlowsPage from './index';
import { registerLoadsSavedNodesAndValidationDisablesSavingUnchangedGraphsAndRestoresPullToRefreshOnUn } from './index.test-cases';
import { registerDetectsChangedNodeSAndSavesTheGraph } from './index.test-cases';
import { registerDetectsChangedEdgeS } from './index.test-cases';
import { registerSupportsKeyboardCopyCutPasteSelectAllWithoutHijackingTextInputs } from './index.test-cases';
import { registerAddsCatalogAndDroppedNodesSwitchesCanvasModeAndLaysOutTheGraph } from './index.test-cases';
import { registerAutoAlignsUsingMeasuredHandlesAndPreservesPositionsDataAndConnectionsThroughSaveAndRel } from './index.test-cases';
import { registerKeepsConfettiOffUntilEnabledDistinguishesFailuresAndClearsAnimationsWhenDisabled } from './index.test-cases';
import { registerShowsLoadingAndErrorsAndRoutesImportExportActions } from './index.test-cases';

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
  internalNode: vi.fn(),
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
  createConfetti: vi.fn(),
  clearConfetti: vi.fn(),
  destroyConfetti: vi.fn(),
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
    constructor() {
      state.createConfetti();
    }
    addConfetti = state.confetti;
    clearCanvas = state.clearConfetti;
    destroyCanvas = state.destroyConfetti;
  },
}));
vi.mock('@xyflow/react', () => ({
  BackgroundVariant: { Dots: 'dots' },
  SelectionMode: { Partial: 'partial' },
  useReactFlow: () => ({
    fitView: state.fit,
    getInternalNode: state.internalNode,
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
  LogViewer: ({
    children,
    confettiEnabled,
    onConfettiEnabledChange,
  }: {
    children: (open: () => void) => ReactNode;
    confettiEnabled: boolean;
    onConfettiEnabledChange: (enabled: boolean) => void;
  }) => (
    <>
      {children(vi.fn())}
      <input
        type="checkbox"
        aria-label="Confetti"
        checked={confettiEnabled}
        onChange={(event) => onConfettiEnabledChange(event.target.checked)}
      />
    </>
  ),
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
  state.internalNode.mockReset();
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
defineRootTestRegistrationsTests();

export function defineRootTestRegistrationsTests() {
  const scope = {
    get state() {
      return state;
    },
    show,
    saveButton,
  };

  registerLoadsSavedNodesAndValidationDisablesSavingUnchangedGraphsAndRestoresPullToRefreshOnUn(scope);

  registerDetectsChangedNodeSAndSavesTheGraph(scope);

  registerDetectsChangedEdgeS(scope);

  registerSupportsKeyboardCopyCutPasteSelectAllWithoutHijackingTextInputs(scope);

  registerAddsCatalogAndDroppedNodesSwitchesCanvasModeAndLaysOutTheGraph(scope);

  registerAutoAlignsUsingMeasuredHandlesAndPreservesPositionsDataAndConnectionsThroughSaveAndRel(scope);

  registerKeepsConfettiOffUntilEnabledDistinguishesFailuresAndClearsAnimationsWhenDisabled(scope);

  registerShowsLoadingAndErrorsAndRoutesImportExportActions(scope);

  return scope;
}

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
