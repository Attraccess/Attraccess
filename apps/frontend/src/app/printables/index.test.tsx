import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PrintablesPage from './index';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('./RfidKeychainCard', () => ({
  RfidKeychainCard: ({ label, onLabelChange }: { label: string; onLabelChange: (label: string) => void }) => (
    <input aria-label="keychain configurator" value={label} onChange={(event) => onLabelChange(event.target.value)} />
  ),
}));
vi.mock('./SmartPlugCover', () => ({ SmartPlugCover: () => <div>cover configurator</div> }));

afterEach(cleanup);

it('opens on the keychain card and switches to the smart plug cover', () => {
  render(<PrintablesPage />);
  expect(screen.getByRole('tab', { name: 'cardTitle' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('textbox', { name: 'keychain configurator' })).toBeTruthy();
  expect(screen.queryByText('cover configurator')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'plugTitle' }));
  expect(screen.getByText('cover configurator')).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'keychain configurator' })).toBeNull();
});

it("keeps a model's settings when switching tabs and back", () => {
  render(<PrintablesPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'keychain configurator' }), { target: { value: 'Workshop' } });
  fireEvent.click(screen.getByRole('tab', { name: 'plugTitle' }));
  fireEvent.click(screen.getByRole('tab', { name: 'cardTitle' }));
  expect(screen.getByRole('textbox', { name: 'keychain configurator' })).toHaveValue('Workshop');
});
