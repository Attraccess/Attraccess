import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomLocaleModal } from './CustomLocaleModal';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({ useTranslations: () => ({ t: (key: string) => key }) }))()),
}));

describe('CustomLocaleModal', () => {
  it('opens empty again after a previous entry was cancelled', async () => {
    const onAdd = vi.fn();
    const { rerender } = render(<CustomLocaleModal isOpen onOpenChange={vi.fn()} onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText('de-CH'), 'fr-CA');
    expect(screen.getByPlaceholderText('de-CH')).toHaveValue('fr-CA');

    rerender(<CustomLocaleModal isOpen={false} onOpenChange={vi.fn()} onAdd={onAdd} />);
    rerender(<CustomLocaleModal isOpen onOpenChange={vi.fn()} onAdd={onAdd} />);

    expect(await screen.findByPlaceholderText('de-CH')).toHaveValue('');
  });

  it('adds a valid locale with Enter', async () => {
    const onAdd = vi.fn();
    render(<CustomLocaleModal isOpen onOpenChange={vi.fn()} onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText('de-CH'), ' de-CH {Enter}');

    expect(onAdd).toHaveBeenCalledWith('de-CH');
  });
});
