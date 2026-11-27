import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PrintablesPage from './index';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('./RfidKeychainCard', () => ({ RfidKeychainCard: () => <div>keychain configurator</div> }));
vi.mock('./SmartPlugCover', () => ({ SmartPlugCover: () => <div>cover configurator</div> }));

afterEach(cleanup);

it('opens on the keychain card and switches to the smart plug cover', () => {
  render(<PrintablesPage />);
  expect(screen.getByRole('tab', { name: 'cardTitle' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('keychain configurator')).toBeTruthy();
  expect(screen.queryByText('cover configurator')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'plugTitle' }));
  expect(screen.getByText('cover configurator')).toBeTruthy();
  expect(screen.queryByText('keychain configurator')).toBeNull();
});
