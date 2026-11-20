import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileInput } from './FileInput';

describe('FileInput', () => {
  it('renders a native file input with the HeroUI field styling', () => {
    render(<FileInput aria-label="Backup" accept=".zip" />);
    const input = screen.getByLabelText('Backup');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.zip');
    expect(input).toHaveClass('input', 'input--full-width');
    expect(input).not.toHaveAttribute('data-invalid');
  });

  it('marks the field invalid', () => {
    render(<FileInput aria-label="Backup" isInvalid />);
    const input = screen.getByLabelText('Backup');
    expect(input).toHaveAttribute('data-invalid', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
