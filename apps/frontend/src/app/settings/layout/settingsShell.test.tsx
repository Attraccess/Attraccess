import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemPermission } from '@attraccess/shared';
import { useAuth } from '../../../hooks/useAuth';
import { SettingsIndexPage } from './SettingsIndexPage';
import { SettingsLayout } from './SettingsLayout';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../../components/pageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function mockPermissions(granted: SystemPermission[]) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission: (permission: SystemPermission) => granted.includes(permission),
  } as ReturnType<typeof useAuth>);
}

function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: isDesktop,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Renders the directory with a section destination for navigation checks. */
function renderIndex() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsIndexPage />} />
        <Route path="/settings/general" element={<div>general page</div>} />
        <Route path="/settings/monitoring" element={<div>monitoring page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsIndexPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the shared directory on desktop and opens a section', () => {
    mockPermissions(['system.settings.manage']);
    mockViewport(true);

    renderIndex();

    expect(screen.getByRole('searchbox', { name: 'search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sections\.general/ })).toHaveAttribute('href', '/settings/general');
    fireEvent.click(screen.getByRole('link', { name: /sections\.general/ }));
    expect(screen.getByText('general page')).toBeInTheDocument();
  });

  it('lists and filters the sections on a phone', () => {
    mockPermissions(['system.settings.manage']);
    mockViewport(false);

    renderIndex();

    expect(screen.queryByText('general page')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sections\.general/ })).toHaveAttribute('href', '/settings/general');
    expect(screen.getByRole('link', { name: /sections\.monitoring/ })).toHaveAttribute('href', '/settings/monitoring');
    fireEvent.change(screen.getByRole('searchbox', { name: 'search' }), { target: { value: 'monitoring' } });
    expect(screen.queryByRole('link', { name: /sections\.general/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sections\.monitoring/ })).toBeInTheDocument();
  });

  it('renders no section list at all when the operator may open none of them', () => {
    mockPermissions([]);
    mockViewport(true);

    renderIndex();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SettingsLayout back navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewport(true);
  });

  function renderSection(at: string) {
    return render(
      <MemoryRouter initialEntries={[at]}>
        <SettingsLayout>
          <div>section body</div>
        </SettingsLayout>
      </MemoryRouter>,
    );
  }

  it('links back to the directory on desktop', () => {
    mockPermissions(['system.settings.manage']);

    renderSection('/settings/monitoring');

    expect(screen.getByRole('link', { name: 'backToSettings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('section body')).toBeInTheDocument();
  });

  it('keeps the back link on a section with narrower permissions', () => {
    mockPermissions([]);

    renderSection('/settings/general');

    expect(screen.getByRole('link', { name: 'backToSettings' })).toBeInTheDocument();
    expect(screen.getByText('section body')).toBeInTheDocument();
  });
});
