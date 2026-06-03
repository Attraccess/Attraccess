// Hello World example frontend plugin.
//
// A frontend plugin is an ES module exposing a default-exported class that
// implements `AttraccessFrontendPlugin`. The host loads it as a Vite module
// federation remote (exposing `./plugin`) and calls `getRoutes()` to merge the
// plugin's pages into the app router. See ../vite.config.ts for the build.
import type { AttraccessFrontendPlugin, AttraccessFrontendPluginAuthData, RouteConfig } from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';

// The endpoint the example backend plugin adds to the host API.
const GREETINGS_ENDPOINT = '/api/hello-world/greetings';

function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cookies carry the session, so just include credentials.
    fetch(GREETINGS_ENDPOINT, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { greetings: string[] }) => setGreetings(data.greetings))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div style={{ padding: '2rem' }} data-cy="hello-world-plugin-page">
      <h1>Hello World Plugin</h1>
      <p>Greetings served by the example backend plugin:</p>
      {error && <p style={{ color: 'red' }}>Failed to load greetings: {error}</p>}
      <ul>
        {greetings.map((greeting) => (
          <li key={greeting}>{greeting}</li>
        ))}
      </ul>
    </div>
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
    ];
  }
}
