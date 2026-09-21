import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateResourceButton } from './createResourceButton';

const state = vi.hoisted(() => ({ permissions: ['resources.create'], open: vi.fn(), navigate: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('../resources/editModal/resourceEditModal', () => ({
  ResourceEditModal: ({ children }: { children: (open: () => void) => React.ReactNode }) => children(state.open),
}));

describe('CreateResourceButton permission', () => {
  beforeEach(() => {
    state.permissions = ['resources.create'];
    state.open.mockClear();
  });

  it('allows create-only roles to open creation', () => {
    render(<CreateResourceButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Resource' }));
    expect(state.open).toHaveBeenCalledOnce();
  });

  it('does not offer creation to update-only roles', () => {
    state.permissions = ['resources.update'];
    render(<CreateResourceButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
