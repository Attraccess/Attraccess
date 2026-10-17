import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceFlowVariableScope } from '@attraccess/react-query-client';
import { VariableEditor, type ValueType, type VariableFormValues } from './editor';

afterEach(cleanup);
const t = (key: string) => key;
function setup(initial?: VariableFormValues, edit = false) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <VariableEditor
      mode={edit ? { mode: 'edit', key: 'fixed', scope: ResourceFlowVariableScope.GLOBAL } : { mode: 'create' }}
      initial={initial}
      isSaving={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      t={t}
    />,
  );
  return { onSubmit, onCancel };
}
const values = (valueType: ValueType, value: unknown): VariableFormValues => ({
  scope: ResourceFlowVariableScope.GLOBAL,
  key: ' variable ',
  valueType,
  value,
});

describe('flow variable editor', () => {
  it.each<[ValueType, unknown]>([
    ['string', 'text'],
    ['number', 12.5],
    ['boolean', true],
    ['object', { nested: { value: 1 } }],
    ['array', [1, 'two']],
    ['null', null],
  ])('submits typed %s values and trims the key', (type, value) => {
    const { onSubmit } = setup(values(type, value));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    expect(onSubmit).toHaveBeenCalledWith({ ...values(type, value), key: 'variable' });
  });
  it.each<[ValueType, string, string]>([
    ['number', '', 'numberInvalid'],
    ['object', '{broken', 'jsonInvalid'],
    ['object', '[]', 'typeMismatchObject'],
    ['object', 'null', 'typeMismatchObject'],
    ['array', '{}', 'typeMismatchArray'],
  ])('rejects invalid %s input %s', (type, input, error) => {
    const { onSubmit } = setup(values(type, type === 'number' ? 0 : {}));
    fireEvent.change(screen.getByLabelText('editor.value'), { target: { value: input } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    expect(screen.getByText(`editor.errors.${error}`)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('requires a key and cancels without saving', () => {
    const { onSubmit, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    expect(screen.getByText('editor.errors.keyRequired')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('keeps an existing key and scope immutable', () => {
    setup(values('string', 'existing'), true);
    expect(screen.getByLabelText('editor.key')).toBeDisabled();
    expect(screen.getByRole('button', { name: /editor.scope/ })).toBeDisabled();
  });
  it('resets typed values when the selected type changes', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup(values('string', 'old value'));
    for (const [type, value] of [
      ['number', 0],
      ['boolean', false],
      ['object', {}],
      ['array', []],
      ['null', null],
      ['string', ''],
    ] as const) {
      await user.click(screen.getByRole('button', { name: /editor.type$/ }));
      await user.click(screen.getByRole('option', { name: `editor.types.${type}` }));
      await user.click(screen.getByRole('button', { name: 'actions.save' }));
      expect(onSubmit).toHaveBeenLastCalledWith({
        scope: ResourceFlowVariableScope.GLOBAL,
        key: 'variable',
        valueType: type,
        value,
      });
    }
  });
});
