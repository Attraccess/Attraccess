import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DonationPrompt } from './index';
import { recordUsefulAction } from './usefulAction';
import { TestWrapper } from '../../test-utils/wrappers';

const state = vi.hoisted(() => ({ userId: 1, hasPermission: () => true }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: state.userId },
    hasPermission: state.hasPermission,
    isAuthenticated: true,
    needsTwoFactorSetup: false,
  }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: () => ({ data: { isNonProfit: true } }),
}));
vi.mock('../standardDrawer', () => ({
  StandardDrawer: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@heroui/react')>();
  return {
    ...original,
    DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

function Journey() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={recordUsefulAction}>Create resource successfully</button>
      <button onClick={() => navigate('/resources/1')}>Resource details</button>
      <button onClick={() => navigate('/resources')}>Resource list</button>
      <DonationPrompt />
    </>
  );
}

describe('DonationPrompt timing', () => {
  beforeEach(() => {
    localStorage.clear();
    state.userId = 1;
  });

  it('waits for successful product use and a later return to the resource list', async () => {
    render(
      <MemoryRouter>
        <Journey />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Create resource successfully'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Resource details'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Resource list'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide for 1 month' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByText('Resource details'));
    await userEvent.click(screen.getByText('Resource list'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(Number(localStorage.getItem('donationPrompt:snoozedUntil'))).toBeGreaterThan(Date.now());
  });

  it('honors existing snooze on subsequent login', () => {
    localStorage.setItem('donationPrompt:usefulAction:1', 'true');
    localStorage.setItem('donationPrompt:snoozedUntil', String(Date.now() + 86400000));
    render(<DonationPrompt />, { wrapper: TestWrapper });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not treat another user’s useful action as first use', () => {
    localStorage.setItem('donationPrompt:usefulAction:2', 'true');
    render(<DonationPrompt />, { wrapper: TestWrapper });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
