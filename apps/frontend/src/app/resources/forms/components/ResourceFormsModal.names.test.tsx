import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType, type FormResponseDto } from '@attraccess/react-query-client';
import { ResourceFormsModal } from './ResourceFormsModal';

afterEach(cleanup);

it('shows a form name with HTML characters as typed, not escaped twice', async () => {
  const form = {
    id: 7,
    name: 'A & B <test> "quoted"',
    fields: [{ id: 1, name: 'Ø & ü', type: FormFieldType.TEXT, isRequired: true }],
  } as FormResponseDto;
  render(<ResourceFormsModal isOpen action="start" forms={[form]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  expect(await screen.findByText('Form A & B <test> "quoted"')).toBeTruthy();
  expect(screen.queryByText(/&amp;|&lt;|&quot;/)).toBeNull();
});
