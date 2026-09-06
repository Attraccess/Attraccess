import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { AttraccessNode } from './index';

vi.mock('../flowContext', () => ({
  useFlowContext: () => ({
    addLiveLogReceiver: vi.fn(),
    removeLiveLogReceiver: vi.fn(),
    removeNode: vi.fn(),
  }),
}));

vi.mock('./editor', () => ({
  NodeEditor: ({ children }: { children: (openEditor: () => void) => React.ReactNode }) => children(vi.fn()),
}));

vi.mock('./preview', () => ({
  useNodePreviewRows: () => [],
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
  isOutput: false,
  isInput: false,
  supportedByResource: true,
  configSchema: { properties: {} },
};

describe('AttraccessNode', () => {
  it('shows the description on nodes without configuration', () => {
    render(<AttraccessNode schema={schema} tNodeTranslations={tStub} tNodeExists={() => true} />);

    expect(screen.getByText('Use to display Attraccess.')).toBeInTheDocument();
  });
});
