# Plugins auf SDK 2.0 umstellen

<!-- llms-description: Was Plugin-Entwickler für Attraccess 2.0 ändern müssen: die Mindest-Host-Version, deklarierte Engines, die neue Persistenz-API mit Vorher-Nachher-Code und die Ablehnung älterer Plugins. -->

Attraccess 2.0 trennt Plugins von der Datenbank-Engine. Für Plugins, die für 1.x gebaut wurden, ist das ein
Breaking Change.

## Was der Host durchsetzt

- **Mindest-Host-Version.** `plugin.json` muss `attraccessVersion.min` von `2.0.0-0` oder höher deklarieren. Bei
  npm-Plugins zählt die niedrigste von `attraccess.host` in der `package.json` erlaubte Version. Ein Plugin darunter oder
  ohne Minimum wird beim Hochladen, Installieren oder Starten verweigert. Der Fehler nennt das Plugin und verlinkt diese
  Anleitung. Es wird nichts entpackt, installiert oder migriert, die Datenbank bleibt unberührt.
- **Deklarierte Engines.** Ein Plugin, das Daten speichert (Migrations-Eintrag oder Berechtigung `DATABASE_ACCESS`),
  muss die Engines nennen, die seine Persistenz unterstützt:

  ```json
  { "persistence": { "backends": ["sqlite"] } }
  ```

  Bei npm-Plugins steht dasselbe Objekt im `attraccess`-Block der `package.json`. Läuft der Host mit einer nicht
  genannten Engine, wird das Plugin nicht installiert, migriert oder gestartet, und es ändern sich keine Daten.

- **Berechtigungen bleiben.** `DATABASE_ACCESS` und die anderen Berechtigungen steuern weiterhin, was ein Plugin nutzen
  darf. Installations-, Start- und Deinstallations-Migrationen und die Schutzmechanismen der Plugin-Migrationshistorie
  funktionieren wie bisher.

## Checkliste

1. `attraccessVersion.min` auf `2.0.0-0` setzen (bei npm-Paketen `attraccess.host` auf `^2.0.0-0`).
2. Peer-Dependencies und `attraccess.sdk`-Bereiche für `@attraccess/plugins-backend-sdk`, `-frontend-sdk` und
   `-frontend-ui` auf `^2.0.0-0` anheben.
3. `persistence.backends` ergänzen, wenn das Plugin Daten speichert.
4. Persistenz auf die neue API umstellen (siehe [Persistenz-API](#persistenz-api)): `sqlitePersistence(context)` statt `getRepository`/`dataSource`/`runSerialized`, `persistence: { sqlite: { entities } }` statt `entities`, `hostData` und die neutralen Modelle statt Host-Entitäten, Migrations-Imports aus `@attraccess/plugins-backend-sdk/sqlite`.
5. `@attraccess/plugins-backend-sdk/sqlite` zu den esbuild-Externals hinzufügen und die eigene `typeorm`-Abhängigkeit entfernen.
6. Plugin neu bauen und gegen einen 2.0-Host testen.

## Persistenz-API

Der SDK-Root enthält kein TypeORM, `DataSource`, `Repository`, `EntityManager` und keine Host-Entitätsklassen mehr,
und es gibt keinen veralteten Pfad. Was im 1.x-Kontext Daten gespeichert hat, läuft jetzt über das neutrale
`context.persistence`, das lesende `context.hostData` und den expliziten Engine-Unterpfad
`@attraccess/plugins-backend-sdk/sqlite`. Der Unterpfad funktioniert nur, solange der Host SQLite betreibt; bei einer
anderen Engine wirft er einen `PluginPersistenceBackendError`, und ein Plugin, dessen deklarierte Engines die aktive
ausschließen, wird vor jeder Änderung verweigert.

### Eigene Tabellen: `getRepository`

```ts
// 1.x
const widgets = context.getRepository(Widget);
```

```ts
// 2.0
import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';

const widgets = sqlitePersistence(context).getRepository(Widget);
```

`getRepository` liefert nur Entitätsklassen, die Ihr Plugin registriert hat. Dekoratoren (`Entity`, `Column`, ...)
stammen jetzt aus demselben Unterpfad, und der `entities`-Export des Backend-Moduls wird zur Engine-Deklaration:

```ts
// 1.x
export default { entities: [Widget], register };
```

```ts
// 2.0
export default { persistence: { sqlite: { entities: [Widget] } }, register } satisfies PluginBackendModule;
```

### Transaktionen: `runSerialized`

```ts
// 1.x
await context.runSerialized(async (manager) => {
  await manager.getRepository(Widget).save(widget);
  await context.mqtt.publish(1, 'widgets/created', '{}'); // Ein-/Ausgabe innerhalb der Transaktion
});
```

```ts
// 2.0
await sqlitePersistence(context).transaction(async (manager, scope) => {
  await manager.getRepository(Widget).save(widget);
  scope.afterCommit(() => context.mqtt.publish(1, 'widgets/created', '{}')); // erst nach dem Commit
});
// oder backend-neutral, ohne den SQLite-Manager:
await context.persistence.transaction(async (scope) => {
  scope.afterCommit(() => notify());
});
```

Die Regeln bleiben: Callback kurz halten, nicht verschachteln, keine Sitzungsschreibvorgänge des Kerns darin. Effekte
gehören in `scope.afterCommit`, das bei einem Rollback nie läuft.

### `dataSource` entfällt

`context.dataSource` gibt es nicht mehr. Nutzen Sie `sqlitePersistence(context).getRepository(...)`, `.manager` zum
Lesen und `.transaction(...)` zum Schreiben. `context.persistence.backend` und `supports('sqlite')` verraten, welche
Engine läuft.

### Host-Entitäten: `User`, `Resource`, `Setting`, `ResourceFlowNode`, ...

Host-Entitätsklassen werden nicht mehr exportiert, und `getRepository` erreicht keine Host-Tabellen. Nutzen Sie die
vorhandenen Fähigkeiten und die neutralen Abfragen:

```ts
// 1.x
const row = await context.getRepository(Setting).findOneBy({ parent: 'app', key: 'backend_url' });
const users = await context.getRepository(User).find({ where: { id: In(ids) } });
const nodes = await context.dataSource
  .getRepository(ResourceFlowNode)
  .createQueryBuilder('node') /* ... */
  .getMany();
```

```ts
// 2.0
const url = await context.hostData.settings.getApp('backend_url'); // READ_SETTINGS
const names = await context.hostData.users.getUsernames(ids); // READ_USERS
const nodes = await context.hostData.flows.findNodes({ typePrefix: 'plugin.x.', dataEquals: { controllerId } }); // DATABASE_ACCESS
```

| 1.x                                            | 2.0                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getRepository(User)` (`READ_USERS`)           | `hostData.users` (`READ_USERS`)                                                                            |
| `getRepository(Resource)` (`ACCESS_RESOURCES`) | `hostData.resources` und `resourceAccess` (`ACCESS_RESOURCES`)                                             |
| `getRepository(Setting)` (`READ_SETTINGS`)     | `hostData.settings` (`READ_SETTINGS`)                                                                      |
| weitere Host-Tabellen über `DATABASE_ACCESS`   | `hostData.flows` (`DATABASE_ACCESS`); kein Zugriff auf andere Host-Tabellen                                |
| Entitätstypen `User`, `Resource`               | `PluginUserModel`, `PluginResourceModel` aus `@attraccess/application-models` (vom SDK-Root re-exportiert) |

Event-Nutzlasten (`RESOURCE_USAGE_STARTED`, `RESOURCE_USAGE_ENDED`) enthalten nur diese neutralen Felder; Tokens und
Kontaktdaten gehören nicht dazu. `AuthenticatedRequest.user` ist mit diesen Feldern typisiert: Der Host kann zur
Laufzeit mehr Felder übergeben, sie gehören aber nicht zur Plugin-API und können sich ohne Ankündigung ändern. `DATABASE_ACCESS` schließt `READ_USERS`,
`ACCESS_RESOURCES` und `READ_SETTINGS` nicht mehr ein: Deklarieren Sie jede, die Sie nutzen.

### Migrationen

```ts
// 1.x
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';
```

```ts
// 2.0
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/sqlite';
```

Installations-, Start- und Deinstallations-Migrationen, der plugin-bezogene Verlauf `plugin_migrations_<name>` und die
Schutzmechanismen beim Ersetzen verhalten sich wie bisher; Up-Migrationen und das Zurücknehmen bei der Deinstallation
laufen jeweils als eine Transaktion. Siehe [Plugin-Datenbankmigrationen](plugins/database-migrations.md).

### Bündeln

Ergänzen Sie den Unterpfad in den Externals Ihrer Backend- und Migrations-Builds und entfernen Sie Ihre eigene
`typeorm`-Abhängigkeit:

```bash
--external:@attraccess/plugins-backend-sdk --external:@attraccess/plugins-backend-sdk/sqlite
```

esbuild erzeugt keine Dekorator-Metadaten, geben Sie daher jedem `@Column` einen expliziten `type`.

### Start-Kapazitäts-Hook

```ts
// 1.x
const held = await countSlotsHeldForOthers(ctx.manager, ctx.resourceId, ctx.userId, ctx.now);
```

```ts
// 2.0
const manager = sqlitePersistence(context).managerOf(ctx.scope);
const held = await countSlotsHeldForOthers(manager, ctx.resourceId, ctx.userId, ctx.now);
```

`ctx.scope` ist ein `PluginTransactionScope` der Start-Transaktion des Hosts. Lesen Sie nur darüber; starten Sie im
Hook nie eine Transaktion.

### Frontend-SDK

`@attraccess/plugins-frontend-sdk` folgt derselben Trennung. `AttraccessFrontendPluginAuthData.user` ist jetzt ein
`PluginUserModel` (`id`, `username`, `locale`, `isDisabled`) statt der `User`-Entity. Ein Frontend-Plugin, das weitere
Benutzerfelder wie `email`, `creditBalance` oder `createdAt` gelesen hat, lädt sie stattdessen über den API-Client.
Installieren Sie `@attraccess/plugins-frontend-sdk` und `@attraccess/plugins-frontend-ui` im selben Bereich `^2.0.0-0`.

### Tests

Plugin-Tests mit Datenbank bauen den Kontext mit
`createSqlitePluginPersistence({ pluginName, connection: () => dataSource, entities })` aus dem Unterpfad und setzen ihn
als `persistence` ihres Fake-Kontexts.

Die Beispiele unter `examples/` und die eingebauten Plugins (Shelly, WAGO, Matter, Reservations, RabbitMQ) zeigen das
2.0-Manifest.
