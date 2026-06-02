# Plugins entwickeln

Attraccess stellt SDKs fuer die Entwicklung eigener Plugins bereit. Sie koennen Frontend-Erweiterungen, Backend-Erweiterungen oder beides erstellen.

## Plugin-SDKs

| SDK | Installationsbefehl | Verwendung |
|-----|---------------------|-----------|
| `@attraccess/plugins-frontend-sdk` | `npm install @attraccess/plugins-frontend-sdk` | Frontend-Seiten und -Komponenten |
| `@attraccess/plugins-backend-sdk` | `npm install @attraccess/plugins-backend-sdk` | Backend-API-Endpunkte |

## Frontend-Plugins

Das Frontend-SDK ermoeglicht es Ihrem Plugin, Routen und Komponenten innerhalb der Attraccess-Benutzeroberflaeche zu registrieren.

Ein Frontend-Plugin kann:

- **Routen registrieren** -- Neue Seiten hinzufuegen, die ueber die Seitenleiste oder direkte URL erreichbar sind
- **Komponenten registrieren** -- UI-Komponenten in bestehende Seiten einfuegen

### Erste Schritte mit Frontend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Frontend-SDK
2. Verwenden Sie das SDK, um Ihre Routen und Komponenten zu registrieren
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es ueber die [Plugins](plugins/installing-plugins.md)-Seite hoch

> [!TIP]
> Lesen Sie die SDK-Dokumentation, die mit `@attraccess/plugins-frontend-sdk` mitgeliefert wird, fuer eine detaillierte API-Referenz, Beispiele und Typdefinitionen.

## Backend-Plugins

Das Backend-SDK ermoeglicht es Ihrem Plugin, API-Endpunkte zu registrieren, die auf dem Attraccess-Server ausgefuehrt werden.

Ein Backend-Plugin kann:

- **API-Endpunkte registrieren** -- Neue REST-Endpunkte zur Attraccess-API hinzufuegen
- **Auf Anwendungsdienste zugreifen** -- Mit dem Attraccess-Backend interagieren

### Erste Schritte mit Backend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Backend-SDK
2. Definieren Sie Ihre API-Endpunkte mit dem SDK
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es ueber die [Plugins](plugins/installing-plugins.md)-Seite hoch

### Backend-Plugins verpacken

Ein Backend-Plugin laeuft **innerhalb** des Attraccess-Serverprozesses und teilt sich die NestJS-Laufzeit, den Event-Bus und die Datenbankverbindung des Hosts. Damit das funktioniert, muss Ihr Build *dieselben* Kopien dieser Pakete verwenden, die der Host bereits geladen hat -- er darf keine eigenen mitbuendeln.

Teilen Sie Ihre Abhaengigkeiten in zwei Gruppen auf:

| Abhaengigkeit | Deklaration | Grund |
|---------------|-------------|-------|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `eventemitter2`, `typeorm`, `reflect-metadata` | `peerDependencies`, beim Build **externalisiert** (nie gebuendelt) | Sie tragen die Dependency-Injection-Identitaeten, den gemeinsamen Event-Bus und die einzelne Datenbankverbindung. Eine gebuendelte Kopie gilt als *anderer* Typ und verbindet sich stillschweigend nicht. |
| `@attraccess/plugins-backend-sdk` und Ihr eigener Code | Normal buendeln | Kann sicher in Ihr Artefakt aufgenommen werden. |

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
> Wenn Sie eines der externalisierten Pakete mitbuendeln, laedt Ihr Plugin moeglicherweise fehlerfrei, empfaengt aber stillschweigend keine Events, teilt sich nicht die Datenbank oder kann keine Host-Dienste aufloesen. Halten Sie die obige Abhaengigkeitsliste im Zweifel extern.

### Backend-Plugin-Berechtigungen

Ein Backend-Plugin fuehrt beliebigen Code im Host-Prozess aus, daher muss jede
Host-Faehigkeit, die es nutzt, vorab deklariert werden. Fuegen Sie Ihrer
`plugin.json` ein `permissions`-Array hinzu, das nur die benoetigten
Faehigkeiten auflistet. Zur Laufzeit erhaelt Ihr Plugin einen **abgesicherten**
`PluginContext`: Der Zugriff auf eine Faehigkeit, deren Berechtigung nicht
deklariert wurde, loest einen klaren Fehler aus, der die fehlende Berechtigung
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

| Berechtigung | Gewaehrt Zugriff auf |
|-----------|------------------|
| `READ_USERS` | `context.getRepository(User)` -- Benutzerkonten lesen. |
| `ACCESS_RESOURCES` | `context.getRepository(Resource)` -- Ressourcen lesen und schreiben. |
| `READ_SETTINGS` | `context.getRepository(Setting)` -- Anwendungseinstellungen lesen. |
| `DATABASE_ACCESS` | `context.dataSource` und `context.getRepository(...)` fuer jede andere Entitaet. |
| `EMIT_EVENTS` | `context.events.emit(...)` / `emitAsync(...)` -- auf dem geteilten Event-Bus senden. |
| `LISTEN_EVENTS` | `context.events.on(...)` / `once(...)` / ... -- den geteilten Event-Bus abonnieren. |
| `RESOLVE_HOST_PROVIDERS` | `context.get(token)` -- beliebige Host-Dienste per Injection-Token aufloesen. |

`context.manifest` und `context.logger` sind immer verfuegbar und benoetigen
keine Berechtigung. Eine unbekannte Berechtigung fuehrt dazu, dass das Plugin
nicht geladen wird.

Einige Hinweise zur Grenze:

- `DATABASE_ACCESS` ist die weitreichende Berechtigung: sie umfasst die rohe
  `dataSource` (inkl. Verbindungskonfiguration) und ein Repository fuer **jede**
  Entitaet und schliesst damit implizit `READ_USERS`, `ACCESS_RESOURCES` und
  `READ_SETTINGS` ein. Bevorzugen Sie die engeren Entitaets-Berechtigungen, wenn
  Sie nur eine dieser Tabellen brauchen.
- Der Event-Bus wird als **eingeschraenkte** Oberflaeche bereitgestellt. Nur
  `emit`/`emitAsync` (unter `EMIT_EVENTS`) und die Listener-Methoden `on`, `once`,
  `addListener`, `prependListener`, `prependOnceListener`, `many`, `prependMany`,
  `onAny`, `prependAny`, `off`, `offAny`, `removeListener`, `waitFor` (unter
  `LISTEN_EVENTS`) sind verfuegbar. Globale Operationen wie `removeAllListeners`
  und `listenTo` werden nicht freigegeben.

> [!WARNING]
> Fordern Sie nur die minimal noetigen Berechtigungen an. Administratoren sehen
> auf der Plugins-Seite jede angeforderte Berechtigung, bevor sie einem Plugin
> vertrauen.

## Kombinierte Plugins

Sie koennen ein Plugin erstellen, das sowohl Frontend- als auch Backend-Funktionalitaet umfasst. Dies ist nuetzlich, wenn Ihre Erweiterung benutzerdefinierte API-Endpunkte zusammen mit einer Benutzeroberflaeche benoetigt.

> [!NOTE]
> Fuer eine allgemeine Einfuehrung in die Attraccess-Architektur und Entwicklungsumgebung siehe den [Entwicklerhandbuch](developer/overview.md).

## Siehe auch

- [Plugins Ueberblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins installieren](plugins/installing-plugins.md) -- Plugins hochladen und verwalten
- [Entwicklerhandbuch](developer/overview.md) -- Attraccess-Architektur und -Entwicklung
- [API-Referenz](developer/api-reference.md) -- Attraccess-REST-API
