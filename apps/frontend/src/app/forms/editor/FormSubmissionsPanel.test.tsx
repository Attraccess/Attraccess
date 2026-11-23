import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType } from '@attraccess/react-query-client';
import { FormSubmissionsPanel } from './FormSubmissionsPanel';

const submissions = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useFormsListSubmissions: submissions,
}));
vi.mock('../images/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: () => ({ src: 'blob:image', isLoading: false, isError: false }),
}));

afterEach(cleanup);
const A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

it('shows an image answer as thumbnails next to the other answers, never as the stored id list', () => {
  submissions.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      total: 1,
      data: [
        {
          id: 5,
          createdAt: new Date().toISOString(),
          action: 'start',
          user: null,
          resource: { id: 1, name: 'Laser' },
          data: {
            '1': {
              value: 'Scratch on the lid',
              fieldDefinition: { name: 'Note', position: 0, type: FormFieldType.TEXT },
            },
            '2': {
              value: JSON.stringify([A, B]),
              fieldDefinition: { name: 'Damage', position: 1, type: FormFieldType.IMAGE },
            },
          },
        },
      ],
    },
  });
  const { container } = render(
    <FormSubmissionsPanel formId={1} resources={[]} resourceId={null} onResourceIdChange={vi.fn()} />,
  );

  fireEvent.click(container.querySelector('[data-cy="form-submission-toggle-5"]') as Element);

  expect(screen.getByText('Scratch on the lid')).toBeTruthy();
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(container.textContent).not.toContain(A);
  expect(container.textContent).not.toContain('["');
});
