import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FormFieldType } from '@attraccess/react-query-client';
import { FormPreview } from './FormPreview';

afterEach(cleanup);

it('previews an image field with the disabled photo buttons and the photo count', () => {
  render(
    <FormPreview
      fields={[{ name: 'Damage', type: FormFieldType.IMAGE, isRequired: true, options: { maxImages: 3 } }]}
    />,
  );
  const group = screen.getByRole('group', { name: 'Damage' });
  const buttons = within(group).getAllByRole('button');
  expect(buttons.map((button) => button.textContent)).toEqual(['Take photo', 'Upload']);
  buttons.forEach((button) => expect(button).toBeDisabled());
  expect(screen.getByText('0 of 3 photos')).toBeTruthy();
});

it('previews an image field whose limit is being edited as one photo', () => {
  render(
    <FormPreview
      fields={[{ name: 'Damage', type: FormFieldType.IMAGE, isRequired: false, options: { maxImages: '' } }]}
    />,
  );
  expect(screen.getByText('0 of 1 photo')).toBeTruthy();
});
