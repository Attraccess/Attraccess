import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePwaUpdateStore } from '../pwa-update/updateController';
import { useInstallPromptStore, type BeforeInstallPromptEvent } from './installPrompt';
import { InstallAppButton } from './InstallAppButton';
import { InstallAppPrompts } from './InstallAppPrompts';

function storePrompt() {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
  }) as BeforeInstallPromptEvent;
  act(() => useInstallPromptStore.setState({ deferredPrompt: event }));
  return event;
}

beforeEach(() => {
  useInstallPromptStore.setState({ deferredPrompt: null, isIosHelpOpen: false, isBannerDismissed: false });
  usePwaUpdateStore.setState({ status: 'idle', progress: null });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query }) as MediaQueryList);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('InstallAppButton', () => {
  it('appears only while the app is installable and opens the browser prompt', async () => {
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();

    const event = storePrompt();
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  });
});

describe('InstallAppPrompts', () => {
  it('shows nothing while the app cannot be installed', () => {
    render(<InstallAppPrompts />);
    expect(screen.queryByRole('region', { name: 'Install Attraccess' })).toBeNull();
  });

  it('offers a small banner that installs and then goes away', async () => {
    render(<InstallAppPrompts />);
    const event = storePrompt();

    expect(screen.getByRole('region', { name: 'Install Attraccess' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Install Attraccess' })).toBeNull();
  });

  it('snoozes the banner on "Not now" while keeping the prompt for the on-demand action', async () => {
    render(
      <>
        <InstallAppPrompts />
        <InstallAppButton />
      </>,
    );
    const event = storePrompt();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('region', { name: 'Install Attraccess' })).toBeNull();
    expect(event.prompt).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  });

  it('steps aside on phones while the update indicator is showing', () => {
    render(<InstallAppPrompts />);
    storePrompt();
    expect(screen.getByRole('region', { name: 'Install Attraccess' })).not.toHaveClass('max-sm:hidden');

    act(() => usePwaUpdateStore.setState({ status: 'ready' }));
    expect(screen.getByRole('region', { name: 'Install Attraccess' })).toHaveClass('max-sm:hidden');
  });

  it('explains Add to Home Screen in Safari on iOS and snoozes the banner', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    );
    render(<InstallAppPrompts />);

    await userEvent.click(screen.getByRole('button', { name: 'Show me how' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Add to Home Screen');
    expect(useInstallPromptStore.getState().isBannerDismissed).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useInstallPromptStore.getState().isIosHelpOpen).toBe(false);
  });
});
