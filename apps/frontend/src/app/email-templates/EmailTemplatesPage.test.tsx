import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailTemplatesPage } from './EmailTemplatesPage';

const state = vi.hoisted(() => ({ templates: [] as Record<string, unknown>[], language: 'en' }));

vi.mock('@attraccess/react-query-client', () => ({
  useEmailTemplateControllerFindAll: () => ({ data: state.templates }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${values.plugin}` : key),
    language: state.language,
  }),
}));

const core = (type: string) => ({ type, subject: `${type} subject` });
const fromPlugin = (plugin: string, id: string, label: { en: string; de: string }) => ({
  type: `plugin.${plugin}.${id}`,
  subject: `${id} subject`,
  plugin: { name: plugin, label },
});

const rows = () => screen.getAllByRole('row').slice(1);

describe('EmailTemplatesPage', () => {
  afterEach(() => {
    cleanup();
    state.language = 'en';
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <EmailTemplatesPage />
      </MemoryRouter>,
    );

  it('lists plugin templates after the core ones, grouped by plugin, labelled with the plugin name', () => {
    state.templates = [
      fromPlugin('reservations', 'no-show', { en: 'No-show', de: 'Nicht erschienen' }),
      core('verify-email'),
      fromPlugin('abc', 'x', { en: 'Zed', de: 'Zed' }),
      fromPlugin('reservations', 'confirmed', { en: 'Confirmed', de: 'Bestätigt' }),
      core('reset-password'),
    ];
    renderPage();

    const text = rows().map((row) => row.textContent ?? '');
    expect(text[0]).toContain('templateTypes.verify-email');
    expect(text[1]).toContain('templateTypes.reset-password');
    expect(text[2]).toContain('Zed');
    expect(text[2]).toContain('pluginChip:abc');
    expect(text[3]).toContain('Confirmed');
    expect(text[4]).toContain('No-show');
    expect(text[3]).toContain('pluginChip:reservations');
    expect(text[0]).not.toContain('pluginChip');
  });

  it('opens the editor from the row actions', async () => {
    state.templates = [core('verify-email'), core('reset-password')];
    render(
      <MemoryRouter initialEntries={['/settings/email/templates']}>
        <Routes>
          <Route path="/settings/email/templates" element={<EmailTemplatesPage />} />
          <Route path="/settings/email/templates/:type" element={<p>editor</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for templateTypes.verify-email' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'editButton' }));
    expect(await screen.findByText('editor')).toBeInTheDocument();
  });

  it('shows the plugin label in the interface language', () => {
    state.language = 'de';
    state.templates = [fromPlugin('reservations', 'confirmed', { en: 'Confirmed', de: 'Bestätigt' })];
    renderPage();
    expect(rows()[0]).toHaveTextContent('Bestätigt');
  });
});
