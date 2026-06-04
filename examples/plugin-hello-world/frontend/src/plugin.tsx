// Hello World example frontend plugin.
//
// A frontend plugin is an ES module exposing a default-exported class that
// implements `AttraccessFrontendPlugin`. The host loads it as a Vite module
// federation remote (exposing `./plugin`) and:
//   - calls `getRoutes()` to merge the plugin's pages into the app router, and
//   - calls `getSidebarItems()` to add navigation entries to the app sidebar.
// See ../vite.config.ts for the build.
//
// RECOMMENDED: build your UI with the host's own libraries so plugins look
// native and inherit light/dark theming for free. The host shares `@heroui/react`
// (its component kit) and we share `lucide-react` (its icon set) through module
// federation — see ../vite.config.ts. Importing them here means the host serves
// the single copy it already ships, so the plugin bundle stays tiny and every
// HeroUI component picks up the host's active theme automatically.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Card,
  Chip,
  Spinner,
} from '@heroui/react';
import {
  BellIcon,
  DatabaseIcon,
  HandIcon,
  PanelLeftIcon,
  RouteIcon,
  ServerIcon,
} from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// The endpoint the example backend plugin adds to the host API.
const GREETINGS_ENDPOINT = '/api/hello-world/greetings';

// Shared shell so both pages get the title, intro and cross-links. Tailwind
// utility classes (`text-default-*`, `border-default-*`, …) resolve against the
// host's compiled stylesheet because the plugin renders inside the host DOM, so
// spacing and colours match the rest of the app in both light and dark mode.
function PluginShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <HandIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold text-default-800">{title}</h1>
      </div>
      <nav className="flex gap-2">
        <Button as={Link} to="/hello-world" variant="ghost" size="sm" data-cy="hello-world-nav-greetings">
          Greetings
        </Button>
        <Button
          as={Link}
          to="/hello-world/capabilities"
          variant="ghost"
          size="sm"
          data-cy="hello-world-nav-capabilities"
        >
          Capabilities
        </Button>
      </nav>
      {children}
    </div>
  );
}

// Page 1: calls the example backend endpoint and renders the live result.
function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cookies carry the session, so just include credentials.
    fetch(GREETINGS_ENDPOINT, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { greetings: string[] }) => setGreetings(data.greetings))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PluginShell title="Hello World">
      <Card data-cy="hello-world-plugin-page" className="border border-default-200 dark:border-default-100">
        <Card.Header className="flex flex-col items-start gap-1">
          <p className="text-base font-semibold text-default-700">Greetings from the backend</p>
          <p className="text-sm text-default-500">
            Served by the plugin's NestJS controller at <code>GET /hello-world/greetings</code>, which reads host
            users through an injected repository (needs the <code>READ_USERS</code> permission).
          </p>
        </Card.Header>
        <Card.Content>
          {loading && (
            <div className="flex items-center gap-2 text-default-500">
              <Spinner size="sm" /> Loading…
            </div>
          )}
          {error && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription>Failed to load greetings: {error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          {!loading && !error && (
            <ul data-cy="hello-world-greetings" className="flex flex-col gap-2">
              {greetings.map((greeting) => (
                <li key={greeting}>
                  <Chip color="accent" variant="soft">
                    {greeting}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>
    </PluginShell>
  );
}

// Page 2: a static showcase of the capabilities the example exercises.
function CapabilitiesPage() {
  const items: { title: string; body: string; icon: ComponentType<{ className?: string }> }[] = [
    { title: 'Backend controller', body: 'Adds GET /hello-world/greetings to the host API.', icon: ServerIcon },
    {
      title: 'Injected repository',
      body: "Reads users via context.getRepository('User') (needs READ_USERS).",
      icon: DatabaseIcon,
    },
    {
      title: 'Typed event handler',
      body: 'Subscribes to RESOURCE_USAGE_STARTED via context.onEvent (needs LISTEN_EVENTS).',
      icon: BellIcon,
    },
    { title: 'Frontend route', body: 'Registers the /hello-world pages through getRoutes().', icon: RouteIcon },
    {
      title: 'Sidebar entry',
      body: 'Contributes this navigation item through getSidebarItems().',
      icon: PanelLeftIcon,
    },
  ];

  return (
    <PluginShell title="Hello World — Capabilities">
      <div
        data-cy="hello-world-capabilities-page"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {items.map((item) => (
          <Card key={item.title} className="border border-default-200 dark:border-default-100">
            <Card.Header className="flex flex-row items-center gap-2">
              <item.icon className="w-5 h-5 text-primary" />
              <p className="text-base font-semibold text-default-700">{item.title}</p>
            </Card.Header>
            <Card.Content>
              <p className="text-sm text-default-500">{item.body}</p>
            </Card.Content>
          </Card>
        ))}
      </div>
    </PluginShell>
  );
}

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

  // Contribute a sidebar entry that links to the plugin's landing page. The
  // host gates it behind the target route's auth, so it only shows when the
  // user can actually open it. The icon is a lucide-react glyph — the same set
  // the host sidebar uses — so it lines up visually with the built-in entries.
  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'Hello World',
        path: '/hello-world',
        icon: <HandIcon className="w-5 h-5" />,
      },
    ];
  }
}
