# Plugin-Datenbankmigrationen

Ein Plugin mit eigenen dauerhaften Tabellen liefert **TypeORM-Migrationen**, die der Host ausführt. Der Host verwaltet den vollständigen Lebenszyklus:

- **Beim Laden (Boot):** ausstehende Up-Migrationen laufen vor jeglichem Plugin-Code.
- **Bei Deinstallation:** Down-Migrationen laufen rückwärts, sodass Tabellen und Daten sauber ohne verwaistes Schema entfernt werden.

Dies ersetzt den alten Workaround, rohes `CREATE TABLE IF NOT EXISTS` aus Dienst-`onModuleInit` auszuführen, ohne Versionierung und mit zurückbleibenden Tabellen nach Deinstallation.

> [!TIP]
> Migrationen sind optional. Ein Plugin ohne Speicherung — oder nur mit berechtigtem Lesen von Host-Tabellen — benötigt keinen Migrationseintrag.

## Funktionsweise

Migrationen jedes Plugins werden in einer **eigenen** Tabelle `plugin_migrations_<name>` verfolgt, getrennt von Host-`migrations` und anderen Plugins. Durch isolierte Verwaltung gilt:

- Plugin-Migrationsversionen kollidieren nie mit Host- oder anderen Plugin-Versionen.
- „Alles von diesem Plugin Erstellte zurücknehmen“ ist bei Deinstallation eindeutig — der Host nimmt jede Zeile der Nachverfolgungstabelle zurück und entfernt dann die Tabelle.

Der Host führt Migrationen auf kurzlebiger eigenständiger Verbindung zur **gleichen** Datenbank aus; das Plugin besitzt seinen Migrationssatz ohne Eingriff in die feste Host-Entity-/Migrationspipeline. Up-Migrationen sind über Neustarts und Neuinstallationen idempotent: bereits angewendete werden übersprungen.

> [!WARNING]
> Plugin-Up-Migrationen können bei frischer Datenbank **vor** Host-Migrationen laufen. Plugin-Migration darf daher **nicht** von Host-Tabellen abhängen (beispielsweise Fremdschlüssel hinzufügen) — sie können noch fehlen. Halten Sie Plugin-Schema eigenständig, passend zur Plugin-Sandboxgrenze.

## 1. Migrationseinstieg deklarieren

Ergänzen Sie `main.migrations` in `plugin.json` mit Verweis auf das gebündelte Modul, das Migrationsklassen exportiert:

```json
{
  "name": "plugin-widgets",
  "version": "1.0.0",
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "migrations": { "directory": "dist", "entryPoint": "migrations.js" }
  },
  "attraccessVersion": { "min": "1.0.0" }
}
```

`directory` + `entryPoint` werden relativ zur ZIP-Wurzel aufgelöst, genau wie `main.backend`. Der Eintrag wird unabhängig vom Backend-Modul geladen, damit der Host Migrationen auch bei fehlgeschlagenem Backend-Laden bei Deinstallation zurücknehmen kann.

## 2. Migrationen schreiben

Schreiben Sie sie genau wie Host-Migrationen. Präfixieren Sie Klassennamen mit Millisekundenzeitstempel für deterministische Reihenfolge und implementieren Sie `up` und `down`:

```ts
import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

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
> Importieren Sie `MigrationInterface`, `QueryRunner` und Schema-Builder-Helfer (`Table`, `TableColumn`, …) aus `@attraccess/plugins-backend-sdk`. Das SDK exportiert sie aus der einzelnen Host-TypeORM-Kopie; Ihre Migration verwendet dieselben Typen — fügen Sie nie eigene `typeorm`-Abhängigkeit hinzu.
>
> Präfixieren Sie jede Tabelle mit Plugin-Namen (beispielsweise `plugin_widgets_*`), um Kollisionen mit Host- und anderen Plugin-Tabellen in der gemeinsamen Datenbank zu vermeiden.

## 3. Migrationseinstieg bündeln

Der Migrationseinstieg ist ein normales CommonJS-Modul mit Migrationsklassen — als **benannte Exporte** (wie Host-`migrations/index.ts`) oder **default-exportiertes Array**:

```ts
// migrations.ts → bundled to dist/migrations.js
export * from './migrations/1700000000000-create-widgets';
```

Bauen Sie ihn neben Ihrem Backend (beispielsweise zweiter esbuild-Einstieg), damit `dist/migrations.js` im Paket liegt. Externalisieren Sie wie beim Backend `typeorm`, damit es zur Laufzeit auf Host-Kopie auflöst statt gebündelt zu werden.

## Lebenszyklusübersicht

| Ereignis                             | Host-Verhalten                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Plugin installiert → Neustart → Boot | Ausstehende Up-Migrationen vor Plugin-Code ausführen.                            |
| Weitere Boots                        | Bereits angewendete Migrationen überspringen (idempotent).                       |
| Plugin deinstalliert                 | Down-Migrationen rückwärts ausführen, dann `plugin_migrations_<name>` entfernen. |

Fehlgeschlagene Up-Migration markiert das Plugin als fehlgeschlagen, blockiert aber nie Host-Boot oder andere Plugins. Fehlgeschlagene Down-Migration bei Deinstallation wird protokolliert; Plugin-Dateien werden trotzdem entfernt (Tabellen können dann verwaisen).

## Siehe auch

- [Plugins entwickeln](plugins/developing-plugins.md)
- [Plugins installieren](plugins/installing-plugins.md)
