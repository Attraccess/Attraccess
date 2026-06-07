// RabbitMQ management plugin — frontend half (scaffold).
//
// Foundation bootstrap (ATT-526): a minimal frontend remote that registers one
// route and a sidebar entry so the federation build is exercised end to end. The
// actual management UI lands in ATT-521+.
import { Card } from '@heroui/react';
import { RabbitIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';

function RabbitmqPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <RabbitIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold text-default-800">RabbitMQ</h1>
      </div>
      <Card className="border border-default-200 dark:border-default-100">
        <Card.Content>
          <p className="text-sm text-default-500">
            RabbitMQ management plugin scaffold. Management features are coming soon.
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

export default class RabbitmqPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'rabbitmq-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(_store: IPluginStore): void {
    // No setup needed for the scaffold.
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

  getRoutes(): RouteConfig[] {
    // Same access level as the host MQTT servers settings page.
    return [{ path: '/rabbitmq', authRequired: 'canManageResources', element: <RabbitmqPage /> }];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'RabbitMQ',
        path: '/rabbitmq',
        icon: <RabbitIcon className="w-5 h-5" />,
      },
    ];
  }
}
