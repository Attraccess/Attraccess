import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslationState } from '../../i18n';
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
  // jsdom reports the document as unfocused; browsers report true while the window is active.
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    await user.click(screen.getByRole('button', { name: /Remove two/ }));

    expect(stored()).toEqual(['one', 'three']);
  });

  it('names the remove control in the active language', () => {
    useTranslationState.setState({ language: 'de' });
    try {
      render(<Harness initial={['one']} />);
      expect(screen.getByRole('button', { name: /Entfernen one/ })).toBeInTheDocument();
    } finally {
      useTranslationState.setState({ language: 'en' });
    }
  });

  it('lets long unbreakable entries wrap inside the tag instead of overflowing', () => {
    const urn = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
    render(<Harness initial={[urn]} />);
    const text = screen.getByText(urn);
    expect(text).toHaveClass('break-all', 'min-w-0');
    expect(text.closest('[role="row"]')).toHaveClass('max-w-full');
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

  it('adds a typed entry when focus moves on without pressing Add, and adds it once via Add', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Save</button>
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Paths' });

    await user.type(field, 'groups');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(stored()).toEqual(['groups']);
    expect(field).toHaveValue('');

    await user.type(field, 'roles');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(stored()).toEqual(['groups', 'roles']);
    expect(screen.queryByText(/Enter a value/)).not.toBeInTheDocument();
  });

  it('adds a typed entry when the keyboard moves past the Add button', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Save</button>
      </>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'groups');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
    expect(stored()).toEqual([]);
    await user.tab();

    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    expect(stored()).toEqual(['groups']);
  });

  it('keeps a half-typed entry when the browser window loses focus', () => {
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Paths' });
    field.focus();
    fireEvent.change(field, { target: { value: 'realm_acc' } });
    vi.mocked(document.hasFocus).mockReturnValue(false);
    fireEvent.blur(field, { relatedTarget: null });

    expect(stored()).toEqual([]);
    expect(field).toHaveValue('realm_acc');
  });

  it('keeps an invalid entry and shows why when focus moves on', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness initial={['x']} />
        <button type="button">Save</button>
      </>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Paths' }), 'a,b');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(stored()).toEqual(['x']);
    expect(screen.getByRole('textbox', { name: 'Paths' })).toHaveValue('a,b');
    expect(screen.getByText(/cannot contain commas/)).toBeInTheDocument();
  });

  it('does not add while an IME composition is confirmed with Enter', () => {
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Paths' });
    fireEvent.change(field, { target: { value: 'ろーる' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(stored()).toEqual([]);
  });

  it('removes stored duplicates one at a time', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['openid', 'openid', 'email']} />);

    await user.click(screen.getAllByRole('button', { name: /Remove openid/ })[0]);

    expect(stored()).toEqual(['openid', 'email']);
  });

  it('moves focus back to the input when the last entry is removed', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['only']} />);

    await user.click(screen.getByRole('button', { name: /Remove only/ }));

    expect(stored()).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Paths' })).toHaveFocus();
  });

  it('exposes hints and errors to assistive technology', async () => {
    const user = userEvent.setup();
    render(<Harness emptyHint="Defaults used: roles" description="Where roles come from" />);
    const field = screen.getByRole('textbox', { name: 'Paths' });

    expect(field).toHaveAccessibleDescription(/Where roles come from.*Defaults used: roles/);
    await user.type(field, 'a,b{Enter}');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/cannot contain commas/);
  });

  it('shows angle brackets in entries unescaped', () => {
    render(<Harness initial={['resource_access.<clientId>.roles']} />);
    expect(screen.getByText('resource_access.<clientId>.roles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove resource_access\.<clientId>\.roles/ })).toBeInTheDocument();
  });
});

describe('validateStringListEntry', () => {
  it('checks the limit before the entry itself', () => {
    expect(validateStringListEntry('', ['a'], { maxEntries: 1 })).toBe('limitReached');
    expect(validateStringListEntry('ok', ['a'])).toBeNull();
  });
});
