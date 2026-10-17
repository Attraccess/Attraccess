import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DocumentationEditor } from './DocumentationEditor';
const state = vi.hoisted(() => ({
  resource: undefined as
    undefined | { name: string; documentationType?: string; documentationMarkdown?: string; documentationUrl?: string },
  loading: false,
  error: false,
  failure: undefined as unknown,
  pending: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  toastError: vi.fn(),
  options: {} as { onSuccess: () => void; onError: () => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.toastError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  DocumentationType: { MARKDOWN: 'markdown', URL: 'url' },
  UseResourcesServiceGetOneResourceByIdKeyFn: ({ id }: { id: number }) => ['resource', id],
  useResourcesServiceGetAllResourcesKey: 'resources',
  useResourcesServiceGetOneResourceById: () => ({
    data: state.resource,
    isLoading: state.loading,
    isError: state.error,
    error: state.failure,
    refetch: state.refetch,
  }),
  useResourcesServiceUpdateOneResource: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate, isPending: state.pending };
  },
}));
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function open() {
  return render(
    <MemoryRouter initialEntries={['/resources/7/documentation']}>
      <Location />
      <Routes>
        <Route path="/resources/:id/documentation" element={<DocumentationEditor />} />
        <Route path="*" element={<div>Destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
function save() {
  fireEvent.click(screen.getAllByRole('button', { name: 'actions.save' })[0]);
}
beforeEach(() => {
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
  vi.clearAllMocks();
  state.resource = { name: 'Laser' };
  state.loading = false;
  state.error = false;
  state.failure = undefined;
  state.pending = false;
});
afterEach(cleanup);
it('renders loading, missing and recoverable error states', () => {
  state.loading = true;
  let view = open();
  expect(document.querySelector('[data-cy="documentation-editor-loading-spinner"]')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.resource = undefined;
  view = open();
  expect(screen.getByText('notFound.message')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.backToResources' }));
  expect(screen.getByRole('status').textContent).toBe('/resources');
  view.unmount();
  state.error = true;
  state.failure = new Error('Unavailable');
  view = open();
  expect(screen.getByText('Unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  view.unmount();
  state.failure = {};
  open();
  expect(screen.getByText('error.unknown')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.backToResources' }));
  expect(screen.getByRole('status').textContent).toBe('/resources');
});
it('validates URL content and saves only the selected documentation format', () => {
  state.resource = { name: 'Laser', documentationType: 'markdown', documentationMarkdown: '# Old' };
  open();
  fireEvent.click(screen.getByRole('radio', { name: 'documentationType.url' }));
  save();
  expect(screen.getByText('validation.urlRequired')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'invalid' } });
  save();
  expect(screen.getByText('validation.invalidUrl')).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://example.test/manual' } });
  fireEvent.submit(document.querySelector('form')!);
  expect(state.mutate).toHaveBeenCalledWith({
    id: 7,
    formData: {
      documentationType: 'url',
      documentationMarkdown: undefined,
      documentationUrl: 'https://example.test/manual',
    },
  });
  act(() => state.options.onSuccess());
  expect(state.invalidate.mock.calls).toEqual([[{ queryKey: ['resource', 7] }], [{ queryKey: ['resources'] }]]);
  expect(state.success).toHaveBeenCalledWith({
    title: 'notifications.saveSuccess.title',
    description: 'notifications.saveSuccess.description',
  });
  expect(screen.getByRole('status').textContent).toBe('/resources/7');
});
it('validates markdown, previews its rendered content and retains the draft after a save failure', () => {
  open();
  fireEvent.click(screen.getByRole('radio', { name: 'documentationType.markdown' }));
  save();
  expect(screen.getByText('validation.markdownRequired')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'preview' }));
  expect(screen.getByText('markdownContent.placeholder')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'edit' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Safety instructions' } });
  fireEvent.click(screen.getByRole('tab', { name: 'preview' }));
  expect(screen.getByRole('heading', { name: 'Safety instructions' })).toBeTruthy();
  save();
  expect(state.mutate).toHaveBeenCalledWith({
    id: 7,
    formData: {
      documentationType: 'markdown',
      documentationMarkdown: '# Safety instructions',
      documentationUrl: undefined,
    },
  });
  act(() => state.options.onError());
  expect(state.toastError).toHaveBeenCalledWith({
    title: 'notifications.saveError.title',
    description: 'notifications.saveError.description',
  });
  expect(screen.getByRole('heading', { name: 'Safety instructions' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
  expect(screen.getByRole('status').textContent).toBe('/resources/7');
});
it('loads existing URL documentation and disables editing while saving', () => {
  state.resource = { name: 'Laser', documentationType: 'url', documentationUrl: 'https://example.test/existing' };
  state.pending = true;
  open();
  expect(screen.getByRole('textbox')).toHaveValue('https://example.test/existing');
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'documentationType.markdown' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'actions.cancel' })).toBeDisabled();
});
