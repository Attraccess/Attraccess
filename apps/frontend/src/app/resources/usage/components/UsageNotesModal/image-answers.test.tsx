import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType, type ResourceUsage } from '@attraccess/react-query-client';
import { renderFormSubmissions } from './drawer';

vi.mock('../../../../forms/images/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: () => ({ src: 'blob:image', isLoading: false, isError: false }),
}));

afterEach(cleanup);
const A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const t = (key: string) => key;

const session = {
  formSubmissions: [
    {
      id: 1,
      formId: 3,
      form: { name: 'Check-out' },
      data: {
        '9': { value: JSON.stringify([A, B]), fieldDefinition: { name: 'Damage', type: FormFieldType.IMAGE } },
      },
    },
  ],
} as unknown as ResourceUsage;

it('renders thumbnails for an image answer in the usage notes, not the raw JSON', () => {
  const { container } = render(<>{renderFormSubmissions(session, t)}</>);
  expect(screen.getByText('Damage')).toBeTruthy();
  expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
    'Damage: photo 1 of 2',
    'Damage: photo 2 of 2',
  ]);
  expect(container.textContent).not.toContain(A);
});
