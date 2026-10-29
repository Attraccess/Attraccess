import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './index';

vi.mock('../../i18n', () => ({
  useTranslations: () => ({ t: (key: string) => (key === 'more' ? 'More actions' : key), language: 'en' }),
}));

function renderAt(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/current']}>
      <Routes>
        <Route path="/current" element={ui} />
        <Route path="/previous" element={<p>Previous page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PageHeader', () => {
  it('renders the title as the page heading and a string subtitle as text', () => {
    renderAt(<PageHeader title="Devices" subtitle="All registered devices" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByText('All registered devices').tagName).toBe('P');
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });

  it('renders a node subtitle, an icon and a thumbnail', () => {
    renderAt(
      <PageHeader
        title="Device"
        subtitle={<span>WAGO / Hall</span>}
        icon={<svg data-testid="icon" />}
        thumbnailSrc="/thumb.png"
        thumbnailAlt="Device photo"
        noMargin
      />,
    );

    expect(screen.getByText('WAGO / Hall').parentElement?.tagName).toBe('DIV');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Device photo' })).toHaveAttribute('src', '/thumb.png');
  });

  it('navigates to backTo when the back button is pressed', async () => {
    const user = userEvent.setup();
    renderAt(<PageHeader title="Details" backTo="/previous" />);

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(screen.getByText('Previous page')).toBeInTheDocument();
  });

  it('calls onBack when there is no backTo', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderAt(<PageHeader title="Details" onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows visible actions and hides the action area when all are hidden', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const { unmount } = renderAt(
      <PageHeader title="Devices" actions={[{ key: 'add', label: 'Add device', onPress }]} />,
    );

    await user.click(screen.getByRole('button', { name: 'Add device' }));
    expect(onPress).toHaveBeenCalled();
    unmount();

    renderAt(<PageHeader title="Devices" actions={[{ key: 'add', label: 'Add device', onPress, isHidden: true }]} />);
    expect(screen.queryByRole('button', { name: 'Add device' })).toBeNull();
  });
});
