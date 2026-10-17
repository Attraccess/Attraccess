import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DocumentationView } from './DocumentationView';
import { ResourceDocsPreviewCard } from '../details/overview/ResourceDocsPreviewCard';
const state = vi.hoisted(() => ({
  resource: undefined as Record<string, unknown> | undefined,
  loading: false,
  error: false,
  cause: undefined as unknown,
  fetching: false,
  canEdit: false,
  refetch: vi.fn(),
  open: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetOneResourceById: () => ({
    data: state.resource,
    isLoading: state.loading,
    isError: state.error,
    error: state.cause,
    isFetching: state.fetching,
    refetch: state.refetch,
  }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.canEdit }) }));
vi.mock('./index', () => ({
  DocumentationModal: ({ children }: { children: (open: () => void) => React.ReactNode }) => children(state.open),
}));
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function show(preview = false) {
  return render(
    <MemoryRouter initialEntries={['/resources/7/documentation']}>
      <Location />
      <Routes>
        <Route
          path="/resources/:id/documentation"
          element={preview ? <ResourceDocsPreviewCard resourceId={7} /> : <DocumentationView />}
        />
        <Route path="*" element={<div>Destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  Object.assign(state, {
    resource: undefined,
    loading: false,
    error: false,
    cause: undefined,
    fetching: false,
    canEdit: false,
  });
  vi.clearAllMocks();
});
afterEach(cleanup);
it('shows loading, then retries a failed documentation request and returns to resources', () => {
  state.loading = true;
  const view = show();
  expect(view.container.querySelector('[data-cy="documentation-view-loading-spinner"]')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.error = true;
  state.cause = new Error('Offline');
  show();
  expect(screen.getByText('Offline')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'actions.backToResources' }));
  expect(screen.getByText('/resources')).toBeTruthy();
});
it('handles unknown errors and missing resources', () => {
  state.error = true;
  const view = show();
  expect(screen.getByText('error.unknown')).toBeTruthy();
  view.unmount();
  state.error = false;
  show();
  expect(screen.getByText('notFound.message')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.backToResources' }));
  expect(screen.getByText('/resources')).toBeTruthy();
});
it('renders markdown and restricts editing while allowing refresh', () => {
  state.resource = { name: 'Lathe', documentationType: 'markdown', documentationMarkdown: '# Safety first' };
  show();
  expect(screen.getByRole('heading', { name: 'Safety first' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'actions.edit' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'actions.refresh' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
it('embeds URL documentation, displays fetching state and navigates to edit', () => {
  state.resource = { name: 'Lathe', documentationType: 'url', documentationUrl: 'about:blank' };
  state.canEdit = true;
  state.fetching = true;
  const view = show();
  expect(screen.getByTitle('Lathe Documentation')).toHaveAttribute('src', 'about:blank');
  expect(view.container.querySelector('[data-cy="documentation-view-fetching-spinner"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  expect(screen.getByText('/resources/7/documentation/edit')).toBeTruthy();
});
it('shows the empty documentation state', () => {
  state.resource = { name: 'Lathe' };
  show();
  expect(screen.getByText('noDocumentation')).toBeTruthy();
});
it('hides empty previews from readers and offers editors an add action', () => {
  const view = show(true);
  expect(screen.queryByText('empty')).toBeNull();
  view.unmount();
  state.canEdit = true;
  show(true);
  fireEvent.click(screen.getByRole('button', { name: 'addCta' }));
  expect(screen.getByText('/resources/7/documentation/edit')).toBeTruthy();
});
it('truncates markdown previews and opens the full documentation', () => {
  state.resource = { documentationType: 'markdown', documentationMarkdown: 'A'.repeat(240) };
  show(true);
  expect(screen.getByText('A'.repeat(220) + '…')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'openFull' }));
  expect(state.open).toHaveBeenCalledOnce();
});
it('shows short markdown, URL previews and loading placeholders', () => {
  state.loading = true;
  let view = show(true);
  expect(view.container.querySelector('[data-cy="docs-preview-card"]')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.resource = { documentationType: 'markdown', documentationMarkdown: 'Short manual' };
  view = show(true);
  expect(screen.getByText('Short manual')).toBeTruthy();
  view.unmount();
  state.resource = { documentationType: 'url', documentationUrl: 'about:blank' };
  show(true);
  expect(screen.getByText('about:blank')).toBeTruthy();
});
