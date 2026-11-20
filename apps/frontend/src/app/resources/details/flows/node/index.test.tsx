import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslations, useTranslationState, type TFunction } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLogType,
  type ResourceFlowLog,
  type ResourceFlowNodeSchemaDto,
} from '@attraccess/react-query-client';
import type { NodeProps } from '@xyflow/react';
import { AttraccessNode } from './index';
import { useNodePreviewRows, type NodePreviewData } from './preview';
import type { NodeValidationError } from './validationMessages';
import nodesDe from './de.json';
import nodesEn from './en.json';

const flowContext = vi.hoisted(() => ({
  addLiveLogReceiver: vi.fn<(receiver: (log: ResourceFlowLog) => void) => void>(),
  removeLiveLogReceiver: vi.fn(),
  removeNode: vi.fn(),
  owner: { kind: 'resource', resourceId: 1 } as
    { kind: 'resource'; resourceId: number } | { kind: 'global'; flowId: number },
  resourceId: 1 as number | undefined,
}));

vi.mock('../context/flowContext', () => ({
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
  supportedFlowScopes: ['resource', 'global'],
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
  beforeEach(() => {
    vi.clearAllMocks();
    flowContext.owner = { kind: 'resource', resourceId: 1 };
    flowContext.resourceId = 1;
  });

  it('names the reason a node is unsupported by the kind of flow', () => {
    const resourceOnly = { ...schema, supportedFlowScopes: ['resource'] } as ResourceFlowNodeSchemaDto;
    flowContext.owner = { kind: 'global', flowId: 3 };
    flowContext.resourceId = undefined;
    const { rerender } = render(<AttraccessNode schema={resourceOnly} tNodeTranslations={tStub} />);

    expect(screen.getByText('nodes.unsupportedInGlobalFlow')).toBeInTheDocument();
    expect(screen.queryByText('nodes.unsupportedForResourceType')).not.toBeInTheDocument();

    flowContext.owner = { kind: 'resource', resourceId: 1 };
    flowContext.resourceId = 1;
    rerender(<AttraccessNode schema={{ ...schema, supportedByResource: false }} tNodeTranslations={tStub} />);

    expect(screen.getByText('nodes.unsupportedForResourceType')).toBeInTheDocument();
  });

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

  it('renders preview rows and entry fields with repeated labels without duplicate keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let rows: NodePreviewData = [
      { label: 'Meter', value: 'Main meter' },
      { label: 'Meter', value: 'Spare meter' },
      {
        label: 'Variables',
        entries: [
          {
            fields: [
              { label: 'Key', value: 'first' },
              { label: 'Key', value: 'second' },
            ],
          },
        ],
      },
    ];
    vi.mocked(useNodePreviewRows).mockImplementation(() => rows);

    try {
      const { rerender } = render(<AttraccessNode schema={schema} tNodeTranslations={tStub} />);

      expect(screen.getAllByText('Meter')).toHaveLength(2);
      expect(screen.getByText('Main meter')).toBeInTheDocument();
      expect(screen.getByText('Spare meter')).toBeInTheDocument();
      expect(screen.getAllByText('Key')).toHaveLength(2);
      expect(screen.getByText('first')).toBeInTheDocument();
      expect(screen.getByText('second')).toBeInTheDocument();

      rows = [
        { label: 'Meter', value: 'Spare meter' },
        { label: 'Variables', entries: [{ fields: [{ label: 'Key', value: 'second' }] }] },
      ];
      rerender(<AttraccessNode schema={schema} tNodeTranslations={tStub} />);

      expect(screen.getAllByText('Meter')).toHaveLength(1);
      expect(screen.queryByText('Main meter')).not.toBeInTheDocument();
      expect(screen.getByText('Spare meter')).toBeInTheDocument();
      expect(screen.getAllByText('Key')).toHaveLength(1);
      expect(screen.queryByText('first')).not.toBeInTheDocument();
      expect(screen.getByText('second')).toBeInTheDocument();

      const duplicateKeyErrors = consoleError.mock.calls.filter((args) =>
        args.some((arg) => typeof arg === 'string' && arg.includes('same key')),
      );
      expect(duplicateKeyErrors).toEqual([]);
    } finally {
      consoleError.mockRestore();
      vi.mocked(useNodePreviewRows).mockImplementation(() => []);
    }
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

  it('uses plugin handle names without requesting missing core translations', () => {
    const translate = vi.fn(tStub);
    render(
      <AttraccessNode
        schema={{
          ...schema,
          type: 'plugin.example.command',
          label: 'Example command',
          inputs: ['input'],
          outputs: ['output', 'failure'],
        }}
        tNodeTranslations={translate}
        tNodeExists={() => false}
      />,
    );
    expect(translate).not.toHaveBeenCalledWith('nodes.plugin.example.command.inputs.input');
    expect(translate).not.toHaveBeenCalledWith('nodes.plugin.example.command.outputs.failure');
    expect(screen.getByText('Example command')).toBeInTheDocument();
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
        flowId: null,
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
      <AttraccessNode
        schema={schema}
        tNodeTranslations={tStub}
        node={selectedNode}
        validationErrors={[{ field: 'data', code: 'invalid', message: 'Invalid node' }]}
      />,
    );

    expect(container.querySelector('.card')).toHaveClass('border-warning');
    expect(container.querySelector('.card')).not.toHaveClass('border-accent');
    expect(screen.getByText('Invalid node').parentElement).toHaveClass('text-danger');
  });
});

it('retains translated input and output handle labels when tNodeExists is omitted', () => {
  const translate = vi.fn((key: string) => `Translated ${key}`);
  render(<AttraccessNode schema={{ ...schema, inputs: ['in'] }} tNodeTranslations={translate} />);
  expect(translate).toHaveBeenCalledWith('nodes.input.event.inputs.in');
  expect(translate).toHaveBeenCalledWith('nodes.input.event.outputs.out');
});

it('uses raw plugin handle names only for explicitly missing translations', () => {
  const translate = vi.fn((key: string) => key);
  render(
    <AttraccessNode schema={{ ...schema, inputs: ['in'] }} tNodeTranslations={translate} tNodeExists={() => false} />,
  );
  expect(translate).not.toHaveBeenCalledWith('nodes.input.event.inputs.in');
  expect(translate).not.toHaveBeenCalledWith('nodes.input.event.outputs.out');
});

describe('validation errors', () => {
  const meteringStart: ResourceFlowNodeSchemaDto = {
    ...schema,
    type: 'input.resource.metering.start',
    configSchema: { properties: { meterId: { type: 'number' }, timeoutSeconds: { type: 'number' } } },
  };
  const originalLanguage = useTranslationState.getState().language;
  afterEach(() => act(() => useTranslationState.getState().setLanguage(originalLanguage)));

  function TranslatedNode({ errors }: { errors: NodeValidationError[] }) {
    const { t, tExists } = useTranslations({ en: nodesEn, de: nodesDe });
    return (
      <AttraccessNode schema={meteringStart} tNodeTranslations={t} tNodeExists={tExists} validationErrors={errors} />
    );
  }

  it.each([
    ['en', 'Meter is missing'],
    ['de', 'Zähler fehlt'],
  ] as const)('names a missing field in the user language (%s)', (language, text) => {
    act(() => useTranslationState.getState().setLanguage(language));
    render(<TranslatedNode errors={[{ field: 'meterId', code: 'required', message: 'This field is required.' }]} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/This field is required/)).not.toBeInTheDocument();
  });

  it('shows one line per error, the field label before invalid messages and unlabelled messages as they are', () => {
    act(() => useTranslationState.getState().setLanguage('en'));
    render(
      <TranslatedNode
        errors={[
          { field: 'meterId', code: 'invalid', message: 'Choose a meter belonging to this resource' },
          { field: 'timeoutSeconds', message: 'Too big: expected number to be <=600' },
          { field: 'data', code: 'invalid', message: 'Invalid node configuration' },
        ]}
      />,
    );
    expect(screen.getByText('Meter: Choose a meter belonging to this resource')).toBeInTheDocument();
    expect(screen.getByText('Timeout (seconds): Too big: expected number to be <=600')).toBeInTheDocument();
    expect(screen.getByText('Invalid node configuration')).toBeInTheDocument();
  });

  it('keeps long unbroken messages within the card width', () => {
    const message = 'x'.repeat(300);
    render(
      <AttraccessNode schema={schema} tNodeTranslations={tStub} validationErrors={[{ field: 'data', message }]} />,
    );
    const text = screen.getByText(message);
    expect(text).toHaveClass('break-words', '[overflow-wrap:anywhere]', 'min-w-0');
    expect(text.parentElement).toHaveClass('w-64', 'items-start');
    expect(text.parentElement?.querySelector('svg')).toHaveClass('shrink-0');
  });

  it('shows no errors in previews', () => {
    render(
      <AttraccessNode
        schema={schema}
        tNodeTranslations={tStub}
        previewMode
        validationErrors={[{ field: 'data', message: 'Invalid node' }]}
      />,
    );
    expect(screen.queryByText('Invalid node')).not.toBeInTheDocument();
  });
});
