import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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

/** Renders `/settings` inside a router that also serves the section paths, so a redirect is visible. */
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

  it('redirects to the first permitted section on desktop', () => {
    mockPermissions(['system.settings.manage']);
    mockViewport(true);

    renderIndex();

    expect(screen.getByText('general page')).toBeInTheDocument();
  });

  it('lists the sections instead of redirecting on a phone', () => {
    mockPermissions(['system.settings.manage']);
    mockViewport(false);

    renderIndex();

    expect(screen.queryByText('general page')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sections\.general/ })).toHaveAttribute('href', '/settings/general');
    expect(screen.getByRole('link', { name: /sections\.monitoring/ })).toHaveAttribute('href', '/settings/monitoring');
  });

  it('renders no section list at all when the operator may open none of them', () => {
    // The redirect must not fire either — there is nowhere permitted to send them.
    mockPermissions([]);
    mockViewport(true);

    renderIndex();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SettingsLayout rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewport(true);
  });

  function renderRail(at: string) {
    return render(
      <MemoryRouter initialEntries={[at]}>
        <SettingsLayout>
          <div>section body</div>
        </SettingsLayout>
      </MemoryRouter>,
    );
  }

  it('marks the active section with aria-current', () => {
    mockPermissions(['system.settings.manage']);

    renderRail('/settings/monitoring');

    expect(screen.getByRole('link', { name: 'sections.monitoring.label' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'sections.general.label' })).not.toHaveAttribute('aria-current');
  });

  it('hides sections the operator lacks permission for, and their now-empty group', () => {
    mockPermissions([]);

    renderRail('/settings/general');

    expect(screen.queryByRole('link', { name: 'sections.general.label' })).not.toBeInTheDocument();
    expect(screen.queryByText('groups.instance')).not.toBeInTheDocument();
    expect(screen.getByText('section body')).toBeInTheDocument();
  });
});
