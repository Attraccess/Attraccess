import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import type { CommissioningSession, WagoController } from './api';

afterEach(cleanup);

it('keeps verification/recovery reachable while allowing a claimed controller to be configured', () => {
  const session = { id: 7, hardwareId: 'fixture', state: 'awaiting_verification' } as CommissioningSession;
  const controller = {
    id: 1,
    hardwareId: 'fixture',
    name: 'Fixture',
    trustState: 'claimed',
    connectivity: 'online',
  } as WagoController;
  const onResume = vi.fn();
  const onConfigure = vi.fn();
  const onDiagnostics = vi.fn();
  render(
    <ControllersTable
      controllers={[controller]}
      sessions={[session]}
      onResume={onResume}
      onConfigure={onConfigure}
      onDiagnostics={onDiagnostics}
      onClaim={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'View progress' }));
  expect(onResume).toHaveBeenCalledWith(session);
  fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
  expect(onConfigure).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
  expect(onDiagnostics).toHaveBeenCalledWith(1);
});
