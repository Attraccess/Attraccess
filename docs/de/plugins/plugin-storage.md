# Plugin-Speicher

<!-- llms-description: Wie ein Plugin eigene Daten ohne Datenbankzugriff hält: Tabellen deklarieren, neutrale Migrationen mitliefern, den Record-Port context.storage nutzen, Transaktionen, Fehler und Test-Fakes. -->

Ein Plugin hat **keinen Datenbankzugriff**. Es kann keine Verbindung öffnen, kein SQL ausführen, kein TypeORM nutzen und
keine Kerntabelle erreichen. Was es für eigene Daten braucht, _deklariert_ es: Tabellen in einem backend-neutralen
Schema, neutrale Migrationen dafür und zur Laufzeit den **Record-Port** `context.storage`. Engine, DDL, Transaktionen,
Migrationsverwaltung und Backups gehören dem Host, der damit frei bleibt, eine andere Engine zu betreiben.

> [!TIP]
> Speicher ist optional. Ein Plugin, das nichts speichert oder nur liest, was die Host-Ports bieten (`hostData`,
> `resourceAccess`), deklariert nichts und braucht dafür keine Berechtigung.

Kommen Sie von 1.x? Lesen Sie zuerst [Plugins auf SDK 2.0 umstellen](plugins/migrating-to-2.md); dort werden TypeORM-
Entitäten und -Migrationen Schritt für Schritt auf dieses Modell übertragen.

## Überblick

| Baustein      | Was es ist                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Berechtigung  | `PLUGIN_STORAGE` in `plugin.json`. Sie deckt `context.storage` und `context.persistence` nur für **eigene Tabellen** ab. |
| Deklaration   | `definePluginStorage({ tables, migrations, adoption })`, registriert als `PluginBackendModule.storage`.                  |
| Record-Port   | `context.storage.open(definition)` liefert je Tabelle eine typisierte API.                                               |
| Transaktionen | `context.persistence.transaction(async (scope) => ...)`; geben Sie `{ scope }` an jeden Aufruf, der teilnehmen soll.     |
| Host          | Erzeugt das DDL, führt die Migrationen aus, führt je Plugin einen Schemastand, sichert und entfernt die Daten.           |

Alles wird von `@attraccess/plugins-backend-sdk` exportiert. Es gibt keinen Engine-Unterpfad.

## 1. Tabellen und Migrationen deklarieren

```ts
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

const widgets = table(
  {
    id: f.id(),
    label: f.string({ length: 120 }),
    ownerUserId: f.integer(), // eine Kern-ID: ein einfacher Integer, nie ein Verweis auf eine Kerntabelle
    status: f.string().withDefault('pending'),
    note: f.text().optional(),
    createdAt: f.timestamp().withDefault({ now: true }),
  },
  { indexes: [{ name: 'idx_widgets_owner', fields: ['ownerUserId'] }] },
);

export const widgetStorage = definePluginStorage({
  tables: { widgets },
  migrations: [{ version: 1, name: 'create-widgets', steps: [step.createTable('widgets', widgets)] }],
});
```

`tables` ist die **Kopfform**: das Layout, das die Migrationen nach der letzten Version ergeben. Zeilen- und
Filtertypen werden daraus abgeleitet.

### Felder

| Builder                       | Werttyp im Code      | Hinweise                                                          |
| ----------------------------- | -------------------- | ----------------------------------------------------------------- |
| `f.string({ length })`        | `string`             | Begrenzter Text, Standardlänge 255.                               |
| `f.text()`                    | `string`             | Unbegrenzter Text.                                                |
| `f.integer()`                 | `number`             | Sichere Ganzzahl.                                                 |
| `f.decimal(precision, scale)` | `string`             | Exakte Dezimalzahl als String wie `"12.50"`, nie als Gleitkomma.  |
| `f.boolean()`                 | `boolean`            |                                                                   |
| `f.timestamp()`               | `Date`               | Ein Zeitpunkt, UTC, Millisekundengenauigkeit.                     |
| `f.date()`                    | `string`             | Kalendertag `"YYYY-MM-DD"` ohne Zeitzone.                         |
| `f.json()`                    | beliebiger JSON-Wert |                                                                   |
| `f.uuid()`                    | `string`             | UUID in kanonischer Kleinschreibung.                              |
| `f.id()` / `f.uuidId()`       | `number` / `string`  | Generierter Primärschlüssel (Auto-Increment oder zufällige UUID). |

Modifikatoren: `.optional()` erlaubt `null`, `.withDefault(wert)` setzt einen Standardwert (`{ now: true }` für einen
beim Anlegen gesetzten Zeitstempel). Felder mit Standardwert, generiertem Wert oder `null` sind beim Einfügen optional.
`{ column: 'created_at' }` setzt den Spaltennamen auf Host-Seite, wenn er vom Feldnamen abweicht (nötig, wenn Sie eine
bestehende Tabelle übernehmen).

`table(fields, { primaryKey, indexes, foreignKeys, physicalName })`: Der Primärschlüssel ist standardmäßig das
generierte Feld. Fremdschlüssel dürfen nur auf **Tabellen desselben Plugins** zeigen. Kern-IDs (Benutzer, Ressource,
Flow-Knoten) bleiben einfache `integer`- oder `uuid`-Felder ohne Fremdschlüssel. `physicalName` behält den Namen einer
Tabelle, die in installierten Datenbanken schon existiert; ohne ihn leitet der Host `plugin_<plugin>_<logisch>` ab. Der
Host lehnt Namen außerhalb des Namensraums des Plugins ab.

### Neutrale Migrationen

Migrationen sind Versionen `1, 2, 3, ...`, streng aufsteigend. Jede hat deklarative **Schritte** und optional einen
anschließenden **Datenschritt**:

```ts
migrations: [
  { version: 1, name: 'create-widgets', steps: [step.createTable('widgets', widgets)] },
  {
    version: 2,
    name: 'add-priority',
    steps: [
      step.addColumn('widgets', 'priority', f.integer().withDefault(0)),
      step.addIndex('widgets', { fields: ['priority'] }),
    ],
    data: async ({ tables }) => {
      await tables.widgets.update({ status: 'pending' }, { priority: 1 });
    },
  },
];
```

| Schritt                                    | Wirkung                 |
| ------------------------------------------ | ----------------------- |
| `step.createTable(name, definition)`       | Legt eine Tabelle an.   |
| `step.dropTable(name)`                     | Löscht eine Tabelle.    |
| `step.addColumn(table, field, definition)` | Fügt eine Spalte hinzu. |
| `step.dropColumn(table, field)`            | Entfernt eine Spalte.   |
| `step.renameColumn(table, from, to)`       | Benennt eine Spalte um. |
| `step.addIndex(table, index)`              | Fügt einen Index hinzu. |
| `step.dropIndex(table, name)`              | Entfernt einen Index.   |

Der Host übersetzt jeden Schritt in der angegebenen Reihenfolge in DDL für die Engine, die er betreibt. Ein
**Datenschritt** läuft nach den Schritten seiner Version und erhält den Record-Port Ihrer eigenen Tabellen (`tables`)
und sonst nichts: kein SQL, keine Host-Ports. Version `1` ist die **Baseline**: Sie muss genau das Layout beschreiben,
das Ihr erstes Release angelegt hat.

Jede Migration läuft zusammen mit dem Verlaufseintrag in einer Alles-oder-nichts-Transaktion. Es gibt keine
`down`-Schritte: Der Host entfernt Ihre Tabellen beim Deinstallieren selbst.

### Übernahme von 1.x-Installationen

Ein Plugin, das in 1.x Daten über TypeORM-Migrationen gespeichert hat, listet die Klassennamen **aller** seiner
Legacy-Migrationen:

```ts
adoption: { legacyMigrations: ['CreateWidgets1700000000000', 'AddNote1710000000000'] },
```

Ist jede aufgeführte Migration in der Legacy-Migrationstabelle des Plugins als angewendet eingetragen, vermerkt der Host
die Baseline-Version 1 **ohne etwas auszuführen**: Tabellen und Daten bleiben bestehen, spätere Versionen setzen dort an.
Sind nur einige angewendet, verweigert der Host das Plugin und ändert nichts. Die Portierungsschritte stehen in
[Plugins auf SDK 2.0 umstellen](plugins/migrating-to-2.md#typeorm-entitäten-und-migrationen-portieren).

### Registrieren

```ts
const plugin: PluginBackendModule = {
  storage: widgetStorage,
  register(context) {
    /* ... */
  },
};
```

## 2. Den Record-Port nutzen

```ts
const { widgets } = context.storage.open(widgetStorage);

const created = await widgets.insert({ label: 'Drehbank', ownerUserId: 7 }); // generierte ID und Standardwerte kommen zurück
const mine = await widgets.find({
  where: { ownerUserId: 7, status: { in: ['pending', 'confirmed'] } },
  orderBy: [{ field: 'createdAt', direction: 'desc' }],
  limit: 20,
});
```

`open` bedient nur die Definition, die Ihr Plugin als `storage` registriert hat. Es gibt keinen Weg, die Tabelle eines
anderen Plugins oder eine Kerntabelle zu benennen.

| Operation                          | Ergebnis                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `insert(row)` / `insertMany(rows)` | Die gespeicherte(n) Zeile(n) mit generierten Schlüsseln und Standardwerten.                                                              |
| `get(key)`                         | Zeile per Primärschlüssel (ein Wert, bei zusammengesetzten Schlüsseln ein Objekt) oder `null`.                                           |
| `find(query)` / `findOne(query)`   | Zeilen zu `{ where, orderBy, limit, offset }`.                                                                                           |
| `count(where)`                     | Anzahl passender Zeilen.                                                                                                                 |
| `update(where, patch)`             | Anzahl geänderter Zeilen. Die Bedingung wird atomar mit dem Schreiben geprüft: ein **Compare-and-Set** (siehe unten).                    |
| `delete(where)`                    | Anzahl entfernter Zeilen.                                                                                                                |
| `upsert(row, { conflictOn })`      | Fügt ein oder aktualisiert die Zeile mit denselben Werten von `conflictOn` (ein deklarierter Unique-Schlüssel oder der Primärschlüssel). |
| `aggregate(field, where)`          | `{ min, max, sum, count }` über die passenden Zeilen.                                                                                    |

### Filter

Ein `where`-Objekt verknüpft mehrere Felder mit UND. Ein Feld nimmt einen einfachen Wert (Gleichheit), `null` oder
Operatoren: `eq`, `ne`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `between: [a, b]`, `isNull`, `startsWith` (Text,
Groß-/Kleinschreibung beachtet). Kombinieren Sie mit `{ and: [...] }`, `{ or: [...] }` und `{ not: ... }`. Werte
folgen den obigen Feldtypen: `Date` für Zeitstempel, Strings für Dezimalzahlen.

Es gibt **keine Joins**. Lesen Sie über mehrere Tabellen mit mehreren Aufrufen und nutzen Sie einen `in`-Filter statt
einer Abfrage je Zeile (kein N+1 auf heißen Pfaden):

```ts
const bookings = await bookingsTable.find({ where: { day: '2026-01-05' } });
const items = await itemsTable.find({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
```

### Compare-and-Set

`update` liefert, wie viele Zeilen sich geändert haben, und wertet sein `where` atomar mit dem Schreiben aus. Damit ist
es der Baustein für Leases, Claims und Zustandsautomaten:

```ts
const won = await bookings.update({ id, status: 'pending' }, { status: 'confirmed' });
if (won === 0) throw new ConflictException('Jemand anderes war schneller');
```

Integer-Felder akzeptieren im Patch auch `increment(n)`: `update({ id }, { attempts: increment(1) })` addiert atomar.

### Fehler

Die Fehler sind neutral und auf jeder Engine gleich; alle erweitern `PluginStorageError` und tragen einen `code`.

| Fehler                         | `code`             | Bedeutung                                                                                                       |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `PluginStorageUniqueViolation` | `UNIQUE_VIOLATION` | Ein Unique-Schlüssel oder der Primärschlüssel war schon vergeben.                                               |
| `PluginStorageConflict`        | `CONFLICT`         | Ein Wettlauf ging verloren oder die Datenbank war ausgelastet. Die ganze Transaktion zu wiederholen ist sicher. |
| `PluginStorageNotFound`        | `NOT_FOUND`        | Eine benötigte Zeile existiert nicht.                                                                           |
| `PluginStorageInvalid`         | `INVALID`          | Nicht deklarierte Tabelle oder Feld, ungültiger Wert oder nicht unterstützter Filter.                           |

## 3. Transaktionen

`context.persistence.transaction(work)` führt `work(scope)` als eine atomare, isolierte Einheit aus. Sie wird
committet, wenn `work` abschließt, und zurückgerollt, wenn es wirft. Geben Sie `{ scope }` an jeden Speicheraufruf (und
an Host-Ports, die einen Scope annehmen, etwa `hostData.resources.get(id, scope)`), der teilnehmen soll. Ein
Prüfen-dann-Schreiben-Ablauf innerhalb einer Transaktion lässt sich nicht überholen: Der Host ordnet die Transaktionen
oder lässt eine scheitern, die dann zurückgerollt wird.

```ts
await context.persistence.transaction(async (scope) => {
  const clash = await bookings.count({ day, slot }, { scope });
  if (clash > 0) throw new ConflictException('OVERLAP');
  await bookings.insert({ day, slot, userId }, { scope });
  // Läuft erst nach dem Commit, nie bei Rollback. Ein fehlschlagender Callback wird protokolliert und macht den Commit nicht rückgängig.
  scope.afterCommit(() => context.mqtt.publish(1, 'bookings/created', '{}'));
});
```

Regeln:

- `work` kurz halten und auf Speicherzugriffe und lesende Host-Port-Aufrufe beschränken. Keine HTTP-, MQTT-, E-Mail-
  oder andere Ein-/Ausgabe darin; solche Effekte registrieren Sie mit `scope.afterCommit`.
- `transaction`-Aufrufe nicht verschachteln: Der Host weist das ab. Geben Sie den `scope` an Hilfsfunktionen weiter.
- Ein Aufruf ohne `{ scope }` läuft in einer eigenen kurzen Transaktion und sieht die noch nicht committeten
  Schreibvorgänge von `work` **nicht**. Vergessen Sie den Scope, lesen Sie veraltete Daten; geben Sie ihn deshalb
  konsequent mit.
- In `work` nicht auf Kern-Vorgänge warten, die schreiben (Sitzungsstart oder -ende).
- Transaktionen werden pro Host-Prozess serialisiert. Ausschluss über mehrere API-Instanzen braucht eine eigene Sperre;
  das Reservierungs-Plugin läuft deshalb mit einer Instanz (siehe
  [Reservierungen](plugins/reservations/administration.md#betrieb-mit-einer-instanz)).

Der Scope im `startCapacityHook` (`ctx.scope`) ist die Start-Transaktion des Kerns: Lesen Sie darüber mit
`{ scope: ctx.scope }`, schreiben Sie nie und rufen Sie darauf nie `afterCommit` auf. Siehe
[Start-Kapazität](plugins/developing-plugins.md#start-kapazität-auf-geteilten-maschinen).

## 4. Lebenszyklus

| Ereignis                           | Was der Host tut                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation, Upgrade, Start       | Prüft die Deklaration und wendet dann ausstehende Migrationen an (jede in einer Transaktion), bevor Plugin-Code startet. Bereits angewendete Versionen werden übersprungen.   |
| Bestehende 1.x-Installation        | Übernimmt die Baseline, wenn jeder Eintrag aus `adoption.legacyMigrations` angewendet ist; verweigert einen partiellen Verlauf, ohne etwas zu ändern.                         |
| Austausch (Upgrade oder Downgrade) | Blockiert, wenn der gespeicherte Schemastand neuer ist als die Migrationen des Bundles, da der Rückschritt Daten verwerfen würde. Es ändert sich nichts.                      |
| Deinstallation                     | Entfernt die deklarierten Tabellen des Plugins und seinen Schemastand in einer Transaktion. Die Dateien werden auch bei einem Fehler entfernt; der Fehler wird protokolliert. |
| Backup und Restore                 | Plugin-Tabellen reisen mit dem Datenbank-Backup, zusammen mit dem Schemastand des Plugins. Ein Restore bringt beides als eine konsistente Einheit zurück.                     |

Schlägt eine Migration fehl, wird die ganze Version zurückgerollt (keine Tabelle und kein Verlaufseintrag bleibt), das
Plugin wird als fehlgeschlagen markiert und eine korrigierte Version installiert sich aus einem sauberen Zustand. Ein
fehlschlagendes Plugin blockiert nie den Host-Start oder andere Plugins.

## 5. Testen

Das SDK liefert eine In-Memory-Umsetzung des Ports. Sie folgt demselben Vertrag (Filter, Compare-and-Set, neutrale
Fehler, Scopes) und braucht keine Datenbank:

```ts
import { createInMemoryPluginStorage } from '@attraccess/plugins-backend-sdk/testing';

const storage = createInMemoryPluginStorage();
const context = { ...fakeContext, storage };
```

Lassen Sie Ihren Service in Unit-Tests dagegen laufen. Verhalten, das nur eine echte Engine zeigt (Sperren, große
Tabellen), decken die Conformance-Tests des Hosts für den Port ab; Ihre Tests müssen daher keine Datenbank starten.

## Ablehnungen

Der Host verweigert ein Plugin **vor jeder Änderung** (nichts wird entpackt, registriert, migriert oder gestartet),
wenn seine Deklaration die Regeln verletzt. Der Fehler nennt das Plugin, gibt den Grund an und verweist auf die
[Umstellungsanleitung](plugins/migrating-to-2.md). Typische Gründe:

- das Plugin deklariert keine Mindest-Host-Version ab `2.0.0-0`;
- es fordert die entfernte Berechtigung `DATABASE_ACCESS` an oder nutzt `context.storage` ohne `PLUGIN_STORAGE`;
- es liefert noch einen TypeORM-Migrationseintrag, `persistence.backends` oder Entitätsdeklarationen mit;
- ein Tabellen- oder physischer Name liegt außerhalb des Namensraums des Plugins, oder ein Fremdschlüssel zeigt aus dem
  Plugin heraus;
- die Migrationsversionen steigen nicht streng ab 1 an, oder ein Schritt ist ungültig;
- in einer installierten Datenbank ist nur ein Teil von `adoption.legacyMigrations` angewendet.

## Siehe auch

- [Plugins auf SDK 2.0 umstellen](plugins/migrating-to-2.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
- [Plugins installieren](plugins/installing-plugins.md)
