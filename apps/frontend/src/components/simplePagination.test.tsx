import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimplePagination } from './simplePagination';

// ATT-759: the icon-only prev/next controls had no accessible name.
describe('SimplePagination', () => {
  it('gives the prev/next controls an accessible name', () => {
    render(<SimplePagination page={2} total={5} showControls onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
  });
});
