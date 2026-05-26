// Unit test for central Markdown wrapper covering variants and class merging
// FEATURE: ATT-407 shared markdown rendering abstraction
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Markdown } from './index';

vi.mock('react-markdown', () => ({
  default: ({ children, remarkPlugins }: { children: string; remarkPlugins?: unknown[] }) => (
    <span data-testid="markdown-inner" data-plugin-count={remarkPlugins?.length ?? 0}>
      {children}
    </span>
  ),
}));

vi.mock('remark-gfm', () => ({ default: () => ({}) }));

describe('Markdown', () => {
  it('renders children through react-markdown', () => {
    render(<Markdown>hello world</Markdown>);
    expect(screen.getByTestId('markdown-inner')).toHaveTextContent('hello world');
  });

  it('passes remarkGfm to react-markdown', () => {
    render(<Markdown>x</Markdown>);
    expect(screen.getByTestId('markdown-inner')).toHaveAttribute('data-plugin-count', '1');
  });

  it('applies default variant prose classes', () => {
    const { container } = render(<Markdown>x</Markdown>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('prose');
    expect(wrapper.className).toContain('prose-h1:text-2xl');
  });

  it('applies compact variant prose classes', () => {
    const { container } = render(<Markdown variant="compact">x</Markdown>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('prose-sm');
    expect(wrapper.className).toContain('prose-p:my-1');
  });

  it('appends caller className', () => {
    const { container } = render(<Markdown className="custom-class">x</Markdown>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('custom-class');
  });

  it('forwards data-cy attribute', () => {
    const { container } = render(<Markdown data-cy="my-md">x</Markdown>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-cy')).toBe('my-md');
  });
});
