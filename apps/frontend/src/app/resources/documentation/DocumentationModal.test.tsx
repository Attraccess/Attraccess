import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentationModal } from './DocumentationModal';
import { TestWrapper } from '../../../test-utils/wrappers';

const hoisted = vi.hoisted(() => ({
  resource: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
    tExists: () => true,
  }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetOneResourceById: () => ({
    data: hoisted.resource,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: () => false }),
}));

const openModal = async () => {
  render(
    <DocumentationModal resourceId={1}>
      {(onOpen) => (
        <button type="button" data-cy="open" onClick={onOpen}>
          open
        </button>
      )}
    </DocumentationModal>,
    { wrapper: TestWrapper }
  );
  const user = userEvent.setup();
  await user.click(document.querySelector('[data-cy="open"]') as HTMLButtonElement);
  return user;
};

beforeEach(() => {
  hoisted.resource = {
    id: 1,
    name: 'Lathe',
    documentationType: 'url',
    documentationUrl: 'about:blank',
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocumentationModal', () => {
  it('renders the documentation URL inside an iframe', async () => {
    await openModal();

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'about:blank');
  });

  it('opens wide (not narrow) by default so websites are readable', async () => {
    await openModal();

    // The "lg" size only caps max-width, so a width-less iframe would collapse the
    // dialog. The fix forces a wide, viewport-bounded width on the dialog element.
    const dialog = document.querySelector('.modal__dialog');
    // Fills width on phones, grows to a fixed wide size from `sm` up, capped to the viewport.
    expect(dialog).toHaveClass('w-full');
    expect(dialog).toHaveClass('sm:w-[72rem]');
    expect(dialog).toHaveClass('max-w-[95vw]');
  });

  it('drops the forced width when switching to fullscreen', async () => {
    const user = await openModal();

    await user.click(
      document.querySelector('[data-cy="documentation-modal-fullscreen-button"]') as HTMLButtonElement
    );

    const dialog = document.querySelector('.modal__dialog');
    expect(dialog).not.toHaveClass('sm:w-[72rem]');
  });
});
