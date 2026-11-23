import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDurationEstimateDialog } from '.';

afterEach(cleanup);

const setup = (maxMinutes: number | null) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<SessionDurationEstimateDialog isOpen maxMinutes={maxMinutes} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
};

describe('SessionDurationEstimateDialog', () => {
  it('shows the hint and confirms the default hour', () => {
    const { onConfirm } = setup(null);
    expect(screen.getByText(/stop automatically after this time at the latest/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start'));
    expect(onConfirm).toHaveBeenCalledWith(60);
  });

  it('fills the inputs from a quick pick', () => {
    const { onConfirm } = setup(null);
    fireEvent.click(screen.getByText('4h 0m'));
    fireEvent.click(screen.getByText('Start'));
    expect(onConfirm).toHaveBeenCalledWith(240);
  });

  it('hides quick picks above the maximum and shows the maximum', () => {
    setup(120);
    expect(screen.getByText(/maximum session time of this machine is 2h 0m/i)).toBeInTheDocument();
    expect(screen.queryByText('4h 0m')).not.toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
  });

  it('blocks a value above the maximum', () => {
    const { onConfirm } = setup(90);
    fireEvent.change(screen.getByRole('spinbutton', { name: /hours/i }), { target: { value: '2' } });
    expect(screen.getByText(/cannot be longer than 1h 30m/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /hours/i })).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByText('Start'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('opens at the maximum when it is shorter than an hour, so the first value is valid', () => {
    const { onConfirm } = setup(45);
    expect(screen.getByRole('spinbutton', { name: /hours/i })).toHaveValue(0);
    expect(screen.getByRole('spinbutton', { name: /minutes/i })).toHaveValue(45);
    expect(screen.queryByText(/cannot be longer/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Start'));
    expect(onConfirm).toHaveBeenCalledWith(45);
  });
});
