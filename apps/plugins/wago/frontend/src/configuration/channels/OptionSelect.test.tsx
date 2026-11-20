import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OptionSelect } from './OptionSelect';

const options = [
  { id: 'relay-1', label: 'Relay one' },
  { id: 'relay-2', label: 'Relay two' },
];

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reports the id of the chosen option', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<OptionSelect label="Output" value="relay-1" options={options} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /Output/ }));
  await user.click(await screen.findByRole('option', { name: 'Relay two' }));
  expect(onChange).toHaveBeenCalledWith('relay-2');
});

it('shows the placeholder while nothing is chosen', () => {
  render(<OptionSelect label="Output" value="" options={options} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Output/ }).textContent).toContain('Select…');
});

it('shows the label of the chosen option', () => {
  render(<OptionSelect label="Output" value="relay-2" options={options} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Output/ }).textContent).toContain('Relay two');
});
