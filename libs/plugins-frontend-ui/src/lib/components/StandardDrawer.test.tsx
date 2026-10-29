// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StandardDrawer } from './StandardDrawer';

afterEach(cleanup);

describe('StandardDrawer', () => {
  it('centres a bottom drawer on wide screens', () => {
    render(
      <StandardDrawer isOpen onOpenChange={() => undefined} dialogProps={{ 'aria-label': 'Bottom' }}>
        content
      </StandardDrawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Bottom' });
    expect(dialog.className).toContain('md:max-w-2xl');
    expect(dialog.className).toContain('md:mx-auto');
    expect(dialog.className).toContain('bg-overlay');
  });

  it('keeps a side drawer docked to its edge', () => {
    render(
      <StandardDrawer
        isOpen
        onOpenChange={() => undefined}
        contentProps={{ placement: 'right' }}
        dialogProps={{ 'aria-label': 'Side', className: 'extra' }}
      >
        content
      </StandardDrawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Side' });
    expect(dialog.className).not.toContain('md:mx-auto');
    expect(dialog.className).toContain('extra');
  });
});
