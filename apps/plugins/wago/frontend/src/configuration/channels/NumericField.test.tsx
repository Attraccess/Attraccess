import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NumericField } from './NumericField';

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reports typed text as a number', () => {
  const onChange = vi.fn();
  render(<NumericField label="Timeout" value={5} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Timeout'), { target: { value: '12' } });
  expect(onChange).toHaveBeenCalledWith(12);
  expect(typeof onChange.mock.calls[0][0]).toBe('number');
});

it('reports a cleared input as NaN so the form can flag it', () => {
  const onChange = vi.fn();
  render(<NumericField label="Timeout" value={5} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Timeout'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toBeNaN();
});

it('shows the label and an empty input for a value that is not a finite number', () => {
  render(<NumericField label="Timeout" value={NaN} onChange={vi.fn()} />);
  expect((screen.getByLabelText('Timeout') as HTMLInputElement).value).toBe('');
});

it('shows a finite value', () => {
  render(<NumericField label="Timeout" value={5} onChange={vi.fn()} />);
  expect((screen.getByLabelText('Timeout') as HTMLInputElement).value).toBe('5');
});

it('steps by whole numbers unless decimals are allowed', () => {
  const { rerender } = render(<NumericField label="Timeout" value={5} onChange={vi.fn()} />);
  expect(screen.getByLabelText('Timeout').getAttribute('step')).toBe('1');
  rerender(<NumericField label="Timeout" value={5} onChange={vi.fn()} integer={false} />);
  expect(screen.getByLabelText('Timeout').getAttribute('step')).toBe('any');
});
