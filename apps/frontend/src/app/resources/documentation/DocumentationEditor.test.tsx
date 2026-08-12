import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '../../../test-utils/wrappers';
import { DocumentationEditor } from './DocumentationEditor';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

// stable identity: the editor resets its state in a useEffect keyed on the resource
const resource = { id: 7, name: 'Laser Cutter', documentationType: 'markdown', documentationMarkdown: '# hi' };

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  useResourcesServiceGetOneResourceById: () => ({
    data: resource,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useResourcesServiceUpdateOneResource: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('DocumentationEditor', () => {
  it('lets the user switch the documentation type to URL', async () => {
    render(
      <TestWrapper
        initialRoute="/resources/7/documentation/edit"
        routes={<Route path="/resources/:id/documentation/edit" element={<DocumentationEditor />} />}
      />
    );

    const urlRadio = screen.getByRole('radio', { name: 'documentationType.url' });

    // regression: HeroUI v3 only wires up a radio when Radio.Control sits inside Radio.Content —
    // without Control there is no input at all, and with Control as a sibling the circle is dead
    await userEvent.click(urlRadio.closest('[data-slot="radio"]')!.querySelector('[data-slot="radio-control"]')!);

    expect(urlRadio).toBeChecked();
    expect(screen.getByLabelText('urlContent.label')).toBeInTheDocument();
  });
});
