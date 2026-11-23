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

  it('does not turn a negative value into "no limit"', () => {
    const setField = vi.fn();
    render(<SessionDurationSettings formData={{ maxSessionDurationMinutes: 90 }} setField={setField} />);
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '-2' } });
    // The minus sign is dropped: 2 h plus the 30 min already entered.
    expect(setField).toHaveBeenCalledWith('maxSessionDurationMinutes', 150);
  });

  it('drops the hidden default estimate once a maximum is set', () => {
    const setField = vi.fn();
    render(
      <SessionDurationSettings
        formData={{ requireSessionDurationEstimate: true, maxSessionDurationMinutes: null }}
        setField={setField}
      />,
    );
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } });
    expect(setField).toHaveBeenCalledWith('defaultSessionDurationEstimateMinutes', null);
  });

  it('shows an error instead of silently clamping a maximum above 720 hours', () => {
    const setField = vi.fn();
    const { rerender } = render(
      <SessionDurationSettings formData={{ maxSessionDurationMinutes: null }} setField={setField} />,
    );
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '721' } });
    // The form keeps what the field shows; saving refuses it.
    expect(setField).toHaveBeenCalledWith('maxSessionDurationMinutes', 721 * 60);
    rerender(<SessionDurationSettings formData={{ maxSessionDurationMinutes: 721 * 60 }} setField={setField} />);
    expect(screen.getByLabelText('Hours')).toHaveValue(721);
    expect(screen.getByText(/cannot be longer than 720 hours/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hours')).toHaveAttribute('aria-invalid', 'true');

    rerender(<SessionDurationSettings formData={{ maxSessionDurationMinutes: 720 * 60 }} setField={setField} />);
    expect(screen.queryByText(/cannot be longer than 720 hours/)).not.toBeInTheDocument();
  });

  it('describes both fields with the help text', () => {
    render(<SessionDurationSettings formData={{ maxSessionDurationMinutes: 90 }} setField={vi.fn()} />);
    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription(/stops a session automatically/);
    expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription(/stops a session automatically/);
  });
});
