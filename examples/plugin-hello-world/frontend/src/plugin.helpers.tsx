import './styles.css';
import { Card } from '@heroui/react';
import { BellIcon } from 'lucide-react';
import { DatabaseIcon } from 'lucide-react';
import { PanelLeftIcon } from 'lucide-react';
import { PlugIcon } from 'lucide-react';
import { RouteIcon } from 'lucide-react';
import { ServerIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { PluginShell } from './plugin.plugin-shell';
import { Alert } from '@heroui/react';
import { AlertContent } from '@heroui/react';
import { AlertDescription } from '@heroui/react';
import { Chip } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { useEffect } from 'react';
import { useState } from 'react';
import { api } from './plugin.state';

export // Page 2: a static showcase of the capabilities the example exercises.
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
    {
      title: 'Embedded slots',
      body: 'Injects UI into the MQTT detail + list views via getSlotContributions().',
      icon: PlugIcon,
    },
  ];

  return (
    <PluginShell title="Hello World — Capabilities">
      <div data-cy="hello-world-capabilities-page" className="hw:grid hw:gap-4 hw:sm:grid-cols-2 hw:xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.title} className="hw:border hw:border-default-200 hw:dark:border-default-100">
            <Card.Header className="hw:flex hw:flex-row hw:items-center hw:gap-2">
              <item.icon className="hw:w-5 hw:h-5 hw:text-primary" />
              <p className="hw:text-base hw:font-semibold hw:text-default-700">{item.title}</p>
            </Card.Header>
            <Card.Content>
              <p className="hw:text-sm hw:text-default-500">{item.body}</p>
            </Card.Content>
          </Card>
        ))}
      </div>
    </PluginShell>
  );
}

export // Page 1: calls the example backend endpoint and renders the live result.
function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .request<{ greetings: string[] }>('/greetings')
      .then((data) => setGreetings(data.greetings))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PluginShell title="Hello World">
      <Card data-cy="hello-world-plugin-page" className="hw:border hw:border-default-200 hw:dark:border-default-100">
        <Card.Header className="hw:flex hw:flex-col hw:items-start hw:gap-1">
          <p className="hw:text-base hw:font-semibold hw:text-default-700">Greetings from the backend</p>
          <p className="hw:text-sm hw:text-default-500">
            Served by the plugin's NestJS controller at <code>GET /hello-world/greetings</code>, which reads host users
            through an injected repository (needs the <code>READ_USERS</code> permission).
          </p>
        </Card.Header>
        <Card.Content>
          {loading && (
            <div className="hw:flex hw:items-center hw:gap-2 hw:text-default-500">
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
            <ul data-cy="hello-world-greetings" className="hw:flex hw:flex-col hw:gap-2">
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

export // Embedded into the MQTT server detail view through the generic slot mechanism.
// Reads the host-supplied context to scope itself to the selected server.
function MqttServerDetailExtension({ mqttServerId }: { mqttServerId: number }) {
  return (
    <Card
      data-cy="hello-world-mqtt-detail-slot"
      className="hw:w-full hw:border hw:border-default-200 hw:dark:border-default-100"
    >
      <Card.Header className="hw:flex hw:flex-row hw:items-center hw:gap-2">
        <PlugIcon className="hw:w-5 hw:h-5 hw:text-primary" />
        <p className="hw:text-base hw:font-semibold hw:text-default-700">Hello World plugin extension</p>
      </Card.Header>
      <Card.Content>
        <p className="hw:text-sm hw:text-default-500">
          This card is injected into the MQTT server detail slot via <code>getSlotContributions()</code> — no core code
          knows about it. It is scoped to server{' '}
          <Chip color="accent" variant="soft">
            #{mqttServerId}
          </Chip>
          , passed in through the slot context.
        </p>
      </Card.Content>
    </Card>
  );
}

export // Embedded into each MQTT server list row through the per-row slot.
function MqttServerListBadge({ mqttServerId }: { mqttServerId: number }) {
  return (
    <Chip data-cy={`hello-world-mqtt-list-slot-${mqttServerId}`} color="accent" variant="soft">
      <PlugIcon className="hw:w-3.5 hw:h-3.5" />
      plugin
    </Chip>
  );
}
