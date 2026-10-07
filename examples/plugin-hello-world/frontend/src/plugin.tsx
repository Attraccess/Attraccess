// Hello World example frontend plugin.
//
// A frontend plugin is an ES module exposing a default-exported class that
// implements `AttraccessFrontendPlugin`. The host loads it as a Vite module
// federation remote (exposing `./plugin`) and:
//   - calls `getRoutes()` to merge the plugin's pages into the app router,
//   - calls `getSidebarGroups()` to declare the plugin's navigation group, and
//   - calls `getSidebarItems()` to add navigation entries to the app sidebar.
// See ../vite.config.ts for the build.
//
// RECOMMENDED: build your UI with the host's own libraries so plugins look
// native and inherit light/dark theming for free. The host shares `@heroui/react`
// (its component kit) and we share `lucide-react` (its icon set) through module
// federation — see ../vite.config.ts. Importing them here means the host serves
// the single copy it already ships, so the plugin bundle stays tiny and every
// HeroUI component picks up the host's active theme automatically.
import './styles.css';
import { HandIcon, PlugIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarGroup,
  PluginSidebarItem,
  PluginSlotContribution,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { HelloWorldPage } from './plugin.helpers';
import { CapabilitiesPage } from './plugin.helpers';
import { MQTT_SERVER_DETAIL_SLOT } from './plugin.state';
import { MQTT_SERVER_LIST_ROW_SLOT } from './plugin.state';
import { MqttServerSlotContext } from './plugin.mqtt-server-slot-context';
import { MqttServerDetailExtension } from './plugin.helpers';
import { MqttServerListBadge } from './plugin.helpers';

// The SDK's ready-made client: the host's API origin, the session cookie and
// JSON/error handling are already wired up, so plugins never build their own.
// Shared shell so both pages get the title, intro and cross-links. Tailwind
// utility classes (`text-default-*`, `border-default-*`, …) resolve against the
// host's compiled stylesheet because the plugin renders inside the host DOM, so
// spacing and colours match the rest of the app in both light and dark mode.
// Page 1: calls the example backend endpoint and renders the live result.
// Page 2: a static showcase of the capabilities the example exercises.
// Host slot ids exposed by the MQTT UI. These are documented host strings (the
// SDK is vendor-agnostic and does not export them, and the host owns them in
// apps/frontend, which a plugin cannot import — so a plugin restates them, the
// same way it restates a route `path` it links to). Both slots receive
// `{ mqttServerId }`, declared here so each `render` is typed end-to-end with
// no runtime casting.
// The context shape the host documents for both MQTT slots.
// Embedded into the MQTT server detail view through the generic slot mechanism.
// Reads the host-supplied context to scope itself to the selected server.
// Embedded into each MQTT server list row through the per-row slot.

export default class HelloWorldPlugin implements AttraccessFrontendPlugin {
  // react-pluggable plumbing — a stable, unique name and (here) no dependencies.
  getPluginName(): string {
    return 'hello-world-plugin@1.0.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(_pluginStore: IPluginStore): void {
    // No setup needed for this example.
  }

  activate(): void {
    // Called when the plugin is installed into the store.
  }

  deactivate(): void {
    // Called when the plugin is uninstalled.
  }

  // The host pushes auth + API endpoint changes to every plugin; this example
  // reads greetings via a relative URL, so it does not need to react to them.
  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {
    // no-op
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  // Contribute pages to the app router. `authRequired: true` means any
  // logged-in user can open the route.
  getRoutes(): RouteConfig[] {
    return [
      {
        path: '/hello-world',
        authRequired: true,
        element: <HelloWorldPage />,
      },
      {
        path: '/hello-world/capabilities',
        authRequired: true,
        element: <CapabilitiesPage />,
      },
    ];
  }

  getSidebarGroups(): PluginSidebarGroup[] {
    return [{ id: 'hello-world', label: 'Hello World', icon: <PlugIcon size={16} aria-hidden /> }];
  }

  // Contribute an entry inside the declared group, linking to the landing page. The
  // host gates it behind the target route's auth, so it only shows when the
  // user can actually open it. The icon is a lucide-react glyph — the same set
  // the host sidebar uses — so it lines up visually with the built-in entries.
  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'Hello World',
        path: '/hello-world',
        group: 'hello-world',
        icon: <HandIcon className="hw:w-5 hw:h-5" />,
      },
    ];
  }

  // Contribute UI into the host's generic MQTT slots. The host renders each
  // contribution where it exposes the matching slot id and hands us a context
  // object (here `{ mqttServerId }`) so we can render conditionally / scoped.
  // The host stays unaware of what we render — this is the RabbitMQ-agnostic
  // extension point a real MQTT-broker plugin would build its UI on.
  getSlotContributions(): PluginSlotContribution[] {
    // Each contribution types its render against the slot's documented context
    // (MqttServerSlotContext), so `context.mqttServerId` is a number with no
    // cast. A differently-typed contribution still fits the array's element
    // type (PluginSlotContribution<PluginSlotContext>).
    const contributions: PluginSlotContribution<MqttServerSlotContext>[] = [
      {
        slotId: MQTT_SERVER_DETAIL_SLOT,
        key: 'hello-world-mqtt-detail',
        render: (context) => <MqttServerDetailExtension mqttServerId={context.mqttServerId} />,
      },
      {
        slotId: MQTT_SERVER_LIST_ROW_SLOT,
        key: 'hello-world-mqtt-list-row',
        render: (context) => <MqttServerListBadge mqttServerId={context.mqttServerId} />,
      },
    ];
    return contributions;
  }
}
