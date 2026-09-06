import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLogType,
  type ResourceFlowLog,
  type ResourceFlowNodeSchemaDto,
} from '@attraccess/react-query-client';
import type { NodeProps } from '@xyflow/react';
import { AttraccessNode } from './index';
import { useNodePreviewRows } from './preview';

const flowContext = vi.hoisted(() => ({
  addLiveLogReceiver: vi.fn<(receiver: (log: ResourceFlowLog) => void) => void>(),
  removeLiveLogReceiver: vi.fn(),
  removeNode: vi.fn(),
}));

vi.mock('../flowContext', () => ({
  useFlowContext: () => flowContext,
}));

vi.mock('./editor', () => ({
  NodeEditor: ({ children }: { children: (openEditor: () => void) => React.ReactNode }) => children(vi.fn()),
}));

vi.mock('./preview', () => ({
  useNodePreviewRows: vi.fn(() => []),
}));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();

  return {
    ...actual,
    Handle: () => null,
    NodeToolbar: ({ children }: { children: React.ReactNode }) => children,
    useNodeId: () => 'node-1',
  };
});

const tStub: TFunction = ((key: string) => {
  if (key === 'nodes.input.event.title') return 'Resource was active';
  if (key === 'nodes.input.event.description') return 'Use to display Attraccess.';
  return key;
}) as TFunction;

const schema: ResourceFlowNodeSchemaDto = {
  type: 'input.event',
  inputs: [],
  outputs: ['out'],
  isInput: true,
  isOutput: false,
  supportedByResource: true,
  configSchema: { properties: {} },
};

const selectedNode: NodeProps = {
  id: 'node-1',
  type: schema.type,
  data: {},
  selected: true,
  dragging: false,
  draggable: true,
  selectable: true,
  deletable: true,
  isConnectable: true,
  zIndex: 0,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};

describe('AttraccessNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the description on nodes without configuration', () => {
    render(<AttraccessNode schema={schema} tNodeTranslations={tStub} tNodeExists={() => true} />);

    expect(screen.getByText('Use to display Attraccess.')).toHaveClass('text-muted');
  });

  it('uses semantic surfaces and muted labels for node previews', () => {
    vi.mocked(useNodePreviewRows).mockReturnValueOnce([
      { label: 'Timeout', value: '30 seconds' },
      { label: 'Variables', entries: [{ fields: [{ label: 'Key', value: 'status' }] }] },
    ]);

    const { container } = render(<AttraccessNode schema={schema} tNodeTranslations={tStub} />);
    const card = container.querySelector('.card');

    expect(card).toHaveClass('bg-surface', 'border-border');
    expect(card?.querySelector('.rounded-full')).toHaveClass('bg-muted');
    expect(screen.getByText('Timeout')).toHaveClass('text-muted');
    expect(screen.getByText('Variables')).toHaveClass('text-muted');
    expect(screen.getByText('Key')).toHaveClass('text-muted');
    expect(screen.getByText('Key').closest('.border')).toHaveClass('border-border');
    expect(screen.getByText('30 seconds')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('uses the brand accent only while an idle node is selected', () => {
    const { container, rerender } = render(
      <AttraccessNode schema={schema} tNodeTranslations={tStub} node={selectedNode} />,
    );
    const card = container.querySelector('.card');

    expect(card).toHaveClass('border-accent', 'ring-2', 'ring-accent/30');

    rerender(<AttraccessNode schema={schema} tNodeTranslations={tStub} />);

    expect(card).toHaveClass('border-border');
    expect(card).not.toHaveClass('border-accent', 'ring-2');
  });

  it.each([
    [ResourceFlowLogType.NODE_PROCESSING_STARTED, 'border-accent', 'bg-accent'],
    [ResourceFlowLogType.NODE_PROCESSING_COMPLETED, 'border-green-500', 'bg-green-500'],
    [ResourceFlowLogType.NODE_PROCESSING_FAILED, 'border-red-500', 'bg-red-500'],
  ])('uses the appropriate border and indicator for %s', (type, border, background) => {
    const { container } = render(<AttraccessNode schema={schema} tNodeTranslations={tStub} node={selectedNode} />);
    const [receiveLog] = flowContext.addLiveLogReceiver.mock.calls[0];

    act(() =>
      receiveLog({
        id: 1,
        nodeId: 'node-1',
        flowRunId: 'run-1',
        resourceId: 1,
        type,
        createdAt: '2026-09-06T12:00:00Z',
      }),
    );

    const card = container.querySelector('.card');
    const indicator = card?.querySelector('.rounded-full');
    expect(card).toHaveClass(border);
    expect(card).not.toHaveClass('ring-2');
    expect(indicator).toHaveClass(background);
    expect(card?.classList.contains('animate-pulse')).toBe(type === ResourceFlowLogType.NODE_PROCESSING_STARTED);
    expect(indicator?.classList.contains('animate-pulse')).toBe(type === ResourceFlowLogType.NODE_PROCESSING_STARTED);
  });

  it('keeps validation warnings distinct from the selection accent', () => {
    const { container } = render(
      <AttraccessNode schema={schema} tNodeTranslations={tStub} node={selectedNode} validationError="Invalid node" />,
    );

    expect(container.querySelector('.card')).toHaveClass('border-warning');
    expect(container.querySelector('.card')).not.toHaveClass('border-accent');
    expect(screen.getByText('Invalid node')).toHaveClass('text-danger');
  });
});
