import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SecureReaderButton } from './SecureReaderButton';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('SecureReaderButton', () => {
  it('names the reasons on a press too, for touch screens where nothing hovers', async () => {
    const { container } = render(<SecureReaderButton blockers={['reader-offline']} onPress={vi.fn()} />);
    expect(screen.queryByText('blocker.reader-offline')).not.toBeInTheDocument();
    await userEvent.click(container.querySelector('[data-cy=secure-conversion-button-blocked]') as HTMLElement);
    expect(await screen.findByText('blocker.reader-offline')).toBeInTheDocument();
  });
});
