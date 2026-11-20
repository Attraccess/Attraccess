import type { ReactNode } from 'react';
import type { User } from '@attraccess/react-query-client';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMinusIcon } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { UserSelectionList } from './index';
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...{
    UserSearch: ({
      onSelectionChange,
      afterSelection,
      resetSignal,
    }: {
      onSelectionChange: (user: { id: number; username: string }) => void;
      afterSelection: ReactNode;
      resetSignal: number;
    }) => (
      <>
        <button onClick={() => onSelectionChange({ id: 99, username: 'New user' })}>Choose user</button>
        <output aria-label="Picker reset">{resetSignal}</output>
        <div data-testid="add-user">{afterSelection}</div>
      </>
    ),
  },
}));
afterEach(cleanup);
it('adds the chosen user once and clears the picker', () => {
  const add = vi.fn();
  render(
    <MemoryRouter>
      <UserSelectionList onAddToSelection={add} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Choose user'));
  const button = screen.getByTestId('add-user').querySelector('button')!;
  fireEvent.click(button);
  expect(add).toHaveBeenCalledWith({ id: 99, username: 'New user' });
  expect(screen.getByTestId('add-user')).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Picker reset')).toHaveTextContent('1');
});
async function chooseAction(username: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${username}` }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: action }));
}
it('sorts and paginates selected users and dispatches dynamic row actions', async () => {
  const action = vi.fn();
  const users = Array.from(
    { length: 11 },
    (_, index) => ({ id: index + 1, username: `User ${String(11 - index).padStart(2, '0')}` }) as User,
  );
  render(
    <MemoryRouter>
      <UserSelectionList
        selectedUsers={users}
        onAddToSelection={vi.fn()}
        actions={(user) => [
          { key: 'remove', label: `Remove ${user.username}`, icon: UserMinusIcon, tone: 'danger', onPress: action },
        ]}
        additionalColumns={[
          { key: 'identifier', label: 'Identifier', value: (user) => `ID-${user.id}` },
          { key: 'kind', label: 'Kind', value: 'Member' },
        ]}
        rowClassName={(user) => (user.id === 11 ? 'first-user' : undefined)}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Actions for User 01' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actions for User 11' })).toBeNull();
  expect(screen.getByText('ID-11').closest('tr')).toHaveClass('first-user');
  await chooseAction('User 01', 'Remove User 01');
  expect(action).toHaveBeenCalledWith(users[10]);
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  expect(screen.getByRole('button', { name: 'Actions for User 11' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actions for User 01' })).toBeNull();
});
it('supports fixed actions and row styling', async () => {
  const action = vi.fn();
  const user = { id: 1, username: 'Alice' } as User;
  render(
    <MemoryRouter>
      <UserSelectionList
        selectedUsers={[user]}
        onAddToSelection={vi.fn()}
        actions={[{ key: 'remove', label: 'Remove', icon: UserMinusIcon, tone: 'danger', onPress: action }]}
        rowClassName="selected-user"
      />
    </MemoryRouter>,
  );
  await chooseAction('Alice', 'Remove');
  expect(action).toHaveBeenCalledWith(user);
});
