import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoResourcesFound } from './index';
import en from './en.json';
import de from './de.json';

const state = vi.hoisted(() => ({ permissions: ['resources.create'], locale: 'en' }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('../createResourceButton', () => ({ CreateResourceButton: () => <button>Create resource</button> }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: (translations: Record<string, Record<string, Record<string, string>>>) => ({
    t: (key: string) => {
      const [group, name] = key.split('.');
      return translations[state.locale][group][name];
    },
  }),
}));

describe.each([
  ['en', en],
  ['de', de],
])('resource empty state (%s)', (locale, translations) => {
  beforeEach(() => {
    state.locale = locale;
    state.permissions = ['resources.create'];
  });

  it('offers first-resource creation instead of resetting an empty installation', () => {
    render(<NoResourcesFound hasResources={false} onClearFilterAndSearch={vi.fn()} onOpenCreate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: translations.firstResource.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create resource' })).toBeInTheDocument();
    expect(screen.queryByText(translations.alert.clear)).not.toBeInTheDocument();
  });

  it('directs update-only users without creation permission to an administrator', () => {
    state.permissions = ['resources.update'];
    render(<NoResourcesFound hasResources={false} onClearFilterAndSearch={vi.fn()} onOpenCreate={vi.fn()} />);
    expect(screen.getByText(translations.firstResource.noPermission)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('preserves filter recovery when resources exist', () => {
    const reset = vi.fn();
    render(<NoResourcesFound hasResources onClearFilterAndSearch={reset} onOpenCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: translations.alert.clear }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Create resource' })).not.toBeInTheDocument();
  });
});
