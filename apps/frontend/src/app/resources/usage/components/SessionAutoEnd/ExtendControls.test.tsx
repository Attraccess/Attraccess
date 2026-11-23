import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtendControls } from './ExtendControls';

const start = '2026-01-01T10:00:00.000Z';
const at = (minutes: number) => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();

afterEach(cleanup);

describe('ExtendControls', () => {
  it('offers every step, and to-max when the machine has a maximum', () => {
    const onExtend = vi.fn();
    render(
      <ExtendControls
        session={{ startTime: start, autoEndAt: at(60), maxAutoEndAt: at(60 + 24 * 60) }}
        isPending={false}
        onExtend={onExtend}
      />,
    );
    fireEvent.click(screen.getByText('+2 h'));
    expect(onExtend).toHaveBeenCalledWith({ extendByMinutes: 120 });
    fireEvent.click(screen.getByText('Extend to maximum'));
    expect(onExtend).toHaveBeenCalledWith({ toMax: true });
  });

  it('disables the steps that would pass the maximum', () => {
    render(
      <ExtendControls
        session={{ startTime: start, autoEndAt: at(60), maxAutoEndAt: at(60 + 180) }}
        isPending={false}
        onExtend={vi.fn()}
      />,
    );
    expect(screen.getByText('+1 h').closest('button')).toBeEnabled();
    expect(screen.getByText('+2 h').closest('button')).toBeEnabled();
    expect(screen.getByText('+4 h').closest('button')).toBeDisabled();
    expect(screen.getByText('+24 h').closest('button')).toBeDisabled();
  });

  it('shows no buttons and a hint when the maximum is reached', () => {
    render(
      <ExtendControls
        session={{ startTime: start, autoEndAt: at(300), maxAutoEndAt: at(300) }}
        isPending={false}
        onExtend={vi.fn()}
      />,
    );
    expect(screen.queryByText('+1 h')).not.toBeInTheDocument();
    expect(screen.queryByText('Extend to maximum')).not.toBeInTheDocument();
    expect(screen.getByText(/maximum session time is reached/i)).toBeInTheDocument();
  });

  it('centers the buttons for centered cards', () => {
    render(
      <ExtendControls
        session={{ startTime: start, autoEndAt: at(60) }}
        isPending={false}
        onExtend={vi.fn()}
        centered
      />,
    );
    expect(screen.getByRole('group')).toHaveClass('justify-center');
  });

  it('has no to-max button on a machine without a maximum', () => {
    render(<ExtendControls session={{ startTime: start, autoEndAt: at(60) }} isPending={false} onExtend={vi.fn()} />);
    expect(screen.queryByText('Extend to maximum')).not.toBeInTheDocument();
    expect(screen.getByText('+24 h').closest('button')).toBeEnabled();
  });
});
