import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { UnauthorizedLayout } from './layout';

function renderLayout() {
  return render(
    <UnauthorizedLayout>
      <div data-testid="form-content">Form content</div>
    </UnauthorizedLayout>,
  );
}

afterEach(() => {
  cleanup();
});

describe('UnauthorizedLayout', () => {
  it('renders its children', () => {
    renderLayout();
    expect(screen.getByTestId('form-content')).toBeInTheDocument();
  });

  it('keeps the outer container scrollable at a dynamic viewport height', () => {
    const { container } = renderLayout();
    const outer = container.firstElementChild;
    expect(outer).not.toBeNull();
    expect(outer).toHaveClass('overflow-y-auto', 'h-[var(--vvh,100dvh)]');

    const content = outer?.firstElementChild ?? null;
    expect(content).toHaveClass('flex', 'min-h-full');
  });

  it('top-aligns the form column below lg so the auth CTA stays above the fold on small screens', () => {
    const { container } = renderLayout();
    const formColumn = container.querySelector('[data-cy="unauthorized-form-column"]');
    expect(formColumn).not.toBeNull();
    expect(formColumn).toContainElement(screen.getByTestId('form-content'));
    expect(formColumn).toHaveClass('flex', 'items-start', 'lg:items-center', 'justify-center');
    expect(formColumn).not.toHaveClass('items-center');

    const alignmentClasses = Array.from(formColumn?.classList ?? [])
      .filter((token) => /(^|:)items-/.test(token))
      .sort();
    expect(alignmentClasses).toEqual(['items-start', 'lg:items-center']);
  });
});
