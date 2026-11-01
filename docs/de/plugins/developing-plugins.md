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

## Abhängigkeiten von anderen Attraccess-Plugins

Deklariere Plugin-Abhängigkeiten in `package.json` unter `attraccess.dependencies`:

```json
{
  "attraccess": {
    "dependencies": [
      { "name": "@example/3d-printer-core", "version": "^1.0.0", "required": true }
    ]
  }
}
```

`name` ist die unveränderliche npm-Paketidentität, `version` ein Semver-Bereich (kein Dist-Tag und keine URL). `required` ist standardmäßig `true`. Doppelte Identitäten werden abgelehnt. Diese Einträge beschreiben installierte Attraccess-Plugins mit eigenen Modulen, Berechtigungen, Migrationen und Zustand. Normale JavaScript-Abhängigkeiten gehören weiterhin in das oberste npm-Feld `dependencies`.

Der Marktplatz löst alle erforderlichen direkten und indirekten Abhängigkeiten vor der Installation auf und zeigt Versionen, Quellen, Klassifizierung und Berechtigungen zur Bestätigung. Kompatible installierte Plugins werden weiterverwendet; fehlende Plugins werden gemeinsam installiert. Konflikte und Zyklen blockieren den Vorgang. Abhängigkeiten werden aus der ausgewählten Registry aufgelöst; veröffentliche sie daher dort ebenfalls. Bereits installierte kompatible Plugins können aus einer anderen Registry stammen.

Optionale Abhängigkeiten (`required: false`) werden nicht automatisch installiert und blockieren die Aktivierung nicht. Wenn sie installiert sind, muss ihre Version kompatibel sein. Erforderliche Plugins werden vor ihren abhängigen Plugins geladen und migriert. Fehlende, inkompatible, deaktivierte oder fehlgeschlagene Abhängigkeiten halten abhängige Plugins inaktiv. Die Plugin-Einstellungen zeigen die Ursache. Repariere die Abhängigkeit und starte neu.

Updates und Downgrades müssen auch die Anforderungen installierter abhängiger Plugins erfüllen. Beim Entfernen einer erforderlichen Abhängigkeit müssen alle direkt und indirekt abhängigen Plugins ausdrücklich zur gemeinsamen Entfernung bestätigt werden. Automatisch installierte Abhängigkeiten bleiben normale Plugins; sie werden nicht automatisch entfernt, wenn ihr letztes abhängiges Plugin entfernt wird. Paketänderungen werden gemeinsam übernommen; Migrationen und Aktivierung erfolgen beim Neustart gemäß dem bestehenden Lebenszyklus. Beim Entfernen von npm-Plugins bleiben Daten und Geheimnisse erhalten.

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
| `READER_UI` | `context.readerUi.invalidate(...)` und der `readerUi`-Provider -- Widgets auf Attractap-Reader-Bildschirmen anzeigen. Siehe [Reader-UI](#reader-ui-und-start-hooks). |
| `ACCESS_HOOKS` | `preStartHook` und `sessionEndHook` -- eine Bestätigung verlangen oder einen Sitzungsstart blockieren. Siehe [Reader-UI](#reader-ui-und-start-hooks). |

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

## Reader-UI und Start-Hooks

Plugins können kleine Widgets auf Attractap-Readern anzeigen und vor dem Start einer Sitzung eine Bestätigung
einfügen. Ein Plugin beschreibt nur **Daten** (einen Knotenbaum nach „Reader UI Schema v1“). Auf dem Reader läuft
kein Plugin-Code; der Host prüft, bereinigt und rendert alles. Admins stellen das unter **Reader-Anzeige** ein,
siehe [Reader-Anzeige](attractap/reader-ui.md).

| Was                            | Deklaration                                               | Berechtigung   |
| ------------------------------ | --------------------------------------------------------- | -------------- |
| Slot-Widgets                   | `readerUi` (Provider oder `(context) => provider`)        | `READER_UI`    |
| Pre-Start-Hook                 | `preStartHook`                                            | `ACCESS_HOOKS` |
| Beratende Frage nach dem Stopp | `sessionEndHook`                                          | `ACCESS_HOOKS` |
| Neu rendern                    | `context.readerUi.invalidate({ resourceId?, readerId? })` | `READER_UI`    |

Ein Plugin, das `readerUi` oder einen Hook ohne die passende Berechtigung deklariert, **wird nicht geladen** und
unter Quarantäne gestellt. Ein lauffähiges Beispiel liegt in `examples/plugin-reader-ui`.

### Slots

| Slot-ID                    | Ort                                                | Knotenbudget                                                                                                                                            |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceList.row.status`  | Statuszeile einer Ressourcenzeile                  | 1 `text` oder `badge`, höchstens 24 Zeichen. Nur sichtbar, wenn kein Kernstatus (in Benutzung, Wartung, nicht verfügbar, Einweisung erforderlich) gilt. |
| `resource.details.header`  | unter der Beschreibung in den Ressourcendetails    | 6 Knoten                                                                                                                                                |
| `resource.details.body`    | Hauptbereich der Ressourcendetails                 | 8 Knoten                                                                                                                                                |
| `resource.details.session` | solange der Block der aktiven Sitzung sichtbar ist | 6 Knoten                                                                                                                                                |

Komponenten: `col`, `row`, `text`, `badge`, `icon` (`ok`, `warning`, `bell`, `lock`, `clock`), `progress`,
`countdown`, `spacer`. Slot-Bäume dürfen kein `button` enthalten. Töne: `primary`, `success`, `warning`, `danger`;
`danger` darf nicht mit dem Symbol `lock` kombiniert werden.

```ts
const readerUi: ReaderUiProvider = {
  getSlotContributions(ctx) {
    return [
      {
        slotId: 'resource.details.header',
        key: 'free-until',
        tree: {
          t: 'row',
          c: [
            { t: 'icon', name: 'clock' },
            { t: 'text', text: 'Frei bis 14:00' },
          ],
        },
        expiresAt: new Date('2026-11-01T14:00:00Z'), // dann ruft der Host den Provider erneut auf
        fallback: { text: 'Frei bis 14:00' },
      },
    ];
  },
};
```

### Grenzen

| Grenze                       | Wert                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| UI-Nutzlast                  | 3072 Byte UTF-8 nach der Bereinigung; der Frame höchstens 4096 Byte       |
| Knoten / Tiefe               | 32 pro Baum / 5                                                           |
| Aktive Knoten pro Reader     | 64                                                                        |
| Text                         | 80 Zeichen (2 Zeilen, mit „...“ gekürzt)                                  |
| Button-/Auswahl-Beschriftung | 31 Byte                                                                   |
| Auswahlmöglichkeiten         | höchstens 4                                                               |
| IDs (`key`, Button, Auswahl) | `[a-z0-9_-]{1,24}`                                                        |
| Beiträge                     | höchstens 8 pro Ressource; Updates höchstens alle 2 s pro Reader und Slot |

Ungültige Beiträge lehnt der Host ab und protokolliert sie mit dem Plugin-Namen; sie erreichen den Reader nie. Der
Reader-Editor zeigt sie als **Übersprungen** mit „ungültiger Inhalt“. Texte, die einem Kernstatus entsprechen
(„Wartung“, „Zugriff gewährt“, ...), werden abgelehnt, damit Plugins keine Host-Meldungen nachahmen.

### Nur Latin-1

Die Reader-Schriften decken Latin-1 ab. Der Host transliteriert **vor** dem Zählen der Bytes (`ł` wird `l`,
typografische Anführungszeichen werden `'` und `"`, Striche U+2010-2015 werden `-`, `…` wird `...`, schmale
Leerzeichen werden ein Leerzeichen, alles andere wird `?`). Ausgaben von `Intl.DateTimeFormat` sind abgedeckt.
Prüfen Sie Ihre Texte vorab mit denselben Regeln, damit sie auch nach der Transliteration in die Grenzen passen.

### Datenschutz und Sprache

Öffentliche Slots (Reader ohne angemeldete Person) zeigen keine Namen anderer Personen. Personenbezogene Inhalte
gehören in benutzerbezogene Slots (`resource.details.session`) und Schritte; der Host entfernt sie, wenn die
Kartensitzung endet. Bevorzugen Sie „Reserviert“ statt Namen, sonst Vorname und Initial.

Jeder Kontext enthält `ctx.language` (`'en'` oder `'de'`). Für Slot-Provider ist das die Reader-Sprache oder,
solange eine Kartensitzung läuft, die Sprache der Kartenperson. In `PreStartContext` und `SessionEndContext` ist es
an Readern die Sprache der Kartenperson, im Web und über die API die Sprache der angemeldeten Person. Host-Texte wie
„Vorübergehend nicht startbar“ übersetzt der Host selbst.

### Pre-Start-Hook

```ts
const preStartHook: PreStartHook = async (ctx) => {
  if (ctx.confirmedStepKeys.includes('tidy-up')) return { decision: 'allow' };
  const de = ctx.language === 'de';
  return {
    decision: 'confirm',
    confirmation: {
      stepKey: 'tidy-up',
      title: de ? 'Vor dem Start' : 'Before you start',
      body: de ? 'Ist die Maschine sauber?' : 'Is the machine clean?',
    },
  };
};
```

Ein Vertrag für Reader, Web-UI, API-Clients und die Supervision-Freigabe. Ein Hook liefert `allow`, `confirm` oder
`block`; die Startschritte `choose` und `info` des Schemas sind für eine spätere Version reserviert.

- `allow` startet normal. `block` lehnt mit `{ code, title, body }` ab; der Text wird wörtlich angezeigt (auf Lite
  als rotes „blockiert“-Blinken).
- `confirm` fragt nach. Reader zeigen einen Bestätigungsschritt, die Web-UI einen Dialog, API-Clients erhalten
  `409 { code: 'CONFIRMATION_REQUIRED', stepId, confirmation }` und wiederholen mit `confirmedStepIds: [stepId]`.
  Ihr Hook wird erneut mit `confirmedStepKeys` aufgerufen (nur **Ihre** Schlüssel) und entscheidet neu.
  Schritt-IDs sind zufällig, einmalig und laufen ab (Standard 60 s, höchstens 120 s, einstellbar mit
  `expiresInSec`); Plugins sehen sie nie.
- Bei mehreren Plugins gewinnt jedes `block`; sonst werden die Bestätigungen nacheinander in Host-Reihenfolge
  gefragt. Jede Wiederholung sendet nur die neueste Schritt-ID; der Host merkt sich die früheren Bestätigungen
  desselben Startversuchs.
- Der Hook läuft nach der schreibgeschützten Start-Prüfung des Hosts; wer ohnehin abgelehnt würde, sieht keinen
  Schritt.
- Eine Übernahme ist ein Start für die neue Person (`action: 'takeover'`). **Stopp und Notaus laufen nie durch
  Hooks.**
- **Supervision-Freigabe:** Ein `confirm` blockiert dort standardmäßig mit Ihrem Grund, weil die beaufsichtigende
  Person nicht stellvertretend bestätigen kann.
- Ein Reader mit Bildschirm, der die Bestätigung nicht anzeigen kann, blockiert den Start
  (`CONFIRMATION_UNAVAILABLE`). Reader, die den Schritt gar nicht anzeigen können (Attractap Lite, ältere Firmware
  ohne Reader-UI, Reader nach wiederholten Abstürzen), folgen der Einstellung **Reader ohne Bildschirm** der
  Ressource: `block` (Standard), `card-confirm` (Lite: zweites Auflegen durch dieselbe Person) oder
  `allow-with-warning` (startet ohne Bestätigung). `PluginConfirmation.noScreenPolicy` setzt Ihren Standard;
  Admins können ihn pro Ressource überschreiben.

### Frage nach dem Stopp

`sessionEndHook` läuft nach dem Ende einer Sitzung und kann `{ decision: 'choose', choice }` mit bis zu 4
Auswahlmöglichkeiten liefern. Sie ist nur beratend: Die Sitzung ist bereits beendet. Die Frage erscheint nur, wenn
die Person, die beendet hat, noch die Kartensitzung am Reader hält (nicht nach Übernahme oder Web-/API-Stopp). Sie
bleibt `choice.expiresInSec` Sekunden sichtbar (Standard 15, höchstens 30). Bei Timeout, Abbruch,
Verbindungsverlust oder ohne Bildschirm gilt `defaultOnTimeout`, und `onAnswer` wird mit der Antwort oder dem
Standard aufgerufen.

Die Session-End-Hooks aller Plugins werden aufgerufen. Die erste gültige Frage wird angezeigt; die anderen Plugins
erhalten ihr `defaultOnTimeout`.

```ts
const sessionEndHook: SessionEndHook = async (ctx) => ({
  decision: 'choose',
  choice: {
    stepKey: 'cleaned',
    title: ctx.language === 'de' ? 'Aufgeräumt?' : 'Tidied up?',
    body: ctx.language === 'de' ? 'Ist der Arbeitsplatz sauber?' : 'Is the workspace clean?',
    choices: [
      { id: 'yes', label: ctx.language === 'de' ? 'Ja' : 'Yes' },
      { id: 'no', label: ctx.language === 'de' ? 'Nein' : 'No' },
    ],
    defaultOnTimeout: 'no',
    expiresInSec: 20,
    onAnswer: (choiceId) => recordCleanup(ctx.sessionId, choiceId),
  },
});
```

### Ausfälle und Vertrauen

- Hooks laufen nach 1,5 s in ein Timeout (höchstens 3 s). Ein Timeout, eine Exception und ein ungültiges Ergebnis
  (zum Beispiel ein `block` ohne `reason`) zählen jeweils als Hook-Fehler. Standard ist **fail closed**: Der Start
  wird mit „Vorübergehend nicht startbar“ blockiert.
- Nach 5 aufeinanderfolgenden Fehlern öffnet ein Circuit Breaker für das Plugin: Die Ausfallrichtlinie gilt, ohne
  den Hook aufzurufen; nach 60 s geht der nächste Aufruf als Probe durch und schließt den Breaker, wenn er gelingt;
  außerdem entsteht ein Admin-Alarm. Session-End-Hooks haben einen eigenen Breaker. Admins können den Alarm
  vorzeitig quittieren oder pro Plugin und Ressource „Start erlauben“ (fail open) wählen (wird protokolliert).
- Lädt ein Plugin mit `ACCESS_HOOKS` nicht, werden seine Hooks nicht angewendet, und ein Admin-Alarm entsteht.
- Meldet ein Reader einen Panic-Reset, erhält er keine Plugin-Beiträge, bis ein Admin den Alarm quittiert oder 30
  Minuten ohne weiteren Panic-Reset vergehen. Bestätigungen an diesem Reader folgen solange der Einstellung für
  Reader ohne Bildschirm.
- **Plugins laufen im selben Prozess ohne Sandbox.** Eine synchrone Endlosschleife in einem Hook lässt sich nicht
  per Timeout stoppen. Die Prüfung schützt Reader und Nutzende vor Fehlern; sie ist keine Sandbox.

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

Für die lokale Entwicklung steht bei Shelly, RabbitMQ und WAGO zusätzlich
`install-dev` zur Verfügung:

```bash
pnpm nx install-dev plugin-shelly
```

`install-dev` baut das Plugin und kopiert den Inhalt von `package/` nach
`storage/plugins/<Manifest-Name>/`. Die bisherige lokale Installation wird
ersetzt und veraltete Dateien werden entfernt; andere Plugins bleiben erhalten.
`PLUGIN_DIR` hat Vorrang vor `STORAGE_ROOT`, jeweils aus der Umgebung oder der
Workspace-`.env`. Relative Pfade beziehen sich auf das Workspace-Verzeichnis.
Eine bereits laufende API muss nach `install-dev` neu gestartet werden.
Nach Änderungen am Plugin erneut `install-dev` ausführen; das Target überwacht
die Plugin-Quellen nicht.

## Siehe auch

- [Plugins Überblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins installieren](plugins/installing-plugins.md) -- Plugins hochladen und verwalten
- [Entwicklerhandbuch](developer/overview.md) -- Attraccess-Architektur und -Entwicklung
- [API-Referenz](developer/api-reference.md) -- Attraccess-REST-API
## Übersetzungen und Sprachwechsel

Verwende `useTranslations` aus `@attraccess/plugins-frontend-ui` mit eigenen
englischen und deutschen Übersetzungskatalogen. Der Hook übernimmt die Sprache
des Hosts und aktualisiert Plugin-Seiten, Dialoge und Slot-Beiträge automatisch
beim Sprachwechsel. Plugins benötigen weder eigene Spracherkennung noch eine
eigene gespeicherte Sprachpräferenz.

```tsx
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function DevicesPage() {
  const { t } = useTranslations({ en, de });
  return <h1>{t('title')}</h1>;
}
```

Übersetze auch Beschreibungen, Platzhalter und Barrierefreiheitsbeschriftungen.
Verwende `{{name}}` für dynamische Werte und den zurückgegebenen `language`-Wert
für Datums- und Zahlenformatierung. Fehlende deutsche Einträge fallen auf Englisch
zurück. Benutzereingaben und Protokollkennungen bleiben unverändert. Speichere
für Meldungen im React-Zustand Übersetzungsschlüssel und Parameter statt bereits
übersetzter Texte, damit sie beim Sprachwechsel ebenfalls aktualisiert werden.

Teile **`@attraccess/plugins-frontend-ui` über Module Federation** mit
`requiredVersion: '*'`, `import: false` und `generate: false`. Eine eigene Kopie
würde einen separaten Sprachzustand erzeugen. Die gemeinsame Konfiguration
`createPluginFederationConfig` enthält diesen Eintrag bereits. Deklariere die
Bibliothek als Peer-Abhängigkeit und setze `attraccess.host` beziehungsweise
`attraccessVersion.min` auf mindestens Version **1.11.0**, da ältere Hosts diese
Bibliothek noch nicht teilen.

## Gemeinsame UI-Komponenten

`@attraccess/plugins-frontend-ui` enthält auch die UI-Bausteine des Hosts, damit
Plugins wie der Kern aussehen und sich verhalten, statt eigene Kopien mitzubringen:

| Komponente                                              | Verwendung                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `StatusDialog`                                          | Hinweise und Bestätigungen (`info`, `success`, `warning`, `error`) |
| `DeleteConfirmationModal`                               | Löschen eines benannten Eintrags bestätigen                        |
| `StandardModal`, `StandardDrawer`                       | Umfangreichere Modals und Drawer (Formulare, Listen)               |
| `Button`                                                | Buttons mit Ladeanzeige                                            |
| `AlertStatusIcon`, `StatusAlert`                        | Hinweise mit Statussymbol                                          |
| `LabeledSwitch`, `PasswordInput`                        | Schalter mit Beschriftung, Passwortfeld mit Anzeigen/Verbergen     |
| `EmptyState`, `TableDataLoadingIndicator`, `PageHeader` | Leere Listen, zentrierte Ladeanzeige, Seitenkopf mit Aktionen      |
| `DateTimeDisplay`, `useDateTimeFormatter`               | Datum und Uhrzeit nach den Einstellungen des Benutzers             |

Verwende `StatusDialog` für kurze Hinweise und Bestätigungen. Nur `error` zeigt
eine rote (Danger-)Aktionsschaltfläche, alle anderen Status eine primäre. Escape
ruft `onClose` auf, ein Klick auf den Hintergrund bewirkt nichts. Nimm
`StandardModal` nur, wenn der Dialog umfangreichere Inhalte braucht.

Die Exporte `StandardModal` und `StandardDrawer` aus
`@attraccess/plugins-frontend-sdk` sind **veraltet** (Re-Exports der obigen
Komponenten); importiere sie aus `@attraccess/plugins-frontend-ui`.

Diese Komponenten setzen einen Host und ein `@attraccess/plugins-frontend-ui`
voraus, die sie bereits enthalten (**ab 1.11.0**, also dem Release, das sie
einführt). Ein Plugin, das sie nutzt, schlägt auf älteren Hosts zur Laufzeit
fehl; hebe daher `attraccess.host`, `attraccessVersion.min` und die
Peer-Abhängigkeit entsprechend an.

## Live-Updates

Mit `context.liveUpdates.register` im Backend-SDK und `usePluginLiveUpdates<T>`
im Frontend-SDK nutzen Plugins dieselbe authentifizierte Live-Verbindung wie der
Host. Themen werden pro Plugin registriert; Kennungen und Berechtigungen müssen
im Backend bei jeder Anmeldung und Erneuerung geprüft werden. Für UI-Updates ist
keine eigene SSE- oder WebSocket-Verbindung nötig.
Der optionale Callback `onUnavailable` meldet eine Themenablehnung oder eine
Transportunterbrechung. Vorhandene Werte bleiben bis zum nächsten Snapshot als
nicht verfügbar im Cache; wiederkehrendes REST-Polling ist nicht erforderlich.
Der Callback wird wie `onUpdate` und `onReconnect` bei Bereinigung und Wechsel
des Authentifizierungskontexts geschützt.
Der Host gibt Ausnahmen aus Autorisierung und Quellen nicht an den Browser weiter.
Bei `createSharedLiveSampler` bleibt die Sperre pro Kennung bis zum Abschluss
einer laufenden Abfrage bestehen, auch nach dem letzten Abmelden; neue Verbraucher
erhalten frische Werte. Der Host stellt die Verbindung bei gültigem
Sitzungswechsel desselben Benutzers ohne Löschen des Abfragecaches wieder her und
behält sie bei Abmelden/Anmelden im selben React-Batch. Plugin-Ereignisse werden
lokal nicht erneut zugestellt.
Der [Vertrag mit Beispielen](../../development/live-updates.md#plugin-live-updates)
beschreibt auch Wiederverbindung und Freigabe von Abonnements.
Die [WAGO-Abfrageintervalle](../../development/live-updates.md#wago-sampling-schedule)
listen die gemeinsamen Backend-Intervalle für alle neun WAGO-Themen auf.
