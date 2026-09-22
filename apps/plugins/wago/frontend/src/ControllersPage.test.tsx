import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllersPage } from './ControllersPage';

const state = vi.hoisted(() => ({ navigate: vi.fn(), refetch: vi.fn(), pending: false, error: null as Error | null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('./queries', () => ({
  useControllersQuery: () => ({
    data: [],
    isPending: state.pending,
    isFetching: false,
    isError: !!state.error,
    error: state.error,
    refetch: state.refetch,
  }),
  useCommissioningSessionsQuery: () => ({ data: [] }),
}));
vi.mock('./ControllersTable', () => ({
  ControllersTable: ({ onConfigure }: { onConfigure: (id: number) => void }) => (
    <button onClick={() => onConfigure(7)}>Configure fixture controller</button>
  ),
}));
vi.mock('./ClaimControllerModal', () => ({ ClaimControllerModal: () => null }));
vi.mock('./RemoveControllerDrawer', () => ({ RemoveControllerDrawer: () => null }));
vi.mock('./CommissioningModal', () => ({
  CommissioningModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <p>Commissioning dialog</p> : null),
}));
vi.mock('./MqttSettingsModal', () => ({
  MqttSettingsModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <p>MQTT settings dialog</p> : null),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.pending = false;
  state.error = null;
});
afterEach(cleanup);
it('opens configuration routes and keeps commissioning, settings, and refresh actions connected', () => {
  render(<ControllersPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Configure fixture controller' }));
  expect(state.navigate).toHaveBeenCalledWith('/wago/controllers/7/configuration');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Commission controller' }));
  expect(screen.getByText('Commissioning dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByText('MQTT settings dialog')).toBeTruthy();
});
it('shows loading and errors without inventing controller rows', () => {
  state.pending = true;
  const { rerender } = render(<ControllersPage />);
  expect(screen.queryByRole('button', { name: 'Configure fixture controller' })).toBeNull();
  state.pending = false;
  state.error = new Error('Controller list unavailable');
  rerender(<ControllersPage />);
  expect(screen.getByText('Could not load WAGO controllers')).toBeTruthy();
  expect(screen.getByText('Controller list unavailable')).toBeTruthy();
});
