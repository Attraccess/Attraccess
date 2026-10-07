import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { PluginSidebarPlacementTestScope } from './sidebar.test';
export function registerSharesAGroupAcrossPluginsProviderFirstProviderFirstCollapsedCollapsed(
  scope: PluginSidebarPlacementTestScope,
): void {
  it.each([
    { providerFirst: true, collapsed: false },
    { providerFirst: false, collapsed: false },
    { providerFirst: true, collapsed: true },
    { providerFirst: false, collapsed: true },
  ])(
    'shares a group across plugins (provider first: $providerFirst, collapsed: $collapsed)',
    async ({ providerFirst, collapsed }) => {
      const provider = {
        plugin: {
          getPluginName: () => '3d-printer',
          getSidebarGroups: () => [{ id: '3d-printer', label: '3D Printers' }],
        },
      };
      const consumer = {
        plugin: {
          getPluginName: () => 'bambulab',
          getSidebarItems: () => [{ label: 'BambuLab', path: '/printers/bambulab', group: '3d-printer' }],
        },
      };
      scope.state.plugins = providerFirst ? [provider, consumer] : [consumer, provider];
      const user = userEvent.setup();
      scope.renderSidebar(collapsed);

      expect(screen.queryByRole('link', { name: 'BambuLab' })).not.toBeInTheDocument();
      const trigger = screen.getByRole('button', { name: '3D Printers' });
      await user.click(trigger);

      if (collapsed) {
        const menu = screen.getByRole('menu', { name: '3D Printers' });
        await user.click(within(menu).getByRole('menuitem', { name: 'BambuLab' }));
        expect(screen.getByLabelText('Current path')).toHaveTextContent('/printers/bambulab');
      } else {
        const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
        if (!panel) throw new Error('Shared plugin group panel is missing');
        expect(within(panel).getByRole('link', { name: 'BambuLab' })).toHaveAttribute('href', '/printers/bambulab');
      }
    },
  );
}
