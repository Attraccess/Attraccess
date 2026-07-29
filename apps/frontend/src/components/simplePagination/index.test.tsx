import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import en from './en.json';
import { SimplePagination } from './index';

// Pin the locale to en so the assertions don't depend on the default language.
vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const translations = (await import('./en.json')).default as Record<string, string>;
  return {
    useTranslations: () => ({
      t: (key: string) => translations[key] ?? key,
      tExists: (key: string) => Boolean(translations[key]),
      language: 'en',
      setLanguage: vi.fn(),
    }),
  };
});

// ATT-759: the icon-only prev/next controls had no accessible name.
describe('SimplePagination', () => {
  it('gives the prev/next controls an accessible name', () => {
    render(<SimplePagination page={2} total={5} showControls onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: en.previous })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.next })).toBeInTheDocument();
  });
});
