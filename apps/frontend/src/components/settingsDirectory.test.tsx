import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { SettingsDirectory } from './settingsDirectory';

it('filters translated groups and opens only the selected inline editor', () => {
  render(
    <MemoryRouter>
      <SettingsDirectory
        searchLabel="Find a setting"
        emptyMessage="No matching settings"
        groups={[
          { key: 'identity', label: 'Identity', items: [{ key: 'profile', title: 'Profile', description: 'Email and name', content: <p>Profile editor</p> }] },
          { key: 'access', label: 'Access', items: [{ key: 'password', title: 'Password', description: 'Sign-in secret', content: <p>Password editor</p> }] },
        ]}
      />
    </MemoryRouter>,
  );

  expect(screen.queryByText('Profile editor')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Profile/ }));
  expect(screen.getByText('Profile editor')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Password/ }));
  expect(screen.queryByText('Profile editor')).not.toBeInTheDocument();
  expect(screen.getByText('Password editor')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a setting' }), { target: { value: 'email' } });
  expect(screen.getByRole('button', { name: /Profile/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Password/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a setting' }), { target: { value: 'absent' } });
  expect(screen.getByText('No matching settings')).toBeInTheDocument();
});
