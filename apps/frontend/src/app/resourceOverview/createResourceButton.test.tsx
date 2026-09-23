import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateResourceButton } from './createResourceButton';

const state = vi.hoisted(() => ({ permissions: ['resources.create'], open: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('./createResourceDrawer', () => ({
  CreateResourceDrawer: () => <button onClick={state.open}>Create resource</button>,
}));

describe('CreateResourceButton permission', () => {
  beforeEach(() => {
    state.permissions = ['resources.create'];
    state.open.mockClear();
  });

  it('allows create-only roles to open creation', () => {
    render(<CreateResourceButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));
    expect(state.open).toHaveBeenCalledOnce();
  });

  it('does not offer creation to update-only roles', () => {
    state.permissions = ['resources.update'];
    render(<CreateResourceButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
