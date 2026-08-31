# Plugins entwickeln

Attraccess stellt SDKs für die Entwicklung eigener Plugins bereit. Sie können Frontend-Erweiterungen, Backend-Erweiterungen oder beides erstellen.

## Plugin-SDKs

| SDK | Installationsbefehl | Verwendung |
|-----|---------------------|-----------|
| `@attraccess/plugins-frontend-sdk` | `npm install @attraccess/plugins-frontend-sdk` | Frontend-Seiten und -Komponenten |
| `@attraccess/plugins-backend-sdk` | `npm install @attraccess/plugins-backend-sdk` | Backend-API-Endpunkte |

## Frontend-Plugins

Das Frontend-SDK ermöglicht es Ihrem Plugin, Routen und Komponenten innerhalb der Attraccess-Benutzeroberfläche zu registrieren.

Ein Frontend-Plugin kann:

- **Routen registrieren** -- Neue Seiten hinzufügen, die über die Seitenleiste oder direkte URL erreichbar sind
- **Komponenten registrieren** -- UI-Komponenten in bestehende Seiten einfügen

### Erste Schritte mit Frontend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Frontend-SDK
2. Verwenden Sie das SDK, um Ihre Routen und Komponenten zu registrieren
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es über die [Plugins](plugins/installing-plugins.md)-Seite hoch

> [!TIP]
> Lesen Sie die SDK-Dokumentation, die mit `@attraccess/plugins-frontend-sdk` mitgeliefert wird, für eine detaillierte API-Referenz, Beispiele und Typdefinitionen.

## Backend-Plugins

Das Backend-SDK ermöglicht es Ihrem Plugin, API-Endpunkte zu registrieren, die auf dem Attraccess-Server ausgeführt werden.

Ein Backend-Plugin kann:

- **API-Endpunkte registrieren** -- Neue REST-Endpunkte zur Attraccess-API hinzufügen
- **Auf Anwendungsdienste zugreifen** -- Mit dem Attraccess-Backend interagieren

### Erste Schritte mit Backend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Backend-SDK
2. Definieren Sie Ihre API-Endpunkte mit dem SDK
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es über die [Plugins](plugins/installing-plugins.md)-Seite hoch

### Backend-Plugins verpacken

Ein Backend-Plugin läuft **innerhalb** des Attraccess-Serverprozesses und teilt sich die NestJS-Laufzeit, den Event-Bus und die Datenbankverbindung des Hosts. Damit das funktioniert, muss Ihr Build *dieselben* Kopien dieser Pakete verwenden, die der Host bereits geladen hat -- er darf keine eigenen mitbündeln.

Teilen Sie Ihre Abhängigkeiten in zwei Gruppen auf:

| Abhängigkeit | Deklaration | Grund |
|---------------|-------------|-------|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `peerDependencies`, beim Build **externalisiert** (nie gebündelt) | Sie tragen die Dependency-Injection-Identitäten, den gemeinsamen Event-Bus und die einzelne Datenbankverbindung. Eine gebündelte Kopie gilt als *anderer* Typ und verbindet sich stillschweigend nicht. |
| `@attraccess/plugins-backend-sdk` und Ihr eigener Code | Normal bündeln | Kann sicher in Ihr Artefakt aufgenommen werden. |

Liefern Sie einen **CommonJS**-Einstiegspunkt (`index.js`) aus, kein ES-Modul (`index.mjs`). Verweisen Sie im `plugin.json`-Manifest darauf:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": { "backend": { "directory": "dist", "entryPoint": "index.js" } },
  "attraccessVersion": { "min": "1.0.0" }
}
```

Ein minimaler [esbuild](https://esbuild.github.io/)-Build, der die Regel befolgt:

```bash
esbuild src/index.ts \
  --bundle --platform=node --format=cjs --outfile=dist/index.js \
  --external:@nestjs/common --external:@nestjs/core \
  --external:@nestjs/event-emitter --external:eventemitter2 \
  --external:typeorm --external:reflect-metadata
```

> [!WARNING]
> Wenn Sie eines der externalisierten Pakete mitbündeln, lädt Ihr Plugin möglicherweise fehlerfrei, empfängt aber stillschweigend keine Events, teilt sich nicht die Datenbank oder kann keine Host-Dienste auflösen. Halten Sie die obige Abhängigkeitsliste im Zweifel extern.

### Backend-Plugin-Berechtigungen

Ein Backend-Plugin führt beliebigen Code im Host-Prozess aus, daher muss jede
Host-Fähigkeit, die es nutzt, vorab deklariert werden. Fügen Sie Ihrer
`plugin.json` ein `permissions`-Array hinzu, das nur die benötigten
Fähigkeiten auflistet. Zur Laufzeit erhält Ihr Plugin einen **abgesicherten**
`PluginContext`: Der Zugriff auf eine Fähigkeit, deren Berechtigung nicht
deklariert wurde, löst einen klaren Fehler aus, der die fehlende Berechtigung
nennt.

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": { "backend": { "directory": "dist", "entryPoint": "index.js" } },
  "attraccessVersion": { "min": "1.0.0" },
  "permissions": ["READ_USERS", "EMIT_EVENTS"]
}
```

| Berechtigung | Gewährt Zugriff auf |
|-----------|------------------|
| `READ_USERS` | `context.getRepository(User)` -- Benutzerkonten lesen. |
| `ACCESS_RESOURCES` | `context.getRepository(Resource)` -- Ressourcen lesen und schreiben. |
| `READ_SETTINGS` | `context.getRepository(Setting)` -- Anwendungseinstellungen lesen. |
| `DATABASE_ACCESS` | `context.dataSource` und `context.getRepository(...)` für jede andere Entität. |
| `EMIT_EVENTS` | `context.emitEvent(...)` und `context.events.emit(...)` / `emitAsync(...)` -- auf dem geteilten Event-Bus senden. |
| `LISTEN_EVENTS` | `context.onEvent(...)` und `context.events.on(...)` / `once(...)` / ... -- den geteilten Event-Bus abonnieren. |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` -- beliebige Host-Dienste per Injection-Token auflösen. |
| `ACCESS_MQTT_SERVERS` | `context.getMqttServerConfig(serverId)` -- Verbindungskonfiguration und aufgelöste (entschlüsselte) Zugangsdaten eines MQTT-Servers lesen. |

`context.manifest` und `context.logger` sind immer verfügbar und benötigen
keine Berechtigung. Eine unbekannte Berechtigung führt dazu, dass das Plugin
nicht geladen wird.

Einige Hinweise zur Grenze:

- `DATABASE_ACCESS` ist die weitreichende Berechtigung: sie umfasst die rohe
  `dataSource` (inkl. Verbindungskonfiguration) und ein Repository für **jede**
  Entität und schließt damit implizit `READ_USERS`, `ACCESS_RESOURCES` und
  `READ_SETTINGS` ein. Bevorzugen Sie die engeren Entitäts-Berechtigungen, wenn
  Sie nur eine dieser Tabellen brauchen.
- Der Event-Bus wird als **eingeschränkte** Oberfläche bereitgestellt. Nur
  `emit`/`emitAsync` (unter `EMIT_EVENTS`) und die Listener-Methoden `on`, `once`,
  `addListener`, `prependListener`, `prependOnceListener`, `many`, `prependMany`,
  `onAny`, `prependAny`, `off`, `offAny`, `removeListener`, `waitFor` (unter
  `LISTEN_EVENTS`) sind verfügbar. Globale Operationen wie `removeAllListeners`
  und `listenTo` werden nicht freigegeben.

> [!WARNING]
> Fordern Sie nur die minimal nötigen Berechtigungen an. Administratoren sehen
> auf der Plugins-Seite jede angeforderte Berechtigung, bevor sie einem Plugin
> vertrauen.

## Typisierte System-Events

Neben dem rohen `context.events`-Bus stellt der Kontext eine **typisierte**
Event-Schnittstelle für die `SystemEvent`s des Hosts bereit. Nutzen Sie sie,
wenn Sie zur Kompilierzeit geprüfte Payloads statt String-basierter Bus-Namen
möchten:

- `context.onEvent(event, handler)` -- ein `SystemEvent` abonnieren. Der Handler
  erhält die typisierte Payload und gibt eine `SystemEventSubscription` zurück,
  deren `off()` ihn wieder abmeldet. Benötigt `LISTEN_EVENTS`.
- `context.emitEvent(event, payload)` -- ein `SystemEvent` senden; die Payload
  wird gegen das Event typgeprüft. Benötigt `EMIT_EVENTS`.

```ts
import { SystemEvent } from '@attraccess/plugins-backend-sdk';

const subscription = context.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, ({ resource, user }) => {
  context.logger.log(`Ressource ${resource.id} Nutzung gestartet von Benutzer ${user.id}`);
});

// später, um das Abonnement zu beenden:
subscription.off();
```

Der Host sendet mindestens `SystemEvent.RESOURCE_USAGE_STARTED` und
`SystemEvent.RESOURCE_USAGE_ENDED`, wenn Nutzungssitzungen beginnen und enden.
Ein Handler, der eine Ausnahme wirft, wird vom Host **isoliert** — sein Fehler
wird protokolliert und unterbricht niemals den Kernablauf, der das Event
gesendet hat.

## Kombinierte Plugins

Sie können ein Plugin erstellen, das sowohl Frontend- als auch Backend-Funktionalität umfasst. Dies ist nützlich, wenn Ihre Erweiterung benutzerdefinierte API-Endpunkte zusammen mit einer Benutzeroberfläche benötigt.

> [!NOTE]
> Für eine allgemeine Einführung in die Attraccess-Architektur und Entwicklungsumgebung siehe den [Entwicklerhandbuch](developer/overview.md).

## Erstanbieter-Plugins (nx-Apps in diesem Repo)

Plugins, die **innerhalb dieses Monorepos** gepflegt werden, sind vollwertige
**nx-Apps** und teilen sich so Toolchain, Caching und CI des Workspaces.

**Konvention:**

- **Ablageort:** ein Verzeichnis pro Plugin unter `apps/plugins/<name>/`.
- **nx-Tag:** jede Plugin-App ist in ihrer `project.json` mit **`type:plugin`**
  getaggt. CI baut und zippt die Menge mit `--projects=tag:type:plugin`; die
  generischen Lint/Typecheck/Test/Build-Jobs schließen sie über
  `--exclude=...,tag:type:plugin` aus — analog zu `scope:hardware`.
- **Build-Rezept:** die esbuild/Vite/zip-Schritte sind über
  `apps/plugins/scripts/` geteilt und in nx-Targets verdrahtet
  (`build-backend`, `build-frontend`, `build`, `zip`, `pack`).

```bash
# Eine ZIP für den Upload in der Plugins-Oberfläche bauen:
pnpm nx zip plugin-rabbitmq
# Alle Plugin-Apps auflisten:
pnpm nx show projects --projects=tag:type:plugin
```

PR-Builds laden die ZIPs als Artefakte hoch (mit Sticky-PR-Kommentar); Releases
hängen sie als Release-Assets an.

## Siehe auch

- [Plugins Überblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins installieren](plugins/installing-plugins.md) -- Plugins hochladen und verwalten
- [Entwicklerhandbuch](developer/overview.md) -- Attraccess-Architektur und -Entwicklung
- [API-Referenz](developer/api-reference.md) -- Attraccess-REST-API
