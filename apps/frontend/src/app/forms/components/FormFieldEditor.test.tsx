import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType } from '@attraccess/react-query-client';
import { FormFieldEditor } from './FormFieldEditor';

vi.mock('../../../components/select', () => ({
  Select: ({
    label,
    value,
    items,
    onChange,
  }: {
    label: string;
    value: string;
    items: { key: string; label: string }[];
    onChange: (key: string) => void;
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.key} value={item.key}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));

afterEach(cleanup);

it('offers the image type and gives a new image field one photo by default', () => {
  const onChange = vi.fn();
  render(
    <FormFieldEditor
      field={{ name: 'Damage', type: FormFieldType.TEXT, isRequired: false, options: {} }}
      onChange={onChange}
      onRemove={vi.fn()}
      t={(key) => key}
    />,
  );
  const picker = screen.getByRole('combobox', { name: 'fields.type' });
  expect(screen.getByRole('option', { name: 'fields.types.image' })).toBeTruthy();

  fireEvent.change(picker, { target: { value: FormFieldType.IMAGE } });

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Damage', type: FormFieldType.IMAGE, options: { maxImages: 1 } }),
  );
});
