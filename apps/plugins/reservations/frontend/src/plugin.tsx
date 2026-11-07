// Reservations plugin — frontend half.
//
// Slots: resource.overview (bookings card), resource.settings, admin.settings, user.account.
// Routes: /reservations (my bookings), /reservations/manage, /reservations/:id (mail deep link).
import './styles.css';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { CalendarCheckIcon, CalendarClockIcon } from 'lucide-react';
import {
  ADMIN_SETTINGS_SLOT,
  RESOURCE_OVERVIEW_SLOT,
  RESOURCE_SETTINGS_SLOT,
  USER_ACCOUNT_SLOT,
  type AttraccessFrontendPlugin,
  type AttraccessFrontendPluginAuthData,
  type PluginSidebarItem,
  type PluginSlotContribution,
  type ResourceSlotContext,
  type RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { PluginStore } from 'react-pluggable';
import { listManaged } from './api';
import de from './de.json';
import en from './en.json';
import { IcalFeeds } from './ical/IcalFeeds';
import { ReservationsCard } from './overview/ReservationsCard';
import { ManagePage } from './pages/ManagePage';
import { MyReservationsPage } from './pages/MyReservationsPage';
import { ReservationDeepLinkPage } from './pages/ReservationDeepLinkPage';
import { AdminTimezoneSettings } from './settings/AdminTimezoneSettings';
import { ResourceSettingsForm } from './settings/ResourceSettingsForm';

// The UI language the app is showing right now (the account's locale once the user is signed in),
// read each time the host asks for items, not the browser/stored guess `detectLanguage()` returns.
const labels = () => (useTranslationState.getState().language === 'de' ? de : en);

export default class ReservationsPlugin implements AttraccessFrontendPlugin {
  // Users who manage reservations: resources.update holders at once, maintainers/introducers
  // once the manage endpoint has answered (it is expected to reply 403 to everyone else).
  pluginStore!: PluginStore;
  private isManager = false;
  private readonly sidebarListeners = new Set<() => void>();

  getPluginName(): string {
    return 'reservations-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(store: PluginStore): void {
    this.pluginStore = store;
  }

  activate(): void {
    // Called when the plugin is installed into the store.
  }

  deactivate(): void {
    // Called when the plugin is uninstalled.
  }

  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void {
    const user = authData?.user as { effectivePermissions?: string[] } | null | undefined;
    this.setManager(user?.effectivePermissions?.includes('resources.update') ?? false);
    if (!user || this.isManager) return;
    void listManaged({ page: 1 })
      .then(() => this.setManager(true))
      .catch(() => this.setManager(false));
  }

  /** The host reads the sidebar items again when this changes (it re-reads them on login but not after an async check). */
  onSidebarItemsChange(listener: () => void): () => void {
    this.sidebarListeners.add(listener);
    return () => this.sidebarListeners.delete(listener);
  }

  private setManager(value: boolean): void {
    if (value === this.isManager) return;
    this.isManager = value;
    this.sidebarListeners.forEach((listener) => listener());
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  getRoutes(): RouteConfig[] {
    // Specific paths first; `/reservations/:id` is the mail deep link (needs a session; the host
    // shows its normal login for anonymous visitors and renders the page afterwards).
    return [
      { path: '/reservations', authRequired: true, element: <MyReservationsPage /> },
      { path: '/reservations/manage', authRequired: true, element: <ManagePage /> },
      { path: '/reservations/:id', authRequired: true, element: <ReservationDeepLinkPage /> },
    ];
  }

  getSidebarItems(): PluginSidebarItem[] {
    const text = labels().sidebar;
    const items: PluginSidebarItem[] = [
      { label: text.my, path: '/reservations', icon: <CalendarClockIcon className="rv:w-5 rv:h-5" /> },
    ];
    if (this.isManager) {
      items.push({
        label: text.manage,
        path: '/reservations/manage',
        icon: <CalendarCheckIcon className="rv:w-5 rv:h-5" />,
      });
    }
    return items;
  }

  getSlotContributions(): PluginSlotContribution[] {
    const text = labels().slots;
    const overview: PluginSlotContribution<ResourceSlotContext> = {
      slotId: RESOURCE_OVERVIEW_SLOT,
      key: 'reservations-overview',
      render: ({ resourceId }) => <ReservationsCard resourceId={resourceId} />,
    };
    const settings: PluginSlotContribution<ResourceSlotContext> = {
      slotId: RESOURCE_SETTINGS_SLOT,
      key: 'reservations-settings',
      title: text.settings,
      render: ({ resourceId }) => <ResourceSettingsForm resourceId={resourceId} />,
    };
    const admin: PluginSlotContribution = {
      slotId: ADMIN_SETTINGS_SLOT,
      key: 'reservations-admin',
      title: text.admin,
      render: () => <AdminTimezoneSettings />,
    };
    const account: PluginSlotContribution = {
      slotId: USER_ACCOUNT_SLOT,
      key: 'reservations-account',
      title: text.account,
      render: () => <IcalFeeds />,
    };
    return [overview, settings, admin, account];
  }
}
