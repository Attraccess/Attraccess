import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { UnauthorizedLayout } from './layout';

function classesOf(element: Element | null): Set<string> {
  return new Set(element?.className.split(/\s+/).filter(Boolean) ?? []);
}

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
    expect(screen.getByTestId('form-content')).toBeTruthy();
  });

  it('keeps the outer container scrollable at a dynamic viewport height', () => {
    const { container } = renderLayout();
    const outer = container.firstElementChild;
    expect(outer).not.toBeNull();
    const classes = classesOf(outer);
    expect(classes.has('overflow-y-auto')).toBe(true);
    expect(classes.has('h-[var(--vvh,100dvh)]')).toBe(true);

    const content = outer?.firstElementChild ?? null;
    expect(classesOf(content).has('flex')).toBe(true);
    expect(classesOf(content).has('min-h-full')).toBe(true);
  });

  it('top-aligns the form column below lg and centers it at lg and above', () => {
    const { getByTestId } = renderLayout();
    const formColumn = getByTestId('form-content').parentElement?.parentElement ?? null;
    const classes = classesOf(formColumn);
    expect(classes.has('flex')).toBe(true);
    expect(classes.has('items-start')).toBe(true);
    expect(classes.has('lg:items-center')).toBe(true);
    expect(classes.has('justify-center')).toBe(true);
    expect(classes.has('items-center')).toBe(false);
  });
});
