import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { FormFieldType } from '@attraccess/react-query-client';
import { FieldOptionsEditor } from './FieldOptionsEditor';
import { EditableFormField } from '../types';
afterEach(cleanup);
function Editor({ initial }: { initial: EditableFormField }) {
  const [field, setField] = useState(initial);
  return (
    <>
      <FieldOptionsEditor field={field} onChange={setField} t={(key) => key} />
      <output data-testid="field">{JSON.stringify(field)}</output>
    </>
  );
}
function mount(type: FormFieldType, options: EditableFormField['options']) {
  return render(<Editor initial={{ name: 'Safety', type, isRequired: true, options }} />);
}
it('updates text placeholder and multiline without losing other field properties', () => {
  mount(FormFieldType.TEXT, {});
  fireEvent.change(screen.getByLabelText('fields.options.text.placeholder'), {
    target: { value: 'Describe your check' },
  });
  fireEvent.click(screen.getByRole('switch'));
  expect(JSON.parse(screen.getByTestId('field').textContent!)).toMatchObject({
    name: 'Safety',
    isRequired: true,
    options: { placeholder: 'Describe your check', multiline: true },
  });
});
it('sets numeric constraints and allows clearing each optional bound', () => {
  mount(FormFieldType.NUMBER, { min: -1, max: 10, step: 1 });
  for (const [key, value] of [
    ['min', '0'],
    ['max', '20'],
    ['step', '0.5'],
  ])
    fireEvent.change(screen.getByLabelText(`fields.options.number.${key}`), { target: { value } });
  expect(JSON.parse(screen.getByTestId('field').textContent!).options).toEqual({ min: 0, max: 20, step: 0.5 });
  for (const key of ['min', 'max', 'step'])
    fireEvent.change(screen.getByLabelText(`fields.options.number.${key}`), { target: { value: '' } });
  expect(JSON.parse(screen.getByTestId('field').textContent!).options).toEqual({ min: '', max: '', step: '' });
});
it('adds, focuses, edits and removes select choices', () => {
  mount(FormFieldType.SELECT, { options: ['First'] });
  fireEvent.click(screen.getByRole('button', { name: 'fields.options.select.addOption' }));
  const inputs = screen.getAllByPlaceholderText('fields.options.select.optionPlaceholder');
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toHaveFocus();
  fireEvent.change(inputs[1], { target: { value: 'Second' } });
  expect(JSON.parse(screen.getByTestId('field').textContent!).options).toEqual({ options: ['First', 'Second'] });
  fireEvent.click(screen.getAllByRole('button').find((button) => !button.textContent)!);
  expect(JSON.parse(screen.getByTestId('field').textContent!).options).toEqual({ options: ['Second'] });
});
it('enforces the twelve-choice limit and explains boolean options', () => {
  const view = mount(FormFieldType.SELECT, { options: Array.from({ length: 12 }, (_, index) => String(index)) });
  expect(screen.getByRole('button', { name: 'fields.options.select.maxOptions' })).toBeDisabled();
  view.unmount();
  mount(FormFieldType.BOOLEAN, {});
  expect(screen.getByText('fields.options.boolean.description')).toBeTruthy();
});
