import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConfigurationImpact } from '../api/client';
import { ImpactWarning } from './ImpactWarning';

const message = 'Channel removed. Existing flow references may fail.';
const impact = (references: ConfigurationImpact['references'], channelId = 'output'): ConfigurationImpact => ({
  channelId,
  message,
  references,
});
const globalReference: ConfigurationImpact['references'][number] = {
  resourceId: null,
  flowId: 12,
  flowName: 'Night shift',
  nodeId: 'node-9',
  nodeType: 'plugin.wago.command',
};

function renderWarning(impacts: ConfigurationImpact[], names: Record<string, string> = {}, onChange = vi.fn()) {
  return render(<ImpactWarning impacts={impacts} names={names} acknowledged={false} onChange={onChange} />);
}

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('names the global flow that references the channel', () => {
  renderWarning([impact([globalReference])]);
  expect(screen.getByText('Global flow "Night shift", node node-9 (plugin.wago.command)')).toBeTruthy();
});

it('falls back to the flow id for an unnamed global flow', () => {
  renderWarning([impact([{ ...globalReference, flowName: null }])]);
  expect(screen.getByText('Global flow "#12", node node-9 (plugin.wago.command)')).toBeTruthy();
});

it('names the resource that references the channel', () => {
  renderWarning([impact([{ resourceId: 4, flowId: null, nodeId: 'node-1', nodeType: 'plugin.wago.command' }])]);
  expect(screen.getByText('Resource 4, node node-1 (plugin.wago.command)')).toBeTruthy();
});

it('says so when no saved flow node references the channel', () => {
  renderWarning([impact([])]);
  expect(screen.getByText('No saved WAGO flow nodes reference this channel.')).toBeTruthy();
});

it('labels the channel with its name, or its id when it has none', () => {
  renderWarning([impact([], 'output'), impact([], 'output2')], { output: 'Laser power' });
  expect(screen.getByText(/Laser power:/)).toBeTruthy();
  expect(screen.getByText(/output2:/)).toBeTruthy();
});

it('renders nothing without impacts', () => {
  const { container } = renderWarning([]);
  expect(container.innerHTML).toBe('');
});

it('reports the acknowledgement', () => {
  const onChange = vi.fn();
  renderWarning([impact([])], {}, onChange);
  fireEvent.click(screen.getByRole('checkbox', { name: /I checked the affected channel references/ }));
  expect(onChange).toHaveBeenCalledWith(true);
});
