import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDurationSettings } from './SessionDurationSettings';

afterEach(cleanup);

describe('SessionDurationSettings', () => {
  it('stores hours and minutes as the maximum in minutes', () => {
    const setField = vi.fn();
    render(<SessionDurationSettings formData={{ maxSessionDurationMinutes: null }} setField={setField} />);
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '2' } });
    expect(setField).toHaveBeenCalledWith('maxSessionDurationMinutes', 120);
  });

  it('clears the maximum when both fields are empty', () => {
    const setField = vi.fn();
    render(<SessionDurationSettings formData={{ maxSessionDurationMinutes: 90 }} setField={setField} />);
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '' } });
    expect(setField).toHaveBeenLastCalledWith('maxSessionDurationMinutes', null);
  });

  it('asks for the default estimate only when required and without a maximum', () => {
    const { rerender } = render(
      <SessionDurationSettings
        formData={{ requireSessionDurationEstimate: true, maxSessionDurationMinutes: null }}
        setField={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Default estimate/)).toBeInTheDocument();
    rerender(
      <SessionDurationSettings
        formData={{ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 60 }}
        setField={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Default estimate/)).not.toBeInTheDocument();
    rerender(
      <SessionDurationSettings
        formData={{ requireSessionDurationEstimate: false, maxSessionDurationMinutes: null }}
        setField={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Default estimate/)).not.toBeInTheDocument();
  });
});
