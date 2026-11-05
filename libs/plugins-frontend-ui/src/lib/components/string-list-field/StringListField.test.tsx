import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StringListField, StringListFieldProps, validateStringListEntry } from './StringListField';

function Harness({
  initial = [],
  onChange,
  onSubmit,
  ...props
}: {
  initial?: string[];
  onChange?: (values: string[]) => void;
  onSubmit?: () => void;
} & Partial<StringListFieldProps>) {
  const [values, setValues] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <StringListField
        label="Paths"
        values={values}
        onChange={(next) => {
          setValues(next);
          onChange?.(next);
        }}
        {...props}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </form>
  );
}

const stored = () => JSON.parse(screen.getByTestId('values').textContent ?? '[]') as string[];

describe('StringListField', () => {
  it('adds an entry with Enter without submitting the surrounding form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'realm_access.roles{Enter}');

    expect(stored()).toEqual(['realm_access.roles']);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Paths' })).toHaveValue('');
  });

  it('adds a trimmed entry with the Add button and keeps the order', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    for (const value of ['  b  ', 'a', 'c']) {
      await user.type(screen.getByRole('textbox', { name: 'Paths' }), value);
      await user.click(screen.getByRole('button', { name: 'Add' }));
    }

    expect(stored()).toEqual(['b', 'a', 'c']);
  });

  it('does not split on commas and explains why', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'a,b{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot contain commas/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Paths' })).toHaveValue('a,b');
  });

  it.each([
    ['   ', /Enter a value/],
    ['dup', /already in the list/],
    ['bad\u0007', /control characters/],
    ['abcdef', /at most 5 characters/],
  ])('rejects %j', async (entry, message) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['dup']} maxLength={5} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Paths' }), entry === '   ' ? ' ' : entry);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('removes an entry through its labelled remove control', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['one', 'two', 'three']} />);

    await user.click(screen.getByRole('button', { name: /Remove tag two/ }));

    expect(stored()).toEqual(['one', 'three']);
  });

  it('stops at maxEntries', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a', 'b']} maxEntries={2} />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByText(/at most 2 entries/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'c{Enter}');
    expect(stored()).toEqual(['a', 'b']);
  });

  it('shows the empty hint only while the list is empty', async () => {
    const user = userEvent.setup();
    render(<Harness emptyHint="Defaults used: roles" />);

    expect(screen.getByText('Defaults used: roles')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'x{Enter}');
    expect(screen.queryByText('Defaults used: roles')).not.toBeInTheDocument();
  });

  it('shows angle brackets in entries unescaped', () => {
    render(<Harness initial={['resource_access.<clientId>.roles']} />);
    expect(screen.getByText('resource_access.<clientId>.roles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove tag resource_access\.<clientId>\.roles/ })).toBeInTheDocument();
  });
});

describe('validateStringListEntry', () => {
  it('checks the limit before the entry itself', () => {
    expect(validateStringListEntry('', ['a'], { maxEntries: 1 })).toBe('limitReached');
    expect(validateStringListEntry('ok', ['a'])).toBeNull();
  });
});
