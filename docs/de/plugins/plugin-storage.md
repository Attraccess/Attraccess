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
  { indexes: [{ fields: ['ownerUserId'] }] }, // den Indexnamen vergibt der Host
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
Flow-Knoten) bleiben einfache `integer`- oder `uuid`-Felder ohne Fremdschlüssel.

### Tabellen- und Indexnamen

Tabellen und Indizes benennt der Host; Sie benennen nur die logischen Tabellen und Felder.

- **Namensraum.** Der Namensraum eines Plugins ist sein Name in Kleinbuchstaben, in dem jede Folge anderer Zeichen als
  `a-z` und `0-9` durch `_` ersetzt ist, ohne `_` am Anfang oder Ende (`@example/foo-bar` → `example_foo_bar`). Eine
  Tabelle ohne `physicalName` heißt `plugin_<namensraum>_<tabelle>`, mit dem logischen Namen in Snake Case.
  Indexnamen werden aus Tabelle und Feldern erzeugt.
- **Eigene Namen nur bei Übernahme.** `physicalName` und ein expliziter Index-`name` sind nur an Tabellen erlaubt, die
  Version 1 einer Definition mit `adoption` anlegt, um die Tabellen eines 1.x-Release zu übernehmen (siehe
  [Übernahme von 1.x-Installationen](#Übernahme-von-1x-installationen)). Überall sonst wird die Deklaration abgelehnt.
- **Verbotene Namen.** Ein physischer Name darf keine Kerntabelle sein, nicht mit einem vom Host reservierten Präfix
  beginnen und nicht im Namensraum eines anderen installierten Plugins liegen. Das gilt in beide Richtungen: Ein
  Plugin `demo` darf `plugin_demo_extra_notes` nicht nutzen, solange `demo-extra` installiert ist, und `demo-extra`
  keinen Namen von `demo`.
- **Ein Namensraum, ein Plugin.** Zwei Plugins, deren Namensräume sich überschneiden, können nicht gemeinsam
  installiert sein: Die Namensräume sind gleich (`foo-bar` und `foo_bar`), oder ein Tabellenpräfix des einen beginnt
  mit einem Präfix des anderen (`demo` und `demo-extra`; `wago` und `plugin-wago`, dessen kurzes Präfix
  `plugin_wago_` jede Tabelle von `wago` enthält). Ein Upload oder eine npm-Installation wird allein anhand der Namen
  gegen jedes installierte Plugin mit Speicher abgelehnt, ob geladen oder nicht (ohne Lizenz, in Quarantäne). Kommt
  ein solches Plugin trotzdem hinzu (ein in das Plugin-Verzeichnis kopierter Ordner), lädt ein Plugin mit bereits
  festgeschriebenem Speicher weiter und der Neuling wird abgelehnt; haben beide oder keines festgeschriebenen
  Speicher, wird das Plugin abgelehnt, dessen Namen im Namensraum des anderen liegen, und zwei Plugins mit demselben
  Namensraum werden beide abgelehnt.

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

Alle ausstehenden Versionen laufen zusammen mit ihren Verlaufseinträgen in **einer** Alles-oder-nichts-Transaktion:
Scheitert Version 3, wird auch Version 2 desselben Laufs zurückgerollt, und der nächste Start versucht beide erneut. Es
gibt keine `down`-Schritte: Der Host entfernt Ihre Tabellen beim Deinstallieren selbst.

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

Version 1 einer übernehmenden Definition nennt die bestehenden Tabellen und Indizes:

```ts
// Plugin "widgets". Sein 1.x-Release hat die Tabelle plugin_widgets_items mit dem Index idx_widgets_items_owner angelegt.
const items = table(
  { id: f.id(), label: f.string(), ownerUserId: f.integer({ column: 'owner_user_id' }) },
  {
    physicalName: 'plugin_widgets_items',
    indexes: [{ name: 'idx_widgets_items_owner', fields: ['ownerUserId'] }],
  },
);

export const widgetStorage = definePluginStorage({
  tables: { items },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('items', items)] }],
  adoption: { legacyMigrations: ['CreateWidgetItems1700000000000'] },
});
```

Grenzen übernommener Tabellen:

- `f.decimal` ist an einer übernommenen Tabelle nicht erlaubt (1.x hat Dezimalzahlen anders gespeichert). Behalten Sie
  eine solche Spalte so, wie sie gespeichert ist, etwa als `f.string()`, oder kopieren Sie sie in eine neue Tabelle
  (siehe unten).
- Es gibt keinen Binärtyp. Eine 1.x-Spalte vom Typ `blob`, als `f.text()` deklariert, liest sich als Base64-Text;
  schreiben Sie ebenfalls Base64.

**1.x-Namen, die der Host ablehnt.** Ist ein 1.x-Tabellenname einer der oben verbotenen Namen, lässt sich die Tabelle
nicht deklarieren; ein 2.0-Build kann sie dann weder lesen noch übernehmen noch löschen. Wenden Sie sich an die
Attraccess-Maintainer, bevor Sie ein solches Plugin veröffentlichen. Lässt sich eine 1.x-Tabelle übernehmen, Sie
wollen ihr Layout aber hinter sich lassen: Übernehmen Sie sie in Version 1, legen Sie in Version 2 eine neue Tabelle
(mit abgeleitetem Namen) an, kopieren Sie die Zeilen im Datenschritt und löschen Sie die übernommene Tabelle mit
`step.dropTable`.

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

- `in` und `notIn` nehmen kein `null`. NULL finden Sie mit `isNull` (oder `null`), bei Bedarf über `or` verknüpft:
  `{ or: [{ note: { in: ['a', 'b'] } }, { note: { isNull: true } }] }`.
- Ein leeres Operator-Objekt wie `{ status: {} }` wird abgelehnt (`PluginStorageInvalid`), damit ein vergessener
  Operator nie alles trifft.
- Ein leeres `where` auf oberster Ebene (`{}`) trifft **alle Zeilen**. Beachten Sie das bei `update` und `delete`.
- Filterwerte werden nur auf den Typ des Feldes geprüft (ein String für ein String-Feld, ein `Date` für einen
  Zeitstempel). Länge, Genauigkeit und andere Spaltengrenzen werden beim Schreiben geprüft, nicht in Filtern. Eine
  Dezimalzahl mit mehr Nachkommastellen als das Feld wird exakt verglichen: `eq` trifft nichts, die Bereichsoperatoren
  vergleichen den Wert wie angegeben.
- `null` geht nur mit `eq`/`ne` (gleichbedeutend mit `isNull`); alle anderen Operatoren lehnen es ab.
- `in: []` trifft nichts; `notIn: []` trifft jede Zeile mit Wert. Zeilen ohne Wert (NULL) treffen nie `ne`, `notIn`,
  einen Vergleich oder ein `not` darum herum.
- `and`, `or` und `not` dürfen neben Feldbedingungen im selben Objekt stehen; alles wird mit UND verknüpft. `and: []`
  ist wahr, `or: []` ist falsch.
- Boolesche und JSON-Felder lassen sich nicht sortieren und nicht mit `lt`/`gt`/`between` vergleichen.
- Ergebnisse kommen in `orderBy`-Reihenfolge, danach aufsteigend nach Primärschlüssel (auch ohne `orderBy`), damit
  Seiten stabil sind. NULL steht aufsteigend vorn und absteigend hinten.
- `startsWith` unterscheidet Groß- und Kleinschreibung und zählt Zeichen (Codepoints).

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

Integer-Felder akzeptieren im Patch auch `increment(n)`: `update({ id }, { attempts: increment(1) })` addiert atomar;
ein NULL-Wert zählt als 0. `upsert` braucht einen Wert für jedes `conflictOn`-Feld, und ein Patch darf keine
Schlüssel- oder erzeugten Felder ändern.

### Fehler

Die Fehler sind neutral und auf jeder Engine gleich; alle erweitern `PluginStorageError` und tragen einen `code`.

| Fehler                         | `code`             | Bedeutung                                                                                       |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| `PluginStorageUniqueViolation` | `UNIQUE_VIOLATION` | Ein Unique-Schlüssel oder der Primärschlüssel war schon vergeben.                               |
| `PluginStorageConflict`        | `CONFLICT`         | Ein Wettlauf ging verloren oder die Datenbank war ausgelastet. Zurückgerollt, nicht wiederholt. |
| `PluginStorageNotFound`        | `NOT_FOUND`        | Eine benötigte Zeile existiert nicht.                                                           |
| `PluginStorageInvalid`         | `INVALID`          | Nicht deklarierte Tabelle oder Feld, ungültiger Wert oder nicht unterstützter Filter.           |

## 3. Transaktionen

`context.persistence.transaction(work)` führt `work(scope)` als eine atomare, isolierte Einheit aus. Sie wird
committet, wenn `work` abschließt, und zurückgerollt, wenn es wirft. Geben Sie `{ scope }` an jeden Speicheraufruf (und
an Host-Ports, die einen Scope annehmen, etwa `hostData.resources.get(id, scope)`), der teilnehmen soll.

**Der Vertrag:** Der Host ordnet gleichzeitige Transaktionen Ihres Plugins (eine läuft nach der anderen) oder lässt
eine davon mit `PluginStorageConflict` scheitern, die dann zurückgerollt wird. Ein Prüfen-dann-Schreiben-Ablauf
innerhalb einer Transaktion lässt sich daher nicht überholen. Ein Schreibvorgang ohne Scope ist eine eigene
Transaktion und wird genauso eingeordnet. Der Host wiederholt **nicht**: Halten Sie externe Effekte in
`scope.afterCommit`, damit der Aufrufer die ganze Transaktion nach einem Konflikt gefahrlos erneut ausführen kann.

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
- Geben Sie `{ scope }` an jeden Schreibaufruf in `work`. Ein Schreibaufruf ohne Scope wird mit `PluginStorageInvalid`
  abgewiesen. Nur ein Lesezugriff ohne Scope läuft außerhalb der Transaktion, und er sieht die noch nicht committeten
  Schreibvorgänge von `work` **nicht**.
- In `work` nicht auf Kern-Vorgänge warten, die schreiben (Sitzungsstart oder -ende).
- Wie der Host Transaktionen ordnet, ist ein Detail der Engine. Unter PostgreSQL nimmt jede Transaktion eines Plugins
  zuerst eine Sperre dieses Plugins in der Datenbank (ein Advisory Lock auf Transaktionsebene), daher gilt die
  Reihenfolge auch über mehrere API-Instanzen hinweg. Arbeit des Kerns und andere Plugins warten nicht darauf. Eine
  Transaktion, die länger als das Lock-Timeout der Datenbank auf die Sperre wartet, scheitert mit
  `PluginStorageConflict`. Halten Sie Transaktionen kurz: Die nächste Transaktion Ihres Plugins wartet auf sie.
- Die Reihenfolge gilt nur für Datenbankarbeit. Zustand, den ein Plugin in seinem Prozess hält (eine Sperre im
  Prozess, ein Cache, ein Scheduler), teilen API-Instanzen nicht; das Reservierungs-Plugin läuft deshalb mit einer
  Instanz (siehe [Reservierungen](plugins/reservations/administration.md#betrieb-mit-einer-instanz)).

Der Scope im `startCapacityHook` (`ctx.scope`) ist die Start-Transaktion des Kerns: Lesen Sie darüber mit
`{ scope: ctx.scope }`, schreiben Sie nie und rufen Sie darauf nie `afterCommit` auf. In einem Host-Hook, der Ihnen
einen Host-Scope übergibt, wird ein Schreibaufruf oder eine `transaction` ohne diesen Scope abgewiesen. Siehe
[Start-Kapazität](plugins/developing-plugins.md#start-kapazität-auf-geteilten-maschinen).

## 4. Lebenszyklus

| Ereignis                           | Was der Host tut                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation, Upgrade, Start       | Prüft die Deklaration und wendet dann alle ausstehenden Migrationen in einer Transaktion an, bevor Plugin-Code startet. Angewendete Versionen werden übersprungen.           |
| Bestehende 1.x-Installation        | Übernimmt die Baseline, wenn jeder Eintrag aus `adoption.legacyMigrations` angewendet ist; verweigert einen partiellen Verlauf, ohne etwas zu ändern.                        |
| Austausch (Upgrade oder Downgrade) | Blockiert, wenn der gespeicherte Schemastand neuer ist als die Migrationen des Bundles, da der Rückschritt Daten verwerfen würde. Es ändert sich nichts.                     |
| Deinstallation                     | Entfernt die Tabellen der Versionen, die das Plugin committet hat, und seinen Schemastand. Die Dateien werden auch bei einem Fehler entfernt; der Fehler wird protokolliert. |
| Backup und Restore                 | Plugin-Tabellen reisen mit dem Datenbank-Backup, zusammen mit dem Schemastand des Plugins. Ein Restore bringt beides als eine konsistente Einheit zurück.                    |

Schlägt eine Migration fehl, wird der ganze Lauf zurückgerollt (keine Tabelle und kein Verlaufseintrag dieses Laufs
bleibt), das Plugin wird als fehlgeschlagen markiert und eine korrigierte Version setzt beim zuletzt committeten Stand
an. Ein
fehlschlagendes Plugin blockiert nie den Host-Start oder andere Plugins.

## 5. Testen

Das SDK liefert eine In-Memory-Umsetzung des Ports. Sie folgt demselben Vertrag (Filter, Compare-and-Set, neutrale
Fehler, Scopes) und braucht keine Datenbank:

```ts
import { createInMemoryPluginStorage } from '@attraccess/plugins-backend-sdk';

const fake = createInMemoryPluginStorage(widgetStorage);
const context = { ...fakeContext, storage: fake.storage, persistence: fake.persistence };
// fake.rows('widgets') liefert die committeten Zeilen für Prüfungen; fake.reset() leert die Tabellen.
```

Lassen Sie Ihren Service in Unit-Tests dagegen laufen. Verhalten, das nur eine echte Engine zeigt (Sperren, große
Tabellen), decken die Conformance-Tests des Hosts für den Port ab; Ihre Tests müssen daher keine Datenbank starten.

## Ablehnungen

Der Host verweigert ein Plugin **vor jeder Änderung** (nichts wird entpackt, registriert, migriert oder gestartet),
wenn seine Deklaration die Regeln verletzt. Der Fehler nennt das Plugin, gibt den Grund an und verweist auf die
[Umstellungsanleitung](plugins/migrating-to-2.md). Typische Gründe:

- das Plugin deklariert keine Mindest-Host-Version ab `2.0.0-0`;
- es fordert die entfernte Berechtigung `DATABASE_ACCESS` an oder nutzt `context.storage` ohne `PLUGIN_STORAGE`;
- es liefert noch einen TypeORM-Migrationseintrag oder `persistence.backends` mit, oder sein Bundle importiert TypeORM
  oder einen Datenbanktreiber;
- ein `physicalName` oder Indexname steht außerhalb einer übernehmenden Version 1, ein physischer Name ist verboten
  (siehe [Tabellen- und Indexnamen](#tabellen-und-indexnamen)), ein anderes installiertes Plugin hat denselben
  oder einen überschneidenden Namensraum, oder ein Fremdschlüssel zeigt aus dem Plugin heraus;
- die Migrationsversionen steigen nicht streng ab 1 an, oder ein Schritt ist ungültig;
- in einer installierten Datenbank ist nur ein Teil von `adoption.legacyMigrations` angewendet.

## Siehe auch

- [Plugins auf SDK 2.0 umstellen](plugins/migrating-to-2.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
- [Plugins installieren](plugins/installing-plugins.md)
