import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers, ThemeToggle, useAppTheme } from '@attraccess/ui';
import { ToastProvider } from './toastProvider';
import { toast } from 'sonner';

function EditorAppearance() {
  const { resolvedTheme } = useAppTheme();
  return <output aria-label="Editor appearance">{resolvedTheme}</output>;
}

function renderTheme() {
  return render(
    <StrictMode>
      <Providers>
        <ThemeToggle label="Dark mode" />
        <ThemeToggle label="Second dark mode control" />
        <input aria-label="Unsaved draft" defaultValue="Saved content" />
        <EditorAppearance />
        <ToastProvider>
          <span>Application</span>
        </ToastProvider>
      </Providers>
    </StrictMode>,
  );
}

function expectTheme(theme: 'light' | 'dark') {
  expect(document.documentElement).toHaveClass(theme);
  expect(document.documentElement).not.toHaveClass(theme === 'light' ? 'dark' : 'light');
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(document.documentElement.style.colorScheme).toBe(theme);
  expect(screen.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    String(theme === 'dark'),
  );
  expect(screen.getByLabelText('Editor appearance')).toHaveTextContent(theme);
}

describe('Application appearance', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light unrelated-class';
  });

  afterEach(() => {
    act(() => toast.dismiss());
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light even on a dark operating system', () => {
    const media = window.matchMedia('');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
    renderTheme();
    expectTheme('light');
  });

  it('honors saved dark mode through StrictMode and remounts', () => {
    localStorage.setItem('heroui-theme', 'dark');
    const view = renderTheme();
    expectTheme('dark');
    expect(document.documentElement).toHaveClass('unrelated-class');
    view.unmount();
    renderTheme();
    expectTheme('dark');
    expect(localStorage.getItem('heroui-theme')).toBe('dark');
  });

  it('synchronizes controls and integrations without discarding a draft', async () => {
    const user = userEvent.setup();
    renderTheme();
    await user.type(screen.getByLabelText('Unsaved draft'), ' plus unsaved edits');
    await user.click(screen.getByRole('button', { name: 'Dark mode', exact: true }));
    expectTheme('dark');
    expect(screen.getByRole('button', { name: 'Second dark mode control' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('heroui-theme')).toBe('dark');
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Saved content plus unsaved edits');
    await user.click(screen.getByRole('button', { name: 'Second dark mode control' }));
    expectTheme('light');
    expect(localStorage.getItem('heroui-theme')).toBe('light');
  });

  it('falls back safely for an invalid saved value', () => {
    localStorage.setItem('heroui-theme', 'invalid');
    renderTheme();
    expectTheme('light');
  });

  it('can toggle for the current session when storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    });
    renderTheme();
    expectTheme('light');
    await userEvent.click(screen.getByRole('button', { name: 'Dark mode', exact: true }));
    expectTheme('dark');
  });

  it('updates a visible toast without removing its content', async () => {
    renderTheme();
    act(() => toast.info('Appearance updated', { description: 'Your draft is unchanged.', duration: Infinity }));
    await screen.findByText('Appearance updated');
    expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'light');
    await userEvent.click(screen.getByRole('button', { name: 'Dark mode', exact: true }));
    expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark');
    expect(screen.getByText('Your draft is unchanged.')).toBeInTheDocument();
  });

  it('synchronizes a preference changed or cleared in another tab', () => {
    renderTheme();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'heroui-theme', newValue: 'dark' })));
    expectTheme('dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'light' })));
    expectTheme('dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expectTheme('light');
  });

  it('resolves existing system preferences and follows OS changes', () => {
    const media = Object.assign(new EventTarget(), {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    localStorage.setItem('heroui-theme', 'system');
    renderTheme();
    expectTheme('light');
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    expectTheme('dark');
    expect(localStorage.getItem('heroui-theme')).toBe('system');
  });

  it('supports keyboard activation without submitting its containing form', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <Providers>
        <form onSubmit={submit}>
          <ThemeToggle label="Dark mode" />
        </form>
      </Providers>,
    );
    screen.getByRole('button', { name: 'Dark mode' }).focus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(submit).not.toHaveBeenCalled();
  });
});
