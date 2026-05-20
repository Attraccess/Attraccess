// Tests for NodeCatalogPanel: desktop sidebar and mobile overlay behaviour
// FEATURE: Node catalog redesign — top-level panel tests
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { NodeCatalogPanel } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      title: 'Node catalog',
      empty: 'No nodes available.',
      'domains.manual': 'Manual',
      'domains.door': 'Door',
      'nodes.input.button.title': 'Button',
      'nodes.input.button.description': 'User-triggered start',
      'nodes.input.resource.door.locked.title': 'Door locked',
      'nodes.input.resource.door.locked.description': 'Fires on lock',
      toggleOpen: 'Open catalog',
      toggleClose: 'Close catalog',
      collapse: 'Collapse',
      expand: 'Expand',
    };
    const t = (key: string) => dict[key] ?? key;
    const tExists = (key: string) => key in dict;
    return { t, tExists };
  },
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@attraccess/react-query-client')>();
  return {
    ...actual,
    useResourceFlowsServiceGetNodeSchemas: () => ({
      data: [
        { type: 'input.button', inputs: [], outputs: ['out'], isOutput: false, supportedByResource: true, configSchema: {} },
        { type: 'input.resource.door.locked', inputs: [], outputs: ['out'], isOutput: false, supportedByResource: true, configSchema: {} },
      ],
    }),
  };
});

const tNodeTranslations = ((key: string) => {
  const dict: Record<string, string> = {
    'nodes.input.button.title': 'Button',
    'nodes.input.button.description': 'User-triggered start',
    'nodes.input.resource.door.locked.title': 'Door locked',
    'nodes.input.resource.door.locked.description': 'Fires on lock',
  };
  return dict[key] ?? key;
}) as unknown as TFunction;

describe('NodeCatalogPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders domain headers and node rows in desktop shell', () => {
    render(
      <NodeCatalogPanel resourceId={1} onSelect={vi.fn()} tNodeTranslations={tNodeTranslations} />,
      { wrapper: TestWrapper },
    );
    expect(screen.getAllByText('Manual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Door').length).toBeGreaterThan(0);
  });

  it('opens mobile overlay when toggle pressed and selects a node', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <NodeCatalogPanel resourceId={1} onSelect={onSelect} tNodeTranslations={tNodeTranslations} />,
      { wrapper: TestWrapper },
    );
    await user.click(screen.getByRole('button', { name: 'Open catalog' }));
    const buttons = screen.getAllByRole('button', { name: /Button/ });
    await user.click(buttons[buttons.length - 1]);
    expect(onSelect).toHaveBeenCalledWith('input.button');
  });
});
