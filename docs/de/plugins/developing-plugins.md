# Plugins entwickeln

Attraccess-Plugins erweitern die Plattform um API-Endpunkte, Hintergrundverhalten und UI-Seiten, ohne Core-Fork. Ein Plugin kann einen **Backend**-Teil, einen **Frontend**-Teil oder beide liefern, als npm-Paket veröffentlicht und über die Admin-Seite [Plugins](plugins/installing-plugins.md) installiert.

## Klassifizierung offizieller Plugins

Plugin-Pakete sind standardmäßig Community. Attraccess markiert ein Paket nur als Official, wenn sein exakter npm-Paketname und seine Registry-Quelle in der Core-eigenen Erlaubnisliste unter `apps/api/src/plugin-system/plugin-classification.service.ts` stehen. Paketmetadaten können dieses Label nicht vergeben.

Aktualisieren Sie diese Erlaubnisliste in einem normalen Pull Request, um ein Official-Paket hinzuzufügen oder zu entfernen. Die Prüfung muss exakten Registry-Host, Paketidentität und erwarteten Registry-Publisher bestätigen, wenn diese Metadaten verfügbar sind. Fügen Sie Tests für genehmigte Quelle und denselben Namen aus anderer Registry hinzu. Official bedeutet durch Attraccess gepflegt oder genehmigt; es impliziert weder Sicherheitssandbox noch Sicherheitsgarantie. Installierende müssen Quelle und angeforderte Rechte weiterhin prüfen.

Dieser Leitfaden ist eine vollständige Anleitung. Er folgt einem funktionierenden Beispiel — **`plugin-hello-world`** — mit jeder Core-Fähigkeit: Backend-Controller, injiziertem Repository, typisiertem Ereignishandler und Frontend-Route.

> [!TIP]
> Die vollständige Quelle liegt im Repository unter [`examples/plugin-hello-world`](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world). Klonen Sie es, führen Sie `npm install && npm run build && npm pack ./package` aus und verwenden Sie das resultierende npm-Tarball, um es vor Ihrer eigenen Entwicklung laufen zu sehen.

## Plugin-SDKs

| SDK                                | Installationsbefehl                               | Zweck                                                          |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `@attraccess/plugins-backend-sdk`  | `npm install -D @attraccess/plugins-backend-sdk`  | Backend-Module, `PluginContext`, typisierte Ereignisse, Rechte |
| `@attraccess/plugins-frontend-sdk` | `npm install -D @attraccess/plugins-frontend-sdk` | Frontend-Plugin-Vertrag und Routentypen                        |

Beide SDKs werden nur zur Build-Zeit benötigt (Typen). Sie werden nicht ins ausgelieferte Artefakt gebündelt.

## Aufbau eines Plugins

Jedes npm-Plugin hat eine `package.json` an seiner Wurzel und einen oder beide Build-Ausgaben:

```
my-plugin/
├── package.json                # npm and Attraccess metadata (required)
├── dist/index.js               # backend entry (CommonJS) — optional
└── frontend/remoteEntry.js     # frontend entry (ESM federation remote) — optional
```

### Paketmetadaten

`package.json` deklariert Plugin-Identität, Version, Einstiegspunkte, Host-Versionen, SDK-Peers und Rechte. Sie muss das Keyword `attraccess-plugin` und ein Objekt `attraccess` enthalten:

```json
{
  "name": "@example/plugin-hello-world",
  "version": "1.0.0",
  "keywords": ["attraccess-plugin"],
  "peerDependencies": {
    "@attraccess/plugins-backend-sdk": "^1.9.0",
    "@attraccess/plugins-frontend-sdk": "^1.9.0"
  },
  "attraccess": {
    "displayName": "Hello World",
    "host": "^1.9.0",
    "backend": "dist/index.js",
    "frontend": "frontend/remoteEntry.js",
    "styles": "frontend/style.css",
    "permissions": ["READ_USERS", "LISTEN_EVENTS"],
    "sdk": { "backend": "^1.9.0", "frontend": "^1.9.0" }
  }
}
```

| Feld                                         | Erforderlich     | Hinweise                                                                                            |
| -------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `name`                                       | ja               | Unveränderliche npm-Paketkennung.                                                                   |
| `version`                                    | ja               | Semantische Version Ihres Plugins.                                                                  |
| `attraccess.backend` / `attraccess.frontend` | mindestens eines | Relativer Paketeinstiegspunkt.                                                                      |
| `attraccess.styles`                          | nein             | Stylesheet neben Frontend-Einstiegspunkt.                                                           |
| `attraccess.migrations`                      | nein             | Modul mit TypeORM-Migrationsklassen. Siehe [Datenbankmigrationen](plugins/database-migrations.md).  |
| `attraccess.host`                            | ja               | Kompatibler Attraccess-Host-Semver-Bereich.                                                         |
| `attraccess.permissions`                     | nein             | Benötigte Backend-Fähigkeiten (siehe [Berechtigungen](#backend-plugin-permissions)). Standard `[]`. |

## Abhängigkeiten von anderen Attraccess-Plugins

Deklarieren Sie Plugin-Abhängigkeiten in `package.json` unter `attraccess.dependencies`:

```json
{
  "attraccess": {
    "dependencies": [{ "name": "@example/3d-printer-core", "version": "^1.0.0", "required": true }]
  }
}
```

`name` ist die unveränderliche npm-Paketidentität, `version` ein Semver-Bereich (kein Dist-Tag und keine URL), und `required` ist standardmäßig `true`. Doppelte Identitäten werden abgelehnt. Diese Einträge repräsentieren installierte Attraccess-Plugins mit eigenen Modulen, Rechten, Migrationen und Zustand. Normale JavaScript-Laufzeitabhängigkeiten bleiben im obersten npm-Feld `dependencies`.

Der Marktplatz löst den gesamten erforderlichen Abhängigkeitsgraphen vor Installation auf und zeigt aufgelöste Versionen, Quellen, Klassifizierungen und Rechte zur Bestätigung. Kompatible installierte Plugins werden wiederverwendet; fehlende gemeinsam installiert. Widersprüchliche installierte Versionen werden nicht automatisch ersetzt. Zyklen und inkompatible Bereiche blockieren mit Erklärung. Abhängigkeiten werden aus gewählter Registry aufgelöst; veröffentlichen Sie sie deshalb dort ebenfalls. Eine bereits installierte kompatible Abhängigkeit kann aus anderer Registry stammen.

Optionale Abhängigkeiten (`required: false`) werden nicht automatisch installiert und blockieren Aktivierung nicht. Bei Vorhandensein müssen Versionen den deklarierten Bereich erfüllen. Erforderliche Abhängigkeiten laden und migrieren vor abhängigen Plugins. Fehlende, inkompatible, quarantänisierte oder fehlgeschlagene erforderliche Abhängigkeit hält abhängige Plugins inaktiv; die Plugin-Einstellungen zeigen den Fehler. Reparieren Sie die Abhängigkeit und starten Sie zum Reaktivieren neu.

Updates und Downgrades müssen sowohl Zielversionsabhängigkeiten als auch Anforderungen installierter abhängiger Plugins erfüllen. Entfernen einer erforderlichen Abhängigkeit verlangt explizite Bestätigung aller direkten und transitiven abhängigen Plugins zur gemeinsamen Entfernung. Automatisch installierte Abhängigkeiten bleiben normale Plugins und werden nicht automatisch mit ihrem letzten abhängigen Plugin entfernt. Paketänderungen werden gemeinsam übernommen; Migrationen und Runtime-Aktivierung laufen beim Neustart gemäß bestehendem Plugin-Lebenszyklus. Entfernen von npm-Plugins erhält deren Daten und Geheimnisse.

## Backend-Plugins

Ein Backend-Plugin läuft **innerhalb** des Attraccess-Serverprozesses. Es exportiert ein Standard-`PluginBackendModule`, dessen `register(context)` ein NestJS-`DynamicModule` liefert. Der Host importiert dieses Modul in seinen Dependency-Injection-Graphen, sodass Controller und Provider vollwertige API-Bestandteile sind.

```ts
import type { PluginBackendModule, PluginContext, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host uses.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// SystemEvent is imported as a TYPE only (erased at build time); supply the enum
// value as a string-literal cast to keep the artifact SDK-free at runtime.
const RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED' as SystemEvent;

interface UserRow {
  id: number;
  username: string;
}

@Injectable()
class HelloWorldService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    // Subscribe to a typed host event. Requires the LISTEN_EVENTS permission.
    this.context.onEvent(RESOURCE_USAGE_STARTED, ({ resource, user }) => {
      this.context.logger.log(`Resource ${resource.id} usage started by user ${user.id} — hello!`);
    });
  }

  async greetUsers(): Promise<string[]> {
    // Injected repository over the shared connection. Addressing the entity by
    // NAME ('User') means we don't import the entity class; the host resolves it
    // and gates the call behind READ_USERS.
    const users = this.context.getRepository<UserRow>('User');
    const rows = await users.find({ take: 5 });
    return rows.map((row) => `Hello, ${row.username}!`);
  }
}

@Controller('hello-world')
class HelloWorldController {
  constructor(private readonly service: HelloWorldService) {}

  @Get('greetings')
  async greetings(): Promise<{ greetings: string[] }> {
    return { greetings: await this.service.greetUsers() };
  }
}

class HelloWorldPluginModule {}

const plugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    return {
      module: HelloWorldPluginModule,
      controllers: [HelloWorldController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, HelloWorldService],
    };
  },
};

export default plugin;
```

### Der PluginContext

`register(context)` erhält einen `PluginContext` — Ihren Zugang zum Host:

| Mitglied                                                  | Zweck                                                                                | Berechtigung             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| `context.manifest`                                        | Name, Version, ID und Verzeichnis Ihres Plugins.                                     | keine                    |
| `context.logger`                                          | Logger mit Plugin-Namenspräfix.                                                      | keine                    |
| `context.getRepository(entity)`                           | TypeORM-Repository auf gemeinsamer Verbindung.                                       | je Entität (siehe unten) |
| `context.dataSource`                                      | Rohe gemeinsame TypeORM-`DataSource`.                                                | `DATABASE_ACCESS`        |
| `context.onEvent(event, handler)`                         | Typisiertes `SystemEvent` abonnieren.                                                | `LISTEN_EVENTS`          |
| `context.emitEvent(event, payload)`                       | Typisiertes `SystemEvent` senden.                                                    | `EMIT_EVENTS`            |
| `context.events`                                          | Roher gemeinsamer Event-Bus (eingeschränkte Oberfläche).                             | je Methode               |
| `context.get(token)`                                      | Beliebigen Host-Provider per Token auflösen.                                         | `RESOLVE_HOST_PROVIDERS` |
| `context.getMqttServerConfig(serverId)`                   | MQTT-Verbindungskonfiguration und aufgelöste (entschlüsselte) Zugangsdaten beziehen. | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.subscribe(serverId, topicFilter, handler)`  | Über gemeinsame Host-MQTT-Verbindung abonnieren; endet nach Broker-Bestätigung.      | `ACCESS_MQTT_SERVERS`    |
| `context.mqtt.publish(serverId, topic, payload, options)` | Über gemeinsame Host-MQTT-Verbindung veröffentlichen.                                | `ACCESS_MQTT_SERVERS`    |

> [!IMPORTANT]
> Lösen Sie Dienste und Repositories durch `context` auf, niemals durch TypeORM-Neuinitialisierung oder zweiten `EventEmitter`. Das Ziel ist die gemeinsame einzelne Host-Datenbankverbindung und der gemeinsame Event-Bus.

### Backend-Plugin-Berechtigungen :id=backend-plugin-permissions

Ein Backend-Plugin führt beliebigen Code im Host-Prozess aus; jede verwendete Host-Fähigkeit muss deshalb vorher im Manifest-Array `permissions` deklariert sein. Zur Laufzeit erhält es einen **abgesicherten** `PluginContext`: Zugriff auf eine Fähigkeit ohne deklarierte Berechtigung wirft einen klaren Fehler mit der fehlenden Berechtigung.

| Berechtigung             | Gewährt Zugang zu                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READ_USERS`             | `context.getRepository('User')` — Benutzerkonten lesen.                                                                                                    |
| `ACCESS_RESOURCES`       | `context.getRepository('Resource')` — Ressourcen lesen und schreiben.                                                                                      |
| `READ_SETTINGS`          | `context.getRepository('Setting')` — Anwendungseinstellungen lesen.                                                                                        |
| `DATABASE_ACCESS`        | `context.dataSource` und `context.getRepository(...)` für jede andere Entität.                                                                             |
| `EMIT_EVENTS`            | `context.emitEvent(...)` und `context.events.emit(...)` / `emitAsync(...)`.                                                                                |
| `LISTEN_EVENTS`          | `context.onEvent(...)` und `context.events.on(...)` / `once(...)` / ...                                                                                    |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` — beliebige Host-Dienste per Token auflösen.                                                                                          |
| `ACCESS_MQTT_SERVERS`    | `context.getMqttServerConfig(serverId)`, `context.mqtt.subscribe(...)` und `context.mqtt.publish(...)` — MQTT-Server über gepoolte Host-Verbindung nutzen. |

### MQTT-Abonnements

Verwenden Sie `context.mqtt` statt eigenem MQTT-Client. Der Host verwaltet Broker-Verbindung, Wiederverbindungen und Broker-Abonnements. Themenfilter unterstützen MQTT-Wildcards `+` und `#`. Der Handler erhält rohe Payload als `Buffer`; gespeicherte Nachrichten werden vom Broker bei Abonnementannahme geliefert.

```ts
const subscription = await context.mqtt.subscribe(1, 'devices/+/state', ({ topic, payload }) => {
  context.logger.log(`${topic}: ${payload.toString()}`);
});

await context.mqtt.publish(1, 'devices/kitchen/set', '{"on":true}', { qos: 1 });
subscription.unsubscribe();
```

Handler sind isoliert: eine Ausnahme wird im Plugin-Kontext protokolliert und unterbricht MQTT-Zustellung an andere Plugins nicht. Alle übrigen Abonnements werden auch automatisch beim Zerstören des Plugin-Moduls entfernt.

Hinweise zur Grenze:

- `DATABASE_ACCESS` ist die breite Berechtigung: sie deckt rohe `dataSource` und Repository für **jede** Entität ab und enthält damit implizit `READ_USERS`, `ACCESS_RESOURCES` und `READ_SETTINGS`. Bevorzugen Sie enge Entitätsrechte, wenn Sie nur eine dieser Tabellen benötigen.
- Der Event-Bus ist eine **eingeschränkte** Oberfläche. Nur `emit`/`emitAsync` (unter `EMIT_EVENTS`) und Listenermethoden `on`, `once`, `addListener`, `prependListener`, `prependOnceListener`, `many`, `prependMany`, `onAny`, `prependAny`, `off`, `offAny`, `removeListener`, `waitFor` (unter `LISTEN_EVENTS`) sind verfügbar. Massenoperationen wie `removeAllListeners` werden nicht freigegeben.
- Unbekannter Berechtigungswert lässt Plugin-Laden fehlschlagen.

> [!WARNING]
> Fordern Sie nur minimale benötigte Rechte an. Administratoren sehen vor Vertrauen auf der Plugins-Seite jede angeforderte Berechtigung.

### Typisierte Systemereignisse

Neben dem rohen `context.events`-Bus bietet der Kontext eine **typisierte** Schnittstelle für Host-`SystemEvent`s mit zur Compile-Zeit geprüften Payloads:

- `context.onEvent(event, handler)` — abonnieren; der Handler erhält typisierte Payload und gibt eine `SystemEventSubscription` zurück, deren `off()` ihn abmeldet. Benötigt `LISTEN_EVENTS`.
- `context.emitEvent(event, payload)` — senden; die Payload wird gegen das Ereignis typgeprüft. Benötigt `EMIT_EVENTS`.

```ts
import { SystemEvent } from '@attraccess/plugins-backend-sdk';

const subscription = context.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, ({ resource, user }) => {
  context.logger.log(`Resource ${resource.id} usage started by user ${user.id}`);
});

// later, to stop listening:
subscription.off();
```

Der Host sendet mindestens `SystemEvent.RESOURCE_USAGE_STARTED` und `SystemEvent.RESOURCE_USAGE_ENDED` bei Beginn und Ende von Nutzungssitzungen. Ein werfender Handler wird vom Host **isoliert** — sein Fehler wird protokolliert und unterbricht nie den auslösenden Core-Ablauf.

### Backend paketieren

Ein Backend-Plugin teilt Host-NestJS-Runtime, Event-Bus und Datenbankverbindung. Für übereinstimmende Dependency-Injection-Identitäten muss Ihr Build _dieselben_ bereits geladenen Paketkopien des Hosts verwenden und darf **keine** eigenen bündeln. Teilen Sie Abhängigkeiten in zwei Gruppen:

| Abhängigkeit                                                                                              | Deklaration                                           | Grund                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `peerDependencies`, zur Build-Zeit **externalisiert** | Sie tragen DI-Identitäten, gemeinsamen Event-Bus und einzelne DB-Verbindung. Gebündelte Kopie ist ein _anderer_ Typ und verbindet stillschweigend nicht. |
| `@attraccess/plugins-backend-sdk` und eigener Code                                                        | normal bündeln                                        | Sicher — SDK-Runtime-Oberfläche ist `Symbol.for()`, kopienübergreifend identitätssicher.                                                                 |

Liefern Sie einen **CommonJS**-Einstiegspunkt (`index.js`), kein ES-Modul. Minimaler [esbuild](https://esbuild.github.io/)-Build nach dieser Regel:

```bash
esbuild backend/plugin.ts \
  --bundle --platform=node --format=cjs --outfile=dist/index.js \
  --external:@nestjs/common --external:@nestjs/core \
  --external:@nestjs/event-emitter --external:eventemitter2 \
  --external:typeorm --external:reflect-metadata \
  --external:@attraccess/plugins-backend-sdk
```

> [!WARNING]
> Bündeln Sie externalisierte Pakete, kann Ihr Plugin fehlerfrei laden, aber stillschweigend keine Ereignisse empfangen, Datenbank nicht teilen oder Host-Dienste nicht auflösen. Halten Sie obige Liste im Zweifel extern.

## Frontend-Plugins

Ein Frontend-Plugin ist ein ES-Modul mit **default-exportierter Klasse**, die `AttraccessFrontendPlugin` implementiert. Der Host lädt es zur Laufzeit als _Remote_ von [Vite Module Federation](https://github.com/originjs/vite-plugin-federation) (mit `./plugin`), instanziiert die Klasse und ruft `getRoutes()` auf, um Seiten in den App-Router einzufügen.

> [!TIP]
> **Empfohlen: UI mit den Bibliotheken des Hosts bauen.** Der Host teilt sein Komponentenkit [`@heroui/react`](https://www.heroui.com/) und Iconset [`lucide-react`](https://lucide.dev/) über Module Federation (siehe [Frontend paketieren](#packaging-the-frontend)). Importieren Sie diese statt eigener Stile; Ihre Seiten wirken nativ, bleiben konsistent und übernehmen das **Hell-/Dunkel-Thema automatisch** — HeroUI-Komponenten lesen das aktive Host-Thema, da die Seite im Host-DOM rendert. Weil die Pakete _geteilt_ sind, liefert der Host zur Laufzeit seine einzelne Kopie; Ihr Bundle enthält nur eigenen Code.
>
> Rohe Tailwind-Utility-Klassen (`flex`, `gap-6`, `text-default-500`, …) werden vom Host-Stylesheet **nicht** abgedeckt — der Host liefert nur Klassen, die _er_ verwendet. Bündeln Sie eigene präfixierte Utilities wie unter [Styling](#styling-bundle-your-own-css) beschrieben.

```tsx
import { Card, Chip, Spinner } from '@heroui/react';
import { HandIcon } from 'lucide-react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useEffect, useState } from 'react';

const api = createPluginApiClient('/api/hello-world');

function HelloWorldPage() {
  const [greetings, setGreetings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .request<{ greetings: string[] }>('/greetings')
      .then((data) => setGreetings(data.greetings))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="hw:flex hw:flex-col hw:gap-6 hw:p-6 hw:max-w-4xl hw:mx-auto">
      <div className="hw:flex hw:items-center hw:gap-3">
        <HandIcon className="hw:w-6 hw:h-6 hw:text-primary" />
        <h1 className="hw:text-2xl hw:font-semibold hw:text-default-800">Hello World Plugin</h1>
      </div>
      <Card className="hw:border hw:border-default-200 hw:dark:border-default-100">
        <Card.Content>
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <ul className="hw:flex hw:flex-col hw:gap-2">
              {greetings.map((g) => (
                <li key={g}>
                  <Chip color="accent" variant="soft">
                    {g}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export default class HelloWorldPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'hello-world-plugin@1.0.0';
  }
  getDependencies(): string[] {
    return [];
  }
  init(_store: IPluginStore): void {}
  activate(): void {}
  deactivate(): void {}
  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {}
  onApiEndpointChange(_endpoint: string): void {}

  // Contribute pages to the app router.
  getRoutes(): RouteConfig[] {
    return [{ path: '/hello-world', authRequired: true, element: <HelloWorldPage /> }];
  }
}
```

### API aufrufen

Bauen Sie **keinen** eigenen fetch-Wrapper. Das SDK liefert einen vorkonfigurierten Client — `createPluginApiClient(basePath?)` — der bereits Host-API-Origin kennt, Sitzungscookie sendet, JSON serialisiert und fehlgeschlagene Antworten in einen Fehler mit Backend-Nachricht umwandelt:

```ts
import { createPluginApiClient, PluginApiError } from '@attraccess/plugins-frontend-sdk';

// Your backend routes are mounted under `/api/<plugin-name>`.
const api = createPluginApiClient('/api/hello-world');

await api.request<Greeting[]>('/greetings'); // GET, parsed JSON
await api.request<Greeting>('/greetings', { method: 'POST', body: { text } }); // JSON body
await api.request<void>('/greetings/1', { method: 'DELETE' }); // empty body → null
await api.request<Result>('/detection/7', { query: { refresh: true } }); // query string
```

| Mitglied                     | Zweck                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request<T>(path, options?)` | JSON hinein, JSON heraus. `options` akzeptiert jedes `RequestInit`-Feld plus `body` (automatisch serialisiert) und `query`. Wirft `PluginApiError` (mit `.status`) bei Nicht-2xx; leerer Body liefert `null`. |
| `fetch(path, init?)`         | Ausweg für Nicht-JSON-Antworten (Downloads, Streams). Löst weiterhin Basis-URL auf und sendet Zugangsdaten.                                                                                                   |
| `url(path, query?)`          | Absolute URL, beispielsweise für `<a href>` oder `EventSource`.                                                                                                                                               |

Lassen Sie `basePath` weg, um die Host-API direkt anzusprechen (`api.request('/api/users/me')`).

### Routen

`getRoutes()` liefert ein Array von `RouteConfig`. Jeder Eintrag erweitert React-Router-Routenprops (`path`, `element`, ...) um `authRequired`:

| `authRequired`                             | Bedeutung                                       |
| ------------------------------------------ | ----------------------------------------------- |
| `false`                                    | Öffentliche Route, keine Authentifizierung.     |
| `true`                                     | Jeder angemeldete Benutzer.                     |
| `"resources.update"`                       | Ein erforderlicher RBAC-Berechtigungsschlüssel. |
| `["resources.update", "resources.create"]` | Eine von mehreren RBAC-Berechtigungen.          |

Siehe [Berechtigungen](user-management/permissions.md) für alle verfügbaren Berechtigungsschlüssel.

Der Host umgibt jede Plugin-Route mit einer Fehlergrenze und fügt sie den Core-Routen hinzu, sodass eine werfende Route den Rest der App nicht beenden kann.

### Seitenleisteneinträge und Gruppen

Implementieren Sie `getSidebarItems()` für Links zu Plugin-Routen. Setzen Sie `group` auf bestehende Host-Gruppen-ID wie `devices` oder deklarieren Sie eigene Gruppe mit `getSidebarGroups()`:

```tsx
import type { PluginSidebarGroup, PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { PlugIcon } from 'lucide-react';

getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: 'my-plugin-tools', label: 'My Plugin', icon: <PlugIcon size={16} aria-hidden /> }];
}

getSidebarItems(): PluginSidebarItem[] {
  return [{ label: 'Tools', path: '/my-plugin/tools', group: 'my-plugin-tools' }];
}
```

Verwenden Sie stabile nicht leere Gruppen-IDs. Präfixieren Sie private Gruppen mit Ihrem Plugin-Namen; verwenden Sie vereinbarte ID für pluginübergreifende Gruppen. Eine Gruppe hat `label` und optionalen React-Node `icon`; bei Fehlen liefert der Host Puzzle-Icon. Plugin-Labels werden unverändert gerendert; das Plugin ist für Übersetzungen verantwortlich.

Der Host prüft Zielroutenrechte jedes Eintrags vor Anzeige und verbirgt Gruppen ohne sichtbare Einträge. Deklarierte Gruppen funktionieren in ausgeklappter Seitenleiste, eingeklappten Menüs und mobiler Navigation. Einträge ohne Gruppe oder mit unbekannter Gruppen-ID bleiben an der Wurzel. Host-Gruppen behalten Labels und Icons bei gleicher Plugin-ID; bei doppelten Plugin-Gruppen-IDs gewinnt die Deklaration des zuerst geladenen Plugins und Einträge teilen diese Gruppe.

#### Gruppe zwischen Plugins teilen

Jedes Plugin mit Bedarf an gemeinsamer Gruppe sollte sie durch `getSidebarGroups()` deklarieren und dieselbe ID in seinen Einträgen referenzieren. Gleiche IDs verschmelzen zu einer Gruppe; Plugins funktionieren allein oder gemeinsam. Beispiel:

```tsx
// In the 3D printer plugin:
getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: '3d-printer', label: '3D Printers' }];
}

// In the BambuLab plugin:
getSidebarGroups(): PluginSidebarGroup[] {
  return [{ id: '3d-printer', label: '3D Printers' }];
}

getSidebarItems(): PluginSidebarItem[] {
  return [{ label: 'BambuLab', path: '/printers/bambulab', group: '3d-printer' }];
}
```

BambuLab erstellt **3D-Drucker**, wenn allein installiert. Deklariert auch das 3D-Drucker-Plugin oder ein anderes Drucker-Plugin `3d-printer`, teilen ihre Einträge dieselbe Gruppe. Verwenden Sie konsistente Labels und Icons für gemeinsame IDs: erste geladene Deklaration liefert Gruppenmetadaten.

Der Host sammelt alle Gruppendeklarationen vor Eintragsplatzierung. Ein Plugin kann auch eine nur von anderem Plugin deklarierte Gruppe referenzieren, sollte sie aber selbst deklarieren, wenn es unabhängig funktionieren muss. Ohne jede Deklaration gilt bestehender Wurzel-Fallback.

### Slots (eingebettete Erweiterungspunkte)

Routen geben einem Plugin eigene Seiten. **Slots** erlauben UI-Einfügung _in_ eine Host-Seite an bekanntem Punkt, ohne dass der Host das Plugin kennt. Ein Slot wird durch dokumentierte String-ID identifiziert (wie Routen-`path`), und der Host gibt jedem Beitrag ein kleines Kontextobjekt zum Einbauort.

Implementieren Sie `getSlotContributions()` und liefern Sie einen Eintrag je Zielslot:

```tsx
// Type each contribution against the context the host documents for the slot,
// so `context` is strongly typed with no runtime casting.
interface MqttServerSlotContext { mqttServerId: number; [key: string]: unknown; }

getSlotContributions(): PluginSlotContribution[] {
  const contributions: PluginSlotContribution<MqttServerSlotContext>[] = [
    {
      slotId: 'mqtt.server.detail',           // host-documented id
      key: 'my-plugin-mqtt-detail',           // stable key (optional)
      render: (context) => <MyPanel mqttServerId={context.mqttServerId} />,
    },
  ];
  return contributions;
}
```

- `slotId` — Host-Erweiterungspunkt zur Darstellung. Unbekannte IDs werden ignoriert.
- `render(context)` — liefert einzubettenden React-Node. `context` ist ein einfaches Objekt mit je Slot dokumentierten Schlüsseln (beispielsweise MQTT-Slots mit `{ mqttServerId }`), damit Beiträge sich auf richtige Entität beziehen. `PluginSlotContribution<Context>` ist generisch über diese Form; Sie typisieren einmal ohne feldweise Casts. Beiträge verschiedener Slots teilen weiterhin ein Array `PluginSlotContribution[]`.
- `key` ist optional, dient aber zugleich als Beitrags-ID in Host-Fehlerlogs.
- Der Host rendert jeden passenden Beitrag innerhalb einer Fehlergrenze; werfender Beitrag wird verborgen und protokolliert statt Host-Seite zu beschädigen.

Der Slot-Vertrag ist bewusst generisch — das SDK enthält kein Domänenwissen. Heute verfügbare Host-Slot-IDs:

| Slot-ID                | Darstellungsort                                               | Kontext            |
| ---------------------- | ------------------------------------------------------------- | ------------------ |
| `mqtt.server.detail`   | MQTT-Server-Detail-/Bearbeitungsansicht (Erweiterungsbereich) | `{ mqttServerId }` |
| `mqtt.server.list.row` | MQTT-Serverliste, Aktionsbereich je Zeile                     | `{ mqttServerId }` |

### Übersetzungen und Sprachwechsel

Verwenden Sie den Core-Hook `useTranslations` aus `@attraccess/plugins-frontend-ui` mit eigenen englischen und deutschen Plugin-Katalogen. Der Hook liest aktive Host-Sprache und aktualisiert eingebundene Plugin-Seiten, seitliche Bereiche und Slot-Beiträge beim Sprachwechsel. Plugins führen keine Spracherkennung aus und pflegen keine eigene Sprachpräferenz.

```tsx
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function DevicesPage() {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  return <h1>{t('title')}</h1>;
}
```

Nehmen Sie jedes sichtbare Label, jede Beschreibung, jeden Platzhalter und jede Barrierefreiheitsbeschriftung in beide Kataloge auf. Verwenden Sie `{{name}}`-Interpolation für dynamische Werte und `{ one, many }`-Nachrichten mit `t('key', { count })` für Pluralisierung. Fehlende deutsche Schlüssel fallen auf Englisch zurück. Verwenden Sie zurückgegebenes `language` für Datums- und Zahlenformatierung; erhalten Sie eingegebene Namen und Protokollkennungen. Bei Statusnachrichten in React-State speichern Sie Übersetzungsschlüssel und Parameter und übersetzen beim Rendern, damit vorhandene Nachrichten ebenfalls wechseln.

Für einfachen React-Text erhält `{ escapeValues: false }` Namen wie `R&D`, ohne HTML-Entities anzuzeigen; React maskiert den Text beim Rendern. Verwenden Sie diese Option nicht für übersetztes HTML oder `Trans`. Speichern Sie für lokale Nachrichten `{ key: 'saved', data: { name } }` und rendern Sie `tMessage(message)`. Wörtliche Serverfehler an `tMessage` bleiben erhalten.

**Teilen Sie `@attraccess/plugins-frontend-ui` über Module Federation.** Eigene gebündelte Kopie erstellt separaten Sprachspeicher und verhindert automatischen Wechsel. `createPluginFederationConfig` des Repositorys deklariert es bereits mit `import: false` und `generate: false`, sodass Remotes immer Host-Kopie verwenden. Externe Plugin-Builds müssen denselben shared-Eintrag enthalten:

```ts
'@attraccess/plugins-frontend-ui': {
  requiredVersion: '*', import: false, generate: false,
}
```

Deklarieren Sie `@attraccess/plugins-frontend-ui` als Peer-Abhängigkeit und verlangen Sie Attraccess 1.11.0 oder neuer sowohl im npm-Bereich `attraccess.host` als auch im ZIP-Manifest `attraccessVersion.min`, da ältere Hosts dieses Modul nicht teilen.

### Frontend paketieren :id=packaging-the-frontend

Bauen Sie Frontend als Module-Federation-Remote mit `./plugin`. Seine `shared`-Liste muss jeden Host-Singleton enthalten, den das Plugin **zur Laufzeit importiert**, um Host-Kopie statt eigener Bündelung zu verwenden. Der Host teilt: `react`, `react-dom`, `react-router-dom`, `react-pluggable`, `@heroui/react`, `lucide-react`, `@tanstack/react-query`, `@attraccess/plugins-frontend-ui` (einschließlich Core-Übersetzungshooks).

> [!TIP]
> Listen Sie bei empfohlenem Vorgehen `@heroui/react` und `lucide-react` hier. Es sind große Bibliotheken — Teilen hält Plugin-Bundle klein (Host liefert seine Kopie) und garantiert einzelne themengesteuerte Komponentenkit-Instanz.

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // compiles src/styles.css — see "Styling" below
    federation({
      name: 'plugin-hello-world',
      filename: 'remoteEntry.js',
      exposes: { './plugin': './src/plugin.tsx' },
      // Every host singleton the plugin imports at runtime. @heroui/react and
      // lucide-react are listed here because the recommended UI uses them.
      shared: ['react', 'react-dom', 'react-router-dom', '@heroui/react', 'lucide-react'],
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    // Emit remoteEntry.js and style.css at the output root, un-hashed, so the
    // manifest's entryPoint and styles fields resolve.
    assetsDir: '',
    rollupOptions: { output: { assetFileNames: '[name][extname]' } },
  },
});
```

Dies erzeugt `frontend/remoteEntry.js` (plus Chunks) — richten Sie Manifest-`main.frontend.entryPoint` darauf.

### Styling: eigenes CSS bündeln :id=styling-bundle-your-own-css

Das Plugin rendert im Host-DOM, aber Host-Stylesheet enthält nur Tailwind-Utilities aus _Host-eigenen_ Quellen. Jede zusätzliche Plugin-Klasse würde stillschweigend ungestylt rendern; deshalb bündelt jedes Plugin eigenes CSS und deklariert es im Manifest über `main.frontend.styles`. Der Host fügt es beim Plugin-Laden als `<link>` ein.

Utilities müssen **präfixiert** sein (kurzes eindeutiges Präfix wählen, beispielsweise Plugin-Initialen). Zwei vollständige unpräfixierte Tailwind-Builds in einem Dokument stören sich: Ihre `.fixed`-Regel überschreibt Host-`md:relative`, und Host-`.p-4` Ihr `md:p-6`, da Cascade-Layer-Priorität stylesheetübergreifend Quellreihenfolge übertrifft. DOM-Begrenzung ist ebenfalls keine Alternative — HeroUI-Drawer und -Modals portalen nach `<body>`, außerhalb jedes Wrapperelements. Präfixierte Klassennamen begleiten Markup und funktionieren überall (einschließlich Portals), ohne in irgendeiner Richtung mit Host-Klassen zu kollidieren.

Erstellen Sie mit Tailwind (`@tailwindcss/vite`, oben gezeigt) `src/styles.css` und importieren Sie es aus `plugin.tsx`:

```css
/* Emit ONLY the utilities used by this plugin's sources, under your prefix —
   no preflight, since the host document already provides it. Theme tokens are
   emitted as --hw-* variables, so they don't clash with the host's. The HeroUI
   token map is `@theme inline` and referenced, so utilities like
   `hw:bg-surface` compile straight to the host-defined CSS variables. */
@import 'tailwindcss/theme.css' prefix(hw);
@import '@heroui/styles/themes/shared/theme.css' theme(reference);
@import 'tailwindcss/utilities.css' source(none);
@source './';

/* Must match the host's dark-mode variant. */
@custom-variant dark (&:where(.dark, .dark *));
```

Schreiben Sie dann jede Utility-Klasse mit Präfix — zuerst, vor Varianten:

```tsx
<div className="hw:flex hw:flex-col hw:gap-6 hw:p-4 hw:md:p-6">
  <h1 className="hw:text-2xl hw:font-semibold hw:dark:text-default-800">…</h1>
</div>
```

Mit `cssCodeSplit: false` und obigem `assetFileNames` erzeugt Build eine einzelne `frontend/style.css` — richten Sie `main.frontend.styles` darauf. HeroUI-_Komponenten_ benötigen dies nicht (sie werden vom Host gestylt), nur Utilities im eigenen Markup.

## Bauen, paketieren und installieren

Ein kombiniertes Plugin benötigt beide Teile in einem npm-Paket. [`build.mjs`](https://github.com/Attraccess/Attraccess/blob/main/examples/plugin-hello-world/build.mjs) des Beispiels erledigt dies vollständig; Paketinhalt muss so aussehen:

```
package/
├── package.json                # npm and Attraccess metadata
├── dist/index.js               # backend (CommonJS)
└── frontend/                   # frontend federation remote
    ├── remoteEntry.js
    ├── style.css               # plugin-bundled CSS (main.frontend.styles)
    └── ...chunks
```

> [!IMPORTANT]
> [!IMPORTANT]
> Führen Sie `npm pack ./package` aus und verteilen Sie die resultierende `.tgz`-Datei. Paket-Lebenszyklusskripte werden von Attraccess während Installation nicht ausgeführt.

Installieren Sie es dann:

1. Paket in npm-kompatibler Registry veröffentlichen.
2. **Einstellungen** > **Plugins** öffnen, Registry-Paket und Version wählen. Der Server validiert Paketmetadaten, lädt und entpackt es und **startet neu**, um das Plugin zu laden.
3. Nach Neustart sind Backend-Endpunkte aktiv und Frontend-Routen erreichbar. Angeforderte Rechte auf Plugins-Seite prüfen.

Siehe [Plugins installieren](plugins/installing-plugins.md) zum Verwalten und Entfernen von Plugins.

## Erstanbieter-Plugins (nx-Apps in diesem Repo)

Drittanbieter-Plugins sind eigenständige Pakete mit eigenem `build.mjs` (siehe [`examples/plugin-hello-world`](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world)). **In diesem Monorepo** gepflegte Plugins sind stattdessen vollwertige **nx-Apps** und teilen Workspace-Toolchain, Caching und CI.

**Konvention:**

- **Ort:** ein Verzeichnis je Plugin unter `apps/plugins/<name>/` mit gleichem Aufbau wie jedes Plugin (`package.json`, `backend/plugin.ts`, `frontend/src/plugin.tsx`, …).
- **nx-Tag:** jede Plugin-App ist in `project.json` mit **`type:plugin`** markiert. CI wählt sie mit `--projects=tag:type:plugin` (Tests und Paketierung); generische Lint-/Typecheck-/Test-/Build-Jobs schließen sie mit `--exclude=...,tag:type:plugin` aus, genau wie `scope:hardware`. Listen Sie Plugin-Apps jederzeit mit:

  ```bash
  pnpm nx show projects --projects=tag:type:plugin
  ```

- **Build-Rezept:** obiges esbuild-/Vite-/npm-pack-Rezept wird pluginübergreifend über `apps/plugins/scripts/` (`esbuild-backend.mjs`, `vite-federation.config.mjs`, `verify-packed-plugin.mjs`) geteilt. Jede Plugin-`project.json` bindet es in nx-Ziele ein:

  Bauen und installieren Sie für lokale Entwicklung ein Plugin ins Plugin-Verzeichnis der Entwicklungs-API:

  ```bash
  pnpm nx install-dev plugin-shelly
  ```

  Dieses Ziel ist für Shelly, RabbitMQ und WAGO verfügbar. `install-dev` hängt von `build` ab und kopiert immer den resultierenden `package/`-Inhalt nach `storage/plugins/<manifest-name>/`, ersetzt vorherige lokale Installation und entfernt veraltete Dateien. Es beachtet `PLUGIN_DIR`, dann `STORAGE_ROOT` aus Umgebung oder Workspace-`.env`; relative Pfade beziehen sich auf Workspace-Wurzel. Andere Plugins bleiben erhalten. Starten Sie laufende API zum Laden des aktualisierten Plugins neu. Plugin-Quelländerungen verlangen erneutes `install-dev`; dieses Ziel überwacht Plugin-Quellen nicht.

  | Ziel             | Erzeugt                                                                                  |
  | ---------------- | ---------------------------------------------------------------------------------------- |
  | `build-backend`  | `package/dist/index.js` (esbuild, CommonJS, Host-Pakete externalisiert)                  |
  | `build-frontend` | `package/frontend/remoteEntry.js` (Vite-Federation-Remote)                               |
  | `build`          | bereitet `package.json` und `plugin.json` in `package/` vor (abhängig von beiden Builds) |
  | `zip`            | `dist/plugin-<name>.zip` — in Plugins-UI hochladbar                                      |
  | `pack`           | `dist/*.tgz` — npm-Paketartefakt (abhängig von `build`)                                  |
  | `pack-test`      | prüft gepacktes Tarball und lädt Backend                                                 |
  | `publish`        | veröffentlicht neue Paketversion auf npm                                                 |

  ```bash
   # Build and pack a single plugin app:
   pnpm nx pack plugin-rabbitmq
   # Build a ZIP for direct upload through the Plugins UI:
   pnpm nx zip plugin-rabbitmq
  # …or every plugin app at once:
   pnpm nx run-many --target=pack --projects=tag:type:plugin
   # …or build uploadable ZIPs for every plugin app:
   pnpm nx run-many --target=zip --projects=tag:type:plugin
  ```

- **CI:** Pull Requests testen und paketieren betroffene Plugin-Apps. Jeder Main-Branch-Build veröffentlicht jede mit `type:plugin` markierte App als eindeutige `-nightly.<run>`-Version unter npm-Tag `next`. Release-CI veröffentlicht geänderte markierte Plugin-Apps mit neuer Version unter `latest`.

## Siehe auch

- [Plugins-Überblick](plugins/overview.md) — Was sind Plugins?
- [Plugins installieren](plugins/installing-plugins.md) — Hochladen und verwalten
- [Beispiel-Plugin-Quelle](https://github.com/Attraccess/Attraccess/tree/main/examples/plugin-hello-world) — Anleitungscode von `plugin-hello-world`
- [Entwicklerhandbuch](developer/overview.md) — Attraccess-Architektur und Entwicklung
- [API-Referenz](developer/api-reference.md) — Attraccess-REST-API

## Live-Updates

Verwenden Sie `context.liveUpdates.register` des Backend-SDKs und `usePluginLiveUpdates<T>` des Frontend-SDKs für die gemeinsame authentifizierte Live-Verbindung des Hosts. Optionaler Callback `onUnavailable` meldet Themenablehnung oder Transportunterbrechung. Erhalten Sie Cache-Werte als unverfügbar bis frischem Snapshot; starten Sie kein wiederkehrendes REST-Polling. Bereinigung und Authentifizierungszuständigkeit schützen diesen Callback wie `onUpdate` und `onReconnect`. Deklarieren Sie pluginlokale Themen, validieren Sie Kennungen und autorisieren Sie jedes Abonnement im Backend; öffnen Sie kein separates SSE oder WebSocket für Plugin-UI-Updates. Der Host redigiert Autorisierungs- und Quellausnahmen. Bei `createSharedLiveSampler` hält ausstehendes Lesen seine Sperre je Schlüssel bis Abschluss, auch nach finalem Abmelden; neu erstellte Verbraucher erhalten frische Werte. Der Host erholt gültige Zugangsdatenrotation desselben Benutzers ohne Cache-Löschen und erhält den Stream bei Bereinigung/Einrichtung im selben Batch. Plugin-Ereignispayloads haben kein lokales Replay. Siehe [Plugin-Live-Updates](https://github.com/Attraccess/Attraccess/blob/main/docs/development/live-updates.md#plugin-live-updates) für Vertrag und Beispiele einschließlich Wiederverbindung und Bereinigung. Der [WAGO-Abfragezeitplan](https://github.com/Attraccess/Attraccess/blob/main/docs/development/live-updates.md#wago-sampling-schedule) listet gemeinsame Backend-Intervalle aller neun WAGO-Themen.
