# Plugin-Datenbankmigrationen

Ein Plugin mit eigenen persistenten Tabellen liefert versionierte Migrationen. Der Host führt ausstehende Migrationen vor der Aktivierung aus und verwaltet für jedes Plugin eine getrennte Tabelle `plugin_migrations_<name>`. Zeichen außerhalb von Buchstaben, Zahlen und Unterstrichen im Plugin-Namen werden im Tabellennamen durch Unterstriche ersetzt. Beim Neustart werden bereits ausgeführte Migrationen übersprungen. Beim Deinstallieren werden Migrationen rückwärts zurückgenommen und anschließend ihre Historientabelle entfernt.

SQLite ist das einzige implementierte Backend. Neue Plugin-Anwendungslogik importiert `@attraccess/plugins-backend-sdk/v2`. SQLite-Schema, Migrationen und Datenbankimplementierungen importieren `@attraccess/plugins-backend-sdk/adapter`. Beide Unterpfade, das SDK und TypeORM beim Build externalisieren, damit sie aus derselben Host-Laufzeit stammen.

## Deklaration und Migrationsdatei

In `plugin.json` dieselbe Persistenzdeklaration wie im Backend-Export verwenden:

```json
{
  "name": "plugin-widgets",
  "version": "1.0.0",
  "persistence": { "contractVersion": 2, "supportedBackends": ["sqlite"] },
  "main": {
    "backend": { "directory": "dist", "entryPoint": "index.js" },
    "migrations": { "directory": "dist", "entryPoint": "migrations.js" }
  },
  "attraccessVersion": { "min": "1.0.0" }
}
```

Bei npm-Paketen steht die Deklaration unter `attraccess.persistence`, die gebündelte Migrationsdatei unter `attraccess.migrations`. Nur tatsächlich implementierte Backends nennen. Der Host prüft die Unterstützung vor dem Laden des Schemas, Lesen der Migrationshistorie, Migrieren und Aktivieren. Eine Deklaration allein macht SQLite-SQL nicht portabel.

Die getrennte Migrationsdatei exportiert benannte Klassen oder ein standardmäßig exportiertes Array von Klassen. Klassennamen enden mit einem 13-stelligen Millisekundenzeitstempel. Namen und veröffentlichte Reihenfolge dauerhaft erhalten. Keine eigene TypeORM-Kopie bündeln.

```ts
import type { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk/adapter';
export class CreateWidgets1700000000000 implements MigrationInterface {
  name = 'CreateWidgets1700000000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('CREATE TABLE plugin_widgets (id integer PRIMARY KEY AUTOINCREMENT, label varchar NOT NULL)');
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE plugin_widgets');
  }
}
```

Migrationen laufen über eine kurzlebige Verbindung zur selben SQLite-Datei. Plugin-Migrationen können bei einer Neuinstallation vor Kernmigrationen laufen. Deshalb darf die Plugin-Migration nicht voraussetzen, dass Host-Tabellen schon existieren. Eigene Tabellen mit dem Plugin-Namen präfixieren und keine eigenen `CREATE TABLE`-Aufrufe aus Anwendungsdiensten starten.

## Fachliche Operationen von SQLite trennen

Die Anwendung definiert Datensätze und eine schmale Operationsschnittstelle:

```ts
// persistence/port.ts
import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
export interface WidgetOperations {
  labels(): Promise<string[]>;
}
export const WIDGETS = pluginOperationToken<WidgetOperations>('widget labels', ['labels']);
```

Nur die Implementierung verwendet Schemaklassen und Repositories:

```ts
// persistence/typeorm-adapter.ts
import { Entity, Column, PrimaryGeneratedColumn } from '@attraccess/plugins-backend-sdk/adapter';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import type { WidgetOperations } from './port';
@Entity({ name: 'plugin_widgets' })
export class Widget {
  @PrimaryGeneratedColumn({ type: 'integer' }) id!: number;
  @Column({ type: 'varchar' }) label!: string;
}
export class SqliteWidgets implements WidgetOperations {
  constructor(private readonly rows: Repository<Widget>) {}
  async labels(): Promise<string[]> {
    return (await this.rows.find({ order: { id: 'ASC' } })).map(({ label }) => label);
  }
}
```

Der Backend-Einstieg verdrahtet diese Teile:

```ts
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk/v2';
import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import { WIDGETS } from './persistence/port';
import { Widget, SqliteWidgets } from './persistence/typeorm-adapter';
class WidgetModule {}
export default {
  persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
  persistenceAdapters: [
    {
      backend: 'sqlite',
      entities: [Widget],
      operations: [{ token: WIDGETS, create: ({ manager }) => new SqliteWidgets(manager.getRepository(Widget)) }],
    },
  ],
  register: () => ({ module: WidgetModule }),
} satisfies PluginBackendModule & PluginBackendAdapters;
```

Ein Anwendungsdienst verwendet `context.persistence.resolve(WIDGETS).labels()`. Dafür bleibt `DATABASE_ACCESS` erforderlich. Nur deklarierte Methoden werden freigegeben, keine internen Repository-Felder. Adapter enthalten Abfragen, Reihenfolgen, bedingte Schreibvorgänge und Datenbankfehler. Geschäftsregeln, externe Aufrufe und die Auswahl öffentlicher Antwortfelder bleiben außerhalb. Für Zeilen normale Datensätze zurückgeben.

Alternativ können SQLite-Registrierungen ihre Klassen unter `persistenceAdapters[].migrations` angeben. Wenn zugleich `main.migrations` existiert, bleibt der veröffentlichte Dateieinstieg maßgeblich. Bei einem Anwendungsumbau weder die Migrationsquelle umstellen noch veröffentlichte Klassen, Tabellen, Entitätsnamen oder `plugin_migrations_*`-Historien umbenennen. Schemaänderungen benötigen eine separat geprüfte Migration.

## Fehler und bestehende Plugins

Eine fehlgeschlagene Aufwärtsmigration kennzeichnet das betreffende Plugin als fehlerhaft. Andere Plugins und der Host können weiter starten. Eine fehlgeschlagene Rücknahme beim Deinstallieren wird protokolliert; Dateien können trotzdem entfernt sein und Tabellen zurückbleiben. Rücknahmen dürfen Schlüssel und Wiederherstellungszustände nicht stillschweigend löschen. Installation, Upgrade, Neustart, Fehlerbehandlung und Deinstallation mit einer echten privaten SQLite-Datei prüfen. Vor einer produktiven Änderung ein wiederherstellbares Backup behalten.

Plugins ohne Persistenzdeklaration behalten den bisherigen SDK-Haupteinstieg und den rohen SQLite-Kontext. Sie sind ausdrücklich SQLite-only und müssen auf einem nicht unterstützten Backend klar fehlschlagen. Eine automatische Umwandlung, weitere Datenbanksysteme oder ein Entfernungstermin werden nicht zugesagt.

Siehe [Plugins entwickeln](plugins/developing-plugins.md), [Datenbank-Backend ergänzen](developer/adding-a-database-backend.md) und [Backup und Wiederherstellung](installation/backup-restore.md).
