import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '../../test-utils/wrappers';
import { FormEditorPage } from './FormEditorPage';

const lookup = vi.hoisted(() => ({
  result: {} as { data?: unknown; isLoading: boolean; error?: unknown },
  submissions: {} as { data?: unknown; isLoading: boolean },
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
    I18nTransComponent: () => null,
  }))()),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  useFormsGetOne: () => lookup.result,
  useFormsListResources: () => ({ data: undefined }),
  useFormsListSubmissions: () => lookup.submissions,
  useFormsCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFormsUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFormsDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResourceGroupsGetMany: () => ({ data: [], isLoading: false }),
}));

const renderAt = (path: string) =>
  render(<TestWrapper initialRoute={path} routes={<Route path="/forms/:formId" element={<FormEditorPage />} />} />);

describe('FormEditorPage for a form that does not exist', () => {
  beforeEach(() => {
    lookup.result = { data: undefined, isLoading: false };
    lookup.submissions = { data: undefined, isLoading: false };
  });

  it.each(['/forms/abc', '/forms/0', '/forms/1.5'])('shows the not-found page for %s', (path) => {
    const { container } = renderAt(path);
    expect(container.querySelector('[data-cy="not-found"]')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="form-editor-page"]')).not.toBeInTheDocument();
  });

  it('shows the not-found page when the API knows neither the form nor its submissions', () => {
    lookup.result = { data: undefined, isLoading: false, error: { status: 404 } };
    const { container } = renderAt('/forms/42');
    expect(container.querySelector('[data-cy="not-found"]')).toBeInTheDocument();
  });

  it("keeps a deleted form's submissions readable at its address", () => {
    lookup.result = { data: undefined, isLoading: false, error: { status: 404 } };
    lookup.submissions = { data: { data: [], total: 0, page: 1, limit: 1 }, isLoading: false };
    const { container, getByText } = renderAt('/forms/42?tab=submissions');
    expect(container.querySelector('[data-cy="deleted-form-submissions"]')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="form-submissions-panel"]')).toBeInTheDocument();
    expect(getByText('deleted.description')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="not-found"]')).not.toBeInTheDocument();
  });

  it('keeps the editor for a create', () => {
    const { container } = renderAt('/forms/new');
    expect(container.querySelector('[data-cy="not-found"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cy="form-editor-page"]')).toBeInTheDocument();
  });
});
