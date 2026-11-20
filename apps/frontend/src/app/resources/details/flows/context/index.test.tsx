import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FlowProvider, useFlowContext, type FlowContextType } from './index';

const state = vi.hoisted(() => ({
  schemas: undefined as undefined | { type: string; label: string }[],
  mounts: vi.fn(),
  rendered: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useGetOneResourceById: () => ({ data: undefined }),
  useGetNodeSchemas: () => ({ data: state.schemas, isLoading: false, isError: false }),
  useGetGlobalFlowNodeSchemas: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('../liveLogs', () => ({ useLiveLogs: () => ({ liveLogs: [] }) }));
vi.mock('../node/index', () => ({
  AttraccessNode: (props: { schema: { type: string }; validationError?: string; node: NodeProps }) => {
    state.rendered(props);
    useEffect(() => {
      state.mounts(props.node.id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- counts mounts only
    return (
      <div data-testid={`node-${props.node.id}`}>
        {props.schema.type}: {props.validationError ?? 'ok'}
      </div>
    );
  },
}));

let context: FlowContextType;

function Canvas() {
  context = useFlowContext();
  const NodeComponent = context.flowNodeTypes['trigger'];
  if (!NodeComponent) return null;
  const nodeProps = { id: 'one', type: 'trigger', data: {} } as unknown as NodeProps;
  return <NodeComponent {...nodeProps} />;
}

function show() {
  return render(
    <FlowProvider owner={{ kind: 'resource', resourceId: 7 }}>
      <Canvas />
    </FlowProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.schemas = [
    { type: 'trigger', label: 'Trigger' },
    { type: 'action', label: 'Action' },
  ];
});
afterEach(cleanup);

it('keeps every node type component identical across validation errors, node changes and re-renders', () => {
  const view = show();
  const first = context.flowNodeTypes;
  expect(Object.keys(first).sort()).toEqual(['action', 'trigger']);
  expect(first['trigger']).toBe(first['action']);

  act(() => context.setValidationErrors([{ nodeId: 'one', message: 'Missing config' }]));
  act(() => context.setNodes([{ id: 'one', type: 'trigger', position: { x: 0, y: 0 }, data: {} }]));
  act(() => context.setEdges([{ id: 'edge', source: 'one', target: 'one' }]));
  view.rerender(
    <FlowProvider owner={{ kind: 'resource', resourceId: 7 }}>
      <Canvas />
    </FlowProvider>,
  );

  expect(context.flowNodeTypes['trigger']).toBe(first['trigger']);
  expect(context.flowNodeTypes['action']).toBe(first['action']);
});

it('shows validation errors on the right node without remounting it', () => {
  show();
  expect(screen.getByTestId('node-one')).toHaveTextContent('trigger: ok');

  act(() =>
    context.setValidationErrors([
      { nodeId: 'one', message: 'Missing config.' },
      { nodeId: 'one', message: 'No server.' },
      { nodeId: 'two', message: 'Other node.' },
    ]),
  );
  expect(screen.getByTestId('node-one')).toHaveTextContent('trigger: Missing config. No server.');

  act(() => context.setValidationErrors([]));
  expect(screen.getByTestId('node-one')).toHaveTextContent('trigger: ok');
  expect(state.mounts).toHaveBeenCalledTimes(1);
});

it('has no node types until the schemas arrive', () => {
  state.schemas = undefined;
  show();
  expect(context.flowNodeTypes).toEqual({});
  expect(screen.queryByTestId('node-one')).toBeNull();
});
