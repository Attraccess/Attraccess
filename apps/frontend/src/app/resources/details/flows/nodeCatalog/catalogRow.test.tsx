import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogRow } from './catalogRow';
import type { CatalogNode } from './useNodeCatalog';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';

const tStub: TFunction = ((key: string) => {
  if (key === 'nodes.input.button.title') return 'Button';
  if (key === 'nodes.input.button.description') return 'User-triggered start';
  return key;
}) as unknown as TFunction;

const node: CatalogNode = {
  schema: {
    type: ResourceFlowNodeType.INPUT_BUTTON,
    inputs: [],
    outputs: ['out'],
    isOutput: false,
    isInput: true,
    supportedByResource: true,
    configSchema: {},
  },
  direction: 'down',
};

describe('CatalogRow', () => {
  it('renders name and description from i18n', () => {
    render(<CatalogRow node={node} tNodeTranslations={tStub} onSelect={vi.fn()} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.getByText('User-triggered start')).toBeInTheDocument();
  });

  it('renders a plugin-provided name and description without i18n', () => {
    const pluginNode: CatalogNode = {
      ...node,
      schema: {
        ...node.schema,
        type: 'plugin.example.action',
        label: 'Control device',
        description: 'Select a capability to control.',
      },
    };

    render(<CatalogRow node={pluginNode} tNodeTranslations={tStub} onSelect={vi.fn()} />);

    expect(screen.getByText('Control device')).toBeInTheDocument();
    expect(screen.getByText('Select a capability to control.')).toBeInTheDocument();
  });

  it('calls onSelect with node type on click', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CatalogRow node={node} tNodeTranslations={tStub} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /Button/ }));
    expect(onSelect).toHaveBeenCalledWith('input.button');
  });

  it('sets dataTransfer payload on drag start', () => {
    render(<CatalogRow node={node} tNodeTranslations={tStub} onSelect={vi.fn()} />);
    const row = screen.getByRole('button', { name: /Button/ });
    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('application/reactflow', 'input.button');
  });

  it('shows direction glyph for down/up/both', () => {
    const { rerender } = render(<CatalogRow node={node} tNodeTranslations={tStub} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('trigger')).toBeInTheDocument();
    rerender(<CatalogRow node={{ ...node, direction: 'up' }} tNodeTranslations={tStub} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('action')).toBeInTheDocument();
    rerender(<CatalogRow node={{ ...node, direction: 'both' }} tNodeTranslations={tStub} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('both')).toBeInTheDocument();
  });
});
