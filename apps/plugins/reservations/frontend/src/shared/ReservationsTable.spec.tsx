import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationsApiError } from '../api';
import { reservationFixture } from '../test-utils';
import type { Reservation } from '../lib/types';
import { ReservationsTable } from './ReservationsTable';

afterEach(cleanup);

const renderTable = (props: Partial<Parameters<typeof ReservationsTable>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ReservationsTable items={[]} timezone="UTC" ariaLabel="Bookings" onAction={vi.fn()} {...props} />
    </MemoryRouter>,
  );

describe('ReservationsTable', () => {
  it('shows a spinner, not the empty state, while loading', () => {
    renderTable({ isPending: true });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('No bookings')).not.toBeInTheDocument();
  });

  it('shows the error with a retry button instead of an empty list', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({ error: new ReservationsApiError('boom', 500), onRetry });
    expect(screen.getByText('Bookings could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No bookings')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the empty state only when loaded and empty', () => {
    renderTable();
    expect(screen.getByText('No bookings')).toBeInTheDocument();
  });

  it('offers the actions the API allows and shows why a booking was rejected', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const rejected = reservationFixture({
      id: 8,
      status: 'rejected',
      decisionReason: 'Machine is broken',
      canCancel: false,
      canKeep: false,
    }) as unknown as Reservation;
    const open = reservationFixture({ canKeep: false, canDecide: true }) as unknown as Reservation;
    renderTable({ items: [open, rejected], onAction });
    expect(screen.getByText('Reason: Machine is broken')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onAction).toHaveBeenCalledWith('approve', open);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
