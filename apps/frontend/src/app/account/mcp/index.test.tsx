// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { McpConnectionCard } from './index';
import en from './en.json';
import de from './de.json';

const state = vi.hoisted(() => ({ toast: vi.fn(), clipboard: vi.fn() }));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: state.clipboard }, configurable: true });
});
afterEach(cleanup);

const HTTPS = { url: 'https://attraccess.example/api/mcp', oauthEnabled: true };
const LAN = { url: 'http://192.168.1.50:3000/api/mcp', oauthEnabled: false };

it('shows the server URL and copies it', async () => {
  state.clipboard.mockResolvedValue(undefined);
  render(<McpConnectionCard connection={HTTPS} canUseApiTokens />);
  expect((screen.getByLabelText('urlLabel') as HTMLInputElement).value).toBe(HTTPS.url);
  await userEvent.click(screen.getByRole('button', { name: 'copy' }));
  expect(state.clipboard).toHaveBeenCalledWith(HTTPS.url);
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'copied', type: 'success' }));
});

it('reports a failed copy', async () => {
  state.clipboard.mockRejectedValue(new Error('denied'));
  render(<McpConnectionCard connection={HTTPS} canUseApiTokens />);
  await userEvent.click(screen.getByRole('button', { name: 'copy' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'copyFailed', type: 'error' }));
});

it.each([
  { name: 'both ways on https', connection: HTTPS, tokens: true, expected: ['signIn.oauth', 'signIn.apiToken'] },
  { name: 'OAuth only without the API-token permission', connection: HTTPS, tokens: false, expected: ['signIn.oauth'] },
  {
    name: 'API tokens only, with the reason, on plain HTTP',
    connection: LAN,
    tokens: true,
    expected: ['signIn.apiToken', 'signIn.oauthUnavailable'],
  },
])('describes $name', ({ connection, tokens, expected }) => {
  render(<McpConnectionCard connection={connection} canUseApiTokens={tokens} />);
  for (const key of ['signIn.oauth', 'signIn.apiToken', 'signIn.oauthUnavailable']) {
    expect(Boolean(screen.queryByText(key))).toBe(expected.includes(key));
  }
});

it('links to the MCP docs page in the reader’s language', () => {
  render(<McpConnectionCard connection={HTTPS} canUseApiTokens />);
  expect(screen.getByRole('link', { name: /docs/ }).getAttribute('href')).toBe('docsUrl');
  expect(en.docsUrl).toBe('https://docs.attraccess.org/#/en/developer/mcp');
  expect(de.docsUrl).toBe('https://docs.attraccess.org/#/de/developer/mcp');
  expect(Object.keys(de.signIn).sort()).toEqual(Object.keys(en.signIn).sort());
});
