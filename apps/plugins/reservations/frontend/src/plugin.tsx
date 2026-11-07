// Reservations plugin — frontend half. The UI (resource card, booking modal,
// my/manage pages, settings slots) is added on top of this scaffold.
import './styles.css';
import type { AttraccessFrontendPlugin, AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';

export default class ReservationsPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'reservations-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(_store: IPluginStore): void {
    // No setup needed.
  }

  activate(): void {
    // Called when the plugin is installed into the store.
  }

  deactivate(): void {
    // Called when the plugin is uninstalled.
  }

  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {
    // no-op
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }
}
