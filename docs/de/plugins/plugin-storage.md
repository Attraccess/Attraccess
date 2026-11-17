# Plugin-Datenbankmigrationen

<!-- llms-description: Wie ein Plugin SQL-Migrationen für eigene Tabellen über den SDK-Unterpfad sqlite mitliefert: Migrations-Eintrag deklarieren, schreiben und bündeln, Rollback-Verhalten und die Engine-Prüfung. -->

Ein Plugin, das eigene persistente Tabellen braucht, liefert **Migrationen** mit (derzeit SQLite, geschrieben mit den
Helfern aus `@attraccess/plugins-backend-sdk/sqlite`) und lässt der Host sie ausführen. Der Host verwaltet den
gesamten Lebenszyklus:

- **Beim Laden (Boot):** Ausstehende Up-Migrationen laufen, bevor Plugin-Code startet.
- **Bei der Deinstallation:** Die Down-Migrationen des Plugins laufen in umgekehrter Reihenfolge, sodass Tabellen und
  Daten sauber entfernt werden -- kein verwaistes Schema.

> [!TIP]
> Migrationen sind optional. Ein Plugin, das nichts speichert, braucht keinen Migrations-Eintrag.

## So funktioniert es

Die Migrationen jedes Plugins werden in einer **eigenen** Tabelle verfolgt, `plugin_migrations_<name>`, getrennt von
der `migrations`-Tabelle des Hosts und von der aller anderen Plugins. Dadurch:

- kollidieren Migrationsversionen eines Plugins nie mit denen des Hosts oder eines anderen Plugins;
- ist „alles zurücknehmen, was dieses Plugin angelegt hat“ bei der Deinstallation klar definiert: Der Host nimmt jede
  Zeile der Tracking-Tabelle des Plugins zurück und löscht danach die Tabelle.

Der Host führt Ihre Migrationen auf einer kurzlebigen, eigenständigen Verbindung zur **selben** Datenbank aus.
Up-Migrationen sind über Neustarts und Neuinstallationen hinweg idempotent: bereits angewendete Migrationen werden
übersprungen.

Migrationen sind engine-spezifisch. Das Plugin nennt die Engines, die seine Speicherung unterstützt, in
`persistence.backends` der `plugin.json` (zum Beispiel `["sqlite"]`). Der Host prüft diese Deklaration, bevor er das
Plugin installiert, startet oder migriert: Ein Plugin, dessen Engines die des Hosts nicht enthalten, wird
**vor jeder Änderung** verweigert. Es wird keine Tabelle angelegt und keine Verlaufszeile geschrieben.

> [!WARNING]
> Up-Migrationen von Plugins können auf einer frischen Datenbank **vor** den eigenen Migrationen des Hosts laufen.
> Eine Plugin-Migration darf daher **nicht** von Host-Tabellen abhängen (zum Beispiel einen Fremdschlüssel darauf
> anlegen) -- sie existieren eventuell noch nicht. Halten Sie das Plugin-Schema in sich geschlossen.

## 1. Migrations-Eintrag deklarieren

Fügen Sie `main.migrations` zur `plugin.json` hinzu und verweisen Sie auf das gebündelte Modul, das Ihre
Migrationsklassen exportiert:

```json
{
  "name": "plugin-widgets",
  "version": "1.0.0",
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "migrations": { "directory": "dist", "entryPoint": "migrations.js" }
  },
  "attraccessVersion": { "min": "2.0.0-0" },
  "persistence": { "backends": ["sqlite"] },
  "permissions": ["DATABASE_ACCESS"]
}
```

`directory` + `entryPoint` werden relativ zum ZIP-Stamm aufgelöst, genau wie `main.backend`. Der Eintrag wird
unabhängig vom Backend-Modul geladen, sodass der Host Ihre Migrationen bei der Deinstallation auch dann zurücknehmen
kann, wenn das Backend selbst nicht geladen werden konnte.

## 2. Migrationen schreiben

Schreiben Sie sie wie Host-Migrationen. Stellen Sie dem Klassennamen einen Millisekunden-Zeitstempel voran, damit die
Reihenfolge eindeutig ist, und implementieren Sie `up` und `down`:

```ts
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/sqlite';

export class CreateWidgets1700000000000 implements MigrationInterface {
  name = 'CreateWidgets1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "plugin_widgets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "label" varchar NOT NULL
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_widgets"`);
  }
}
```

> [!TIP]
> Importieren Sie `MigrationInterface`, `QueryRunner` und die Schema-Builder-Helfer (`Table`, `TableColumn`,
> `TableForeignKey`, `TableIndex`) aus `@attraccess/plugins-backend-sdk/sqlite`. Der SDK-Root hat keine
> TypeORM-Oberfläche; dieser Unterpfad re-exportiert die einzelne TypeORM-Kopie des Hosts, damit Ihre Migration mit
> denselben Typen läuft wie der Host -- fügen Sie nie eine eigene `typeorm`-Abhängigkeit hinzu.
>
> Versehen Sie jede Tabelle mit Ihrem Plugin-Namen als Präfix (z. B. `plugin_widgets_*`), um Kollisionen mit Tabellen
> des Hosts oder anderer Plugins in der gemeinsamen Datenbank zu vermeiden.

## 3. Migrations-Eintrag bündeln

Der Migrations-Eintrag ist ein normales CommonJS-Modul, das die Migrationsklassen exportiert -- als **benannte
Exporte** (wie die `migrations/index.ts` des Hosts) oder als **per `default` exportiertes Array**:

```ts
// migrations.ts → gebündelt zu dist/migrations.js
export * from './migrations/1700000000000-create-widgets';
```

Bauen Sie ihn neben Ihrem Backend (z. B. ein zweiter esbuild-Eintrag), damit `dist/migrations.js` im Paket liegt. Wie
beim Backend-Eintrag externalisieren Sie `@attraccess/plugins-backend-sdk` und
`@attraccess/plugins-backend-sdk/sqlite`, damit sie zur Laufzeit auf die Kopien des Hosts zeigen und nicht gebündelt
werden.

## Lebenszyklus im Überblick

| Ereignis                                               | Was der Host tut                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin installiert oder aktualisiert → Neustart → Boot | Prüft das Manifest (SDK 2.0, deklarierte Engines), führt dann ausstehende Up-Migrationen aus, bevor Plugin-Code startet, in **einer Alles-oder-nichts-Transaktion**. |
| Folgende Starts                                        | Überspringt bereits angewendete Migrationen (idempotent).                                                                                                            |
| Ersetzen (Update oder Downgrade)                       | Blockiert, wenn das neue Paket nicht jede bereits angewendete Migration enthält, weil Down-Migrationen Daten verwerfen würden. Es ändert sich nichts.                |
| Plugin deinstalliert                                   | Führt alle Down-Migrationen in umgekehrter Reihenfolge in **einer Transaktion** aus und löscht dann `plugin_migrations_<name>`.                                      |

Rollback-Verhalten:

- Scheitert eine Up-Migration, wird der gesamte Stapel zurückgerollt: Keine ihrer Tabellen und keine Verlaufszeilen
  bleiben zurück, und eine korrigierte Version installiert sich aus sauberem Zustand. Das Plugin wird als fehlgeschlagen
  markiert, blockiert aber nie den Host-Start oder andere Plugins.
- Scheitert eine Down-Migration bei der Deinstallation, wird das Zurücknehmen als Ganzes zurückgerollt: Daten und
  Verlauf bleiben intakt, der Fehler wird protokolliert. Die Plugin-Dateien werden trotzdem entfernt (seine Tabellen
  können dann verwaist sein).
- Der Verlauf jedes Plugins liegt in einer eigenen Tabelle, `plugin_migrations_<name>`, getrennt von der
  `migrations`-Tabelle des Hosts und von anderen Plugins.

## Siehe auch

- [Plugins entwickeln](plugins/developing-plugins.md)
- [Plugins installieren](plugins/installing-plugins.md)
