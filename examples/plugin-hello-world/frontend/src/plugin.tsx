// Hello World example frontend plugin.
//
// A frontend plugin is an ES module exposing a default-exported class that
// implements `AttraccessFrontendPlugin`. The host loads it as a Vite module
// federation remote (exposing `./plugin`) and:
//   - calls `getRoutes()` to merge the plugin's pages into the app router, and
//   - calls `getSidebarItems()` to add navigation entries to the app sidebar.
// See ../vite.config.ts for the build.
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// The endpoint the example backend plugin adds to the host API.
const GREETINGS_ENDPOINT = '/api/hello-world/greetings';

// A tiny inline icon so the plugin keeps zero extra runtime dependencies — the
// host renders whatever ReactNode the sidebar item provides.
function WaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 11V7a2 2 0 0 1 4 0v3" />
      <path d="M11 9V5a2 2 0 0 1 4 0v5" />
      <path d="M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L2 16a2 2 0 0 1 3.4-2L7 16" />
    </svg>
  );
}

const card: React.CSSProperties = {
  border: '1px solid rgba(127,127,127,0.25)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'rgba(127,127,127,0.06)',
};

// Shared shell so both pages get the title, intro and cross-links.
function PluginShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '2rem', maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.25rem' }}>
        <WaveIcon />
        <h1 style={{ margin: 0 }}>{title}</h1>
      </div>
      <nav style={{ display: 'flex', gap: '1rem', margin: '0.75rem 0 1.5rem' }}>
        <Link to="/hello-world" data-cy="hello-world-nav-greetings">Greetings</Link>
        <Link to="/hello-world/capabilities" data-cy="hello-world-nav-capabilities">Capabilities</Link>
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
      <div data-cy="hello-world-plugin-page" style={card}>
        <h2 style={{ marginTop: 0 }}>Greetings from the backend</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Served by the plugin's NestJS controller at <code>GET /hello-world/greetings</code>, which reads
          host users through an injected repository (needs the <code>READ_USERS</code> permission).
        </p>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#e5484d' }}>Failed to load greetings: {error}</p>}
        {!loading && !error && (
          <ul data-cy="hello-world-greetings" style={{ marginBottom: 0 }}>
            {greetings.map((greeting) => (
              <li key={greeting}>{greeting}</li>
            ))}
          </ul>
        )}
      </div>
    </PluginShell>
  );
}

// Page 2: a static showcase of the capabilities the example exercises.
function CapabilitiesPage() {
  const items = [
    { title: 'Backend controller', body: 'Adds GET /hello-world/greetings to the host API.' },
    { title: 'Injected repository', body: "Reads users via context.getRepository('User') (needs READ_USERS)." },
    { title: 'Typed event handler', body: 'Subscribes to RESOURCE_USAGE_STARTED via context.onEvent (needs LISTEN_EVENTS).' },
    { title: 'Frontend route', body: 'Registers the /hello-world pages through getRoutes().' },
    { title: 'Sidebar entry', body: 'Contributes this navigation item through getSidebarItems().' },
  ];

  return (
    <PluginShell title="Hello World — Capabilities">
      <div
        data-cy="hello-world-capabilities-page"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}
      >
        {items.map((item) => (
          <div key={item.title} style={card}>
            <h3 style={{ margin: '0 0 0.4rem' }}>{item.title}</h3>
            <p style={{ margin: 0, opacity: 0.8, fontSize: 14 }}>{item.body}</p>
          </div>
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
  // user can actually open it.
  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'Hello World',
        path: '/hello-world',
        icon: <WaveIcon />,
      },
    ];
  }
}
