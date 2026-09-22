import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType, type FormResponseDto } from '@attraccess/react-query-client';
import { ResourceFormsModal } from './ResourceFormsModal';
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
function form(fields: Partial<FormResponseDto['fields'][number]>[]): FormResponseDto {
  return {
    id: 7,
    name: 'Safety',
    fields: fields.map((field, index) => ({
      id: index + 1,
      name: 'Field',
      type: FormFieldType.TEXT,
      isRequired: false,
      ...field,
    })),
  } as FormResponseDto;
}
it('validates required text and booleans, then submits typed answers while omitting optional empty fields', async () => {
  const submit = vi.fn();
  const forms = [
    form([
      { name: 'Description', isRequired: true, options: { placeholder: 'Describe check' } },
      { name: 'Temperature', type: FormFieldType.NUMBER, options: { min: 0, max: 100, step: 0.5 } },
      { name: 'Confirmed', type: FormFieldType.BOOLEAN, isRequired: true },
      { name: 'Optional', options: { multiline: true, placeholder: 'Optional note' } },
    ]),
  ];
  render(<ResourceFormsModal isOpen action="start" forms={forms} onSubmit={submit} onCancel={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'modal.submit' }));
  expect(await screen.findByText('modal.fieldRequired')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText('Describe check'), { target: { value: 'Checked guards' } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '21.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(await screen.findByText('modal.booleanRequired')).toBeTruthy();
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([
    {
      formId: 7,
      answers: [
        { fieldId: 1, value: 'Checked guards' },
        { fieldId: 2, value: 21.5 },
        { fieldId: 3, value: true },
      ],
    },
  ]);
});
it('deduplicates select choices and submits the selected option', async () => {
  const submit = vi.fn();
  const forms = [
    form([
      { name: 'Choice', type: FormFieldType.SELECT, isRequired: true, options: [' First ', '', 'First', 'Second'] },
    ]),
  ];
  render(<ResourceFormsModal isOpen action="takeover" forms={forms} onSubmit={submit} onCancel={vi.fn()} />);
  expect(await screen.findByText('modal.title.takeover')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Choice$/ }));
  expect(await screen.findAllByRole('option')).toHaveLength(2);
  fireEvent.click(screen.getByRole('option', { name: 'Second' }));
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([{ formId: 7, answers: [{ fieldId: 1, value: 'Second' }] }]);
});
it('clears values on close and supports cancel and end-session forms', async () => {
  const submit = vi.fn();
  const cancel = vi.fn();
  const forms = [form([{ options: { multiline: true, placeholder: 'End notes' } }])];
  const view = render(<ResourceFormsModal isOpen action="end" forms={forms} onSubmit={submit} onCancel={cancel} />);
  fireEvent.change(await screen.findByPlaceholderText('End notes'), { target: { value: 'Finished' } });
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([{ formId: 7, answers: [{ fieldId: 1, value: 'Finished' }] }]);
  fireEvent.click(screen.getByRole('button', { name: 'modal.cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
  view.rerender(<ResourceFormsModal isOpen={false} action="end" forms={forms} onSubmit={submit} onCancel={cancel} />);
  view.rerender(<ResourceFormsModal isOpen action="end" forms={forms} onSubmit={submit} onCancel={cancel} />);
  await waitFor(() => expect(screen.getByPlaceholderText('End notes')).toHaveValue(''));
});
it('disables empty select lists and includes optional false boolean answers', async () => {
  const submit = vi.fn();
  render(
    <ResourceFormsModal
      isOpen
      action="start"
      forms={[form([{ name: 'Empty', type: FormFieldType.SELECT, options: null }, { type: FormFieldType.BOOLEAN }])]}
      onSubmit={submit}
      onCancel={vi.fn()}
    />,
  );
  expect(await screen.findByRole('button', { name: /Empty$/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([{ formId: 7, answers: [{ fieldId: 2, value: false }] }]);
});
