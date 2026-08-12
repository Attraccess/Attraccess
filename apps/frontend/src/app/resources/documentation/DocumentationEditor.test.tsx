import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocumentationEditor } from './DocumentationEditor';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '7' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@attraccess/react-query-client', () => {
  // stable identity: the editor resets its state in a useEffect keyed on the resource
  const resource = { id: 7, name: 'Laser Cutter', documentationType: 'markdown', documentationMarkdown: '# hi' };
  return {
    DocumentationType: { MARKDOWN: 'markdown', URL: 'url' },
    UseResourcesServiceGetOneResourceByIdKeyFn: () => ['resource', 7],
    useResourcesServiceGetAllResourcesKey: 'resources',
    useResourcesServiceGetOneResourceById: () => ({
      data: resource,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useResourcesServiceUpdateOneResource: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

describe('DocumentationEditor', () => {
  it('lets the user switch the documentation type to URL', async () => {
    render(<DocumentationEditor />);

    // regression: HeroUI v3 Radio only renders an interactive input when Radio.Control is present
    const urlRadio = screen.getByRole('radio', { name: 'documentationType.url' });
    await userEvent.click(screen.getByText('documentationType.url'));

    expect(urlRadio).toBeChecked();
    expect(document.querySelector('[data-cy="documentation-editor-url-input"]')).toBeInTheDocument();
  });
});
