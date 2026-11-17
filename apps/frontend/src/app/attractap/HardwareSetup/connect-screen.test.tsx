import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectScreen } from '.';

vi.mock('../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ connectToDevice: vi.fn() }) },
}));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'serial');
});

it('explains why it cannot connect in a browser without Web Serial', () => {
  render(<ConnectScreen />);
  const button = screen.getByRole('button', { name: 'Connect via USB' });
  expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true);
  expect(button.getAttribute('aria-describedby')).toBe('connect-unsupported');
  expect(screen.getByText(/does not support Web Serial/)).toBeTruthy();
});

it('offers the connect button when Web Serial is available', () => {
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
  render(<ConnectScreen />);
  const button = screen.getByRole('button', { name: 'Connect via USB' });
  expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(false);
  expect(screen.queryByText(/does not support Web Serial/)).toBeNull();
});
