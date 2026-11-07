import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  ADMIN_SETTINGS_SLOT,
  AttraccessFrontendPlugin,
  RESOURCE_SETTINGS_SLOT,
  USER_ACCOUNT_SLOT,
  type PluginSlotContribution,
} from '@attraccess/plugins-frontend-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from './plugin.state';
import { AdminSettingsPluginSlot, ResourceSettingsPluginSlot, UserAccountPluginSlot } from './PluginSettingsSlots';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => auth.permissions.has(permission) }),
}));

function install(contributions: PluginSlotContribution[]) {
  const plugin = {
    getPluginName: () => 'test-plugin',
    getSlotContributions: () => contributions,
  } as AttraccessFrontendPlugin;
  usePluginState.setState({ plugins: [{ plugin } as unknown as PluginManifestWithPlugin] });
}

const broken = (slotId: string): PluginSlotContribution => ({
  slotId,
  key: 'broken',
  render: () => {
    throw new Error('plugin failed');
  },
});

describe('plugin settings slots', () => {
  beforeEach(() => {
    auth.permissions = new Set();
    usePluginState.setState({ plugins: [] });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const cases = [
    {
      name: 'resource.settings',
      slotId: RESOURCE_SETTINGS_SLOT,
      context: { resourceId: 7 },
      permission: 'resources.update',
      title: 'resourceSettings',
      element: <ResourceSettingsPluginSlot resourceId={7} />,
    },
    {
      name: 'user.account',
      slotId: USER_ACCOUNT_SLOT,
      context: { userId: 3 },
      permission: undefined,
      title: 'userAccount',
      element: <UserAccountPluginSlot userId={3} />,
    },
    {
      name: 'admin.settings',
      slotId: ADMIN_SETTINGS_SLOT,
      context: {},
      permission: 'system.settings.manage',
      title: 'adminSettings',
      element: <AdminSettingsPluginSlot />,
    },
  ];

  describe.each(cases)('$name', ({ slotId, context, permission, title, element }) => {
    beforeEach(() => {
      if (permission) auth.permissions.add(permission);
    });

    it('renders a contribution in a titled section with its context', () => {
      const renderContribution = vi.fn(() => <div>Contribution body</div>);
      install([{ slotId, render: renderContribution }]);
      render(element);
      expect(screen.getByText('Contribution body')).toBeInTheDocument();
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(renderContribution).toHaveBeenCalledWith(context);
    });

    it('uses the contribution title when provided', () => {
      install([{ slotId, title: 'Custom title', render: () => <div>Body</div> }]);
      render(element);
      expect(screen.getByText('Custom title')).toBeInTheDocument();
    });

    it('isolates a throwing contribution, leaving no empty section', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      install([broken(slotId), { slotId, key: 'ok', render: () => <div>Working</div> }]);
      render(element);
      expect(screen.getByText('Working')).toBeInTheDocument();
      expect(screen.getAllByText(title)).toHaveLength(1);
    });

    it('renders nothing without any contribution', () => {
      const { container } = render(element);
      expect(container).toBeEmptyDOMElement();
    });

    if (permission) {
      it('renders nothing without permission', () => {
        auth.permissions.clear();
        const renderContribution = vi.fn(() => <div>Contribution body</div>);
        install([{ slotId, render: renderContribution }]);
        const { container } = render(element);
        expect(container).toBeEmptyDOMElement();
        expect(renderContribution).not.toHaveBeenCalled();
      });
    }
  });

  it('hides admin.settings from users who only see other settings sections', () => {
    auth.permissions = new Set(['system.audit.read']);
    const renderContribution = vi.fn(() => <div>Contribution body</div>);
    install([{ slotId: ADMIN_SETTINGS_SLOT, render: renderContribution }]);
    const { container } = render(<AdminSettingsPluginSlot />);
    expect(container).toBeEmptyDOMElement();
    expect(renderContribution).not.toHaveBeenCalled();
  });
});
