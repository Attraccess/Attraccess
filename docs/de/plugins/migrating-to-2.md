# Plugins auf SDK 2.0 umstellen

<!-- llms-description: Plugins auf Attraccess 2.0 umstellen: kein Datenbankzugriff, Host-Ports statt Host-Entitäten, deklarierte Tabellen mit neutralen Migrationen und Record-Port, Portierungsanleitung und Ablehnungsregeln. -->

Attraccess 2.0 nimmt Plugins die Datenbank weg. Für Plugins, die für 1.x gebaut wurden, ist das ein Breaking Change.

**Ein Plugin hat keinen Datenbankzugriff.** Es gibt keinen `DataSource`, `EntityManager`, kein TypeORM-Repository, kein
rohes SQL, keine Entity-Dekoratoren, kein Engine-Handle und keinen Unterpfad `@attraccess/plugins-backend-sdk/sqlite`,
und keinen Weg, eine Kerntabelle zu lesen. Stattdessen bekommt ein Plugin zwei Dinge:

- **Host-Ports** für alles, was der Host besitzt (Benutzer, Ressourcen, Einstellungen, Autorisierung, Audit,
  Benachrichtigungen, Hooks, Events, Flows).
- **Plugin-Speicher** für eigene Daten: Tabellen, die das Plugin in einem neutralen Schema _deklariert_, neutrale
  Migrationen und der Record-Port `context.storage`. Engine, DDL, Transaktionen, Migrationen und Backups gehören dem Host.

Plugins, die ihre eigene Persistenz mitbringen (eigene Verbindung, eigenen Treiber oder eigenes ORM), werden abgelehnt.

## Was der Host durchsetzt

- **Mindest-Host-Version.** `plugin.json` muss `attraccessVersion.min` ab `2.0.0-0` deklarieren. Bei npm-Plugins zählt
  die niedrigste von `attraccess.host` in der `package.json` erlaubte Version. Ein Plugin darunter oder ohne Minimum
  wird beim Hochladen, Installieren oder Starten abgelehnt.
- **Keine Datenbank-Berechtigung.** `DATABASE_ACCESS` entfällt. Eigene Daten brauchen `PLUGIN_STORAGE`, das nur Ihre
  eigenen deklarierten Tabellen abdeckt.
- **Keine Legacy-Persistenzdeklaration.** Der Eintrag `persistence.backends`, der TypeORM-Eintrag `migrations`
  (`main.migrations` / `attraccess.migrations`) und Entitätsdeklarationen am Backend-Modul gehören nicht mehr zu 2.0.
- **Namensraum.** Tabellen heißen `plugin_<plugin>_<tabelle>`. Ein Name außerhalb des Namensraums des Plugins oder ein
  Fremdschlüssel auf eine Tabelle eines anderen Plugins oder des Kerns wird abgelehnt.

Ein abgelehntes Plugin wird nicht entpackt, installiert, registriert, migriert oder gestartet, und die Datenbank bleibt
unberührt. Der Fehler nennt das Plugin, gibt den Grund an und verweist auf diese Anleitung (siehe
[Ablehnungen](#ablehnungen)).

## Checkliste

1. `attraccessVersion.min` auf `2.0.0-0` setzen (bei npm-Paketen auch `attraccess.host` auf `^2.0.0-0`).
2. Die Peer-Abhängigkeits- und `attraccess.sdk`-Bereiche für `@attraccess/plugins-backend-sdk`, `-frontend-sdk` und
   `-frontend-ui` auf `^2.0.0-0` anheben.
3. Zugriff auf Host-Entitäten durch [Host-Ports](#host-entitäten-werden-zu-host-ports) ersetzen.
4. Speichert das Plugin Daten: `DATABASE_ACCESS` durch `PLUGIN_STORAGE` ersetzen, `persistence.backends` und den
   Migrationseintrag entfernen und [Entitäten und Migrationen portieren](#typeorm-entitäten-und-migrationen-portieren).
5. `getRepository`/`dataSource`/`runSerialized` durch [`context.storage` und
   `context.persistence.transaction`](#record-port-und-transaktionen) ersetzen.
6. `@attraccess/plugins-backend-sdk/sqlite` aus Importen und esbuild-Externals entfernen und die eigene
   `typeorm`-Abhängigkeit streichen.
7. Neu bauen und gegen einen 2.0-Host testen (Unit-Tests mit dem [In-Memory-Fake](#tests)).

## Host-Entitäten werden zu Host-Ports

Host-Entitätsklassen werden nicht mehr exportiert, und kein Repository erreicht eine Host-Tabelle. Nutzen Sie die Ports:

| 1.x                                            | 2.0                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getRepository(User)` (`READ_USERS`)           | `hostData.users` (`READ_USERS`)                                                                            |
| `getRepository(Resource)` (`ACCESS_RESOURCES`) | `hostData.resources` und `resourceAccess` (`ACCESS_RESOURCES`)                                             |
| `getRepository(Setting)` (`READ_SETTINGS`)     | `hostData.settings` (`READ_SETTINGS`)                                                                      |
| Flow-Knoten-Abfragen über `DATABASE_ACCESS`    | `hostData.flows` (**`TRIGGER_FLOWS`**) und `context.flows.trigger(...)`                                    |
| von Hand geschriebene Audit-Zeilen             | `context.audit` (der Audit-Port)                                                                           |
| von Hand geschriebene Benachrichtigungszeilen  | `context.notifications.dispatch(...)` (`SEND_NOTIFICATIONS`)                                               |
| Sitzungsstart/-ende-Zeilen, Hook-Transaktionen | die Hooks (`preStartHook`, `startCapacityHook`, ... mit `ACCESS_HOOKS`) und die Events `RESOURCE_USAGE_*`  |
| Entitätstypen `User`, `Resource`               | `PluginUserModel`, `PluginResourceModel` aus `@attraccess/application-models` (vom SDK-Root re-exportiert) |

```ts
// 1.x
const row = await context.getRepository(Setting).findOneBy({ parent: 'app', key: 'backend_url' });
const users = await context.getRepository(User).find({ where: { id: In(ids) } });
```

```ts
// 2.0
const url = await context.hostData.settings.getApp('backend_url'); // READ_SETTINGS
const names = await context.hostData.users.getUsernames(ids); // READ_USERS
const nodes = await context.hostData.flows.findNodes({ typePrefix: 'plugin.x.', dataEquals: { controllerId } }); // TRIGGER_FLOWS
```

Event-Nutzlasten enthalten nur neutrale Felder; Tokens und Kontaktdaten gehören nicht dazu. `DATABASE_ACCESS` schloss
`READ_USERS`, `ACCESS_RESOURCES` und `READ_SETTINGS` nie ein: Deklarieren Sie jede, die Sie nutzen. `hostData.flows`
wird jetzt durch `TRIGGER_FLOWS` geschützt, die Hooks allein durch `ACCESS_HOOKS` (`startCapacityHook` braucht keine
Datenbank-Berechtigung mehr).

## TypeORM-Entitäten und -Migrationen portieren

Das Ergebnis der Portierung: Die physischen Tabellen bleiben, wo sie sind, sodass eine aktualisierte Installation alle
ihre Daten behält.

1. **Legacy-Migrationen auflisten.** Sammeln Sie die Klassennamen (mit Zeitstempel-Suffix) **jeder** TypeORM-Migration,
   die das letzte 1.x-Release mitgeliefert hat, in Reihenfolge, zum Beispiel `CreateWidgets1700000000000`.
2. **Das Tabellenlayout beschreiben, das diese Migrationen erzeugen.** Lesen Sie die Migrationen (nicht die Entitäten:
   Sie können abgewichen sein) und schreiben Sie je Tabelle ein `table(...)` mit denselben Spalten, Typen,
   Standardwerten, Nullbarkeiten, Indizes und Fremdschlüsseln. Nutzen Sie `physicalName` für den bestehenden
   Tabellennamen und `column`, wo der Spaltenname vom Feldnamen abweicht. Fremdschlüssel dürfen nur auf Tabellen Ihres
   eigenen Plugins zeigen; eine Spalte, die eine Kerntabelle referenzierte (`userId`, `resourceId`, ...), wird ein
   einfaches `f.integer()` ohne Fremdschlüssel.
3. **Version 1 zur Baseline machen.** Deklarieren Sie eine neutrale Migration `{ version: 1, ... }`, deren Schritte genau
   dieses Layout anlegen. Neuinstallationen führen sie aus; bestehende überspringen sie.
4. **Die Übernahme deklarieren.** Ergänzen Sie `adoption: { legacyMigrations: [...] }` mit der Liste aus Schritt 1.
5. **Spätere Änderungen als Version 2, 3, ... ergänzen**, mit `step.*` und, wenn Zeilen umgeschrieben werden müssen,
   einem Datenschritt, der nur den Record-Port nutzt.
6. **Registrieren** Sie `storage: ihreDefinition` am Backend-Modul und löschen Sie die `entities`-/`persistence`-
   Deklaration, die Entitätsklassen, die TypeORM-Migrationsklassen, `main.migrations` / `attraccess.migrations` und
   `persistence.backends`.
7. **Den Code ersetzen**, der Repositories nutzte, durch den Record-Port (siehe unten), und `DATABASE_ACCESS` im
   Manifest durch `PLUGIN_STORAGE`.

```ts
// 1.x Entität + Migration
@Entity({ name: 'plugin_widgets' })
class Widget {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', name: 'label' }) label!: string;
}
```

```ts
// 2.0 Deklaration
const widgets = table({ id: f.id(), label: f.string() }, { physicalName: 'plugin_widgets' });

export const widgetStorage = definePluginStorage({
  tables: { widgets },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] }],
  adoption: { legacyMigrations: ['CreateWidgets1700000000000'] },
});
```

### Die Baseline- und Übernahmeregel

Beim ersten Start des 2.0-Builds prüft der Host die Legacy-Migrationstabelle des Plugins:

- **Alle** `legacyMigrations` angewendet: Der Host vermerkt die Baseline-Version 1 **ohne etwas auszuführen** und
  macht mit späteren Versionen weiter.
- **Keine** angewendet (Neuinstallation): Version 1 läuft wie üblich.
- **Nur einige** angewendet: Das Plugin wird **abgelehnt** und nichts wird geändert. Ein partieller Legacy-Verlauf
  bedeutet, dass die Datenbank älter ist als Ihr letztes 1.x-Release: **Installieren Sie zuerst das letzte
  1.x-Release**, lassen Sie es seine Migrationen abschließen und aktualisieren Sie dann auf den 2.0-Build.

Version 1 muss das Legacy-Ergebnis daher exakt treffen. Eine Abweichung wird bei der Übernahme nicht erkannt, sie zeigt
sich später als fehlschlagende Abfrage; vergleichen Sie deshalb Spalte für Spalte.

## Record-Port und Transaktionen

```ts
// 1.x
const widgets = context.getRepository(Widget);
await widgets.update({ id, status: 'pending' }, { status: 'confirmed' });
await context.runSerialized(async (manager) => {
  await manager.getRepository(Widget).save(widget);
  await context.mqtt.publish(1, 'widgets/created', '{}'); // I/O innerhalb der Transaktion
});
```

```ts
// 2.0
const { widgets } = context.storage.open(widgetStorage);
const changed = await widgets.update({ id, status: 'pending' }, { status: 'confirmed' }); // atomares Compare-and-Set
await context.persistence.transaction(async (scope) => {
  await widgets.insert(widget, { scope });
  scope.afterCommit(() => context.mqtt.publish(1, 'widgets/created', '{}')); // erst nach dem Commit
});
```

Der Port bietet `insert`, `insertMany`, `get`, `find`, `findOne`, `count`, `update` (liefert die Zahl geänderter Zeilen,
atomar geprüft, also ein Compare-and-Set), `delete`, `upsert` und `aggregate` mit strukturierten Filtern (`eq`, `ne`,
`in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `between`, `isNull`, `startsWith`, `and`, `or`, `not`). Fehler sind die
neutralen `PluginStorageUniqueViolation`, `PluginStorageConflict`, `PluginStorageNotFound` und `PluginStorageInvalid`
statt Treiberfehlern. Details: [Plugin-Speicher](plugins/plugin-storage.md).

Hinweise zur Portierung:

- **Keine Joins.** Fragen Sie Ihre eigenen Tabellen nacheinander ab und nutzen Sie `in`-Filter statt einer Abfrage je
  Zeile.
- **Kein Query Builder, kein rohes SQL.** Aggregate drücken Sie mit `aggregate` aus, Zähler mit `increment(n)` und
  Sperren mit Compare-and-Set-`update`.
- **Zeitstempel** sind `Date` hinein und heraus (UTC), **Dezimalzahlen** sind Strings, JSON-Felder halten jeden
  JSON-Wert.
- **Transaktionen.** Geben Sie `{ scope }` an jeden Aufruf, der teilnehmen soll; Effekte gehören in
  `scope.afterCommit`. Die Regeln (kurzer Callback, kein Verschachteln, keine Kern-Sitzungsschreibvorgänge darin)
  bleiben.
- `context.persistence` hat nur `transaction`. `persistence.backend`, `supports(...)` und jede Engine-Naht entfallen.

### Start-Kapazitäts-Hook

```ts
// 1.x
const held = await countSlotsHeldForOthers(ctx.manager, ctx.resourceId, ctx.userId, ctx.now);
```

```ts
// 2.0
const slots = await heldSlots.find({ where: { resourceId: ctx.resourceId } }, { scope: ctx.scope });
```

`ctx.scope` ist die Start-Transaktion des Hosts: Lesen Sie nur darüber und starten Sie im Hook nie eine Transaktion.

## Tests

Plugin-Tests brauchen keine Datenbank. Bauen Sie den Fake-Kontext mit `createInMemoryPluginStorage()` aus dem SDK und
setzen Sie ihn als `storage` (und seinen Transaktions-Runner als `persistence`). Er folgt dem Vertrag des Record-Ports:
Filter, Compare-and-Set, neutrale Fehler und Transaktions-Scopes. Siehe [Plugin-Speicher](plugins/plugin-storage.md#5-testen).

## Bundling

Externalisieren Sie in Ihrem Backend-Build nur noch `@attraccess/plugins-backend-sdk` (den Unterpfad `/sqlite` gibt es
nicht mehr) und streichen Sie die eigene `typeorm`-Abhängigkeit:

```bash
--external:@attraccess/plugins-backend-sdk
```

Es gibt kein Migrations-Bundle mehr: Die Migrationen stehen in Ihrer Deklaration im Backend-Einstiegspunkt.

## Ablehnungen

Jede Ablehnung geschieht vor jeder Änderung, nennt das Plugin, gibt den Grund an und verweist auf diese Anleitung:

| Grund                                                    | Was die Meldung sagt                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| SDK 1.x (kein oder zu niedriges `attraccessVersion.min`) | Das Plugin zielt auf das SDK 1.x, das dieser Host nicht mehr unterstützt; neu bauen und `>= 2.0.0-0` deklarieren.                  |
| `DATABASE_ACCESS` angefordert                            | Die Berechtigung wurde entfernt; Plugins haben keinen Datenbankzugriff; `PLUGIN_STORAGE` deklarieren und `context.storage` nutzen. |
| Legacy-Persistenzdeklaration                             | `persistence.backends`, ein TypeORM-Migrationseintrag oder Entitäten werden nicht unterstützt; stattdessen `storage` deklarieren.  |
| Speicher ohne `PLUGIN_STORAGE`                           | Das Plugin deklariert Speicher, aber nicht die Berechtigung `PLUGIN_STORAGE`.                                                      |
| Name außerhalb des Namensraums / Fremdschlüssel          | Tabelle, physischer Name oder Fremdschlüssel zeigt aus den eigenen Tabellen des Plugins heraus.                                    |
| Ungültige Migrationsliste                                | Versionen steigen nicht streng ab 1 an, oder ein Schritt oder Feld ist ungültig.                                                   |
| Partieller Legacy-Verlauf                                | Nur einige `adoption.legacyMigrations` sind angewendet; zuerst das letzte 1.x-Release installieren. Nichts wurde geändert.         |

Jede Meldung endet mit `Migration guide: https://docs.attraccess.org/#/en/plugins/migrating-to-2`. Ein abgelehntes
Plugin bleibt mit dem Fehler in der Plugin-Liste und seine Daten bleiben unverändert; das Löschen entfernt seine Dateien,
ohne seinen Code auszuführen.

## Frontend-SDK

`@attraccess/plugins-frontend-sdk` folgt derselben Trennung. `AttraccessFrontendPluginAuthData.user` ist jetzt ein
`PluginUserModel` (`id`, `username`, `locale`, `isDisabled`) statt der `User`-Entität. Ein Frontend-Plugin, das andere
Benutzerfelder wie `email`, `creditBalance` oder `createdAt` las, lädt sie über den API-Client. Installieren Sie
`@attraccess/plugins-frontend-sdk` und `@attraccess/plugins-frontend-ui` im selben `^2.0.0-0`-Bereich.

Die Beispiele unter `examples/` und die eingebauten Plugins (Shelly, WAGO, Matter, Reservierungen, RabbitMQ) zeigen das
2.0-Manifest und den deklarierten Speicher.
