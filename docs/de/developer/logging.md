# Ziele für API-Logs

Services und Plugins verwenden weiterhin `Logger` aus `@nestjs/common`. `RoutedLogger` erweitert Nests `ConsoleLogger`, um Argumentauswertung und effektiven Ebenenfilter der installierten Version 11.1.28 wiederzuverwenden. Nachrichtenobjekte, Kontext, Ebene, ISO-Zeitstempel und übergebene Stacks gelangen unverändert an Winstons Logger im Object-Modus. Eine eigene API für Log-Aufrufe ist nicht nötig. Siehe [Betriebskonfiguration](installation/environment-variables.md#api-anwendungslogs).

`nest-winston` wurde geprüft: Feste Argumentpositionen verlieren variadische Parameter, und die Objektauswertung extrahiert `message`/`level`, statt beliebige Nest-Nachrichtenobjekte zu bewahren. Der kleine lokale Adapter verwendet deshalb Nest direkt. Winston übernimmt Transportverteilung und Pufferung. Der Konsolentreiber nutzt Winston Console mit Nest-Formatierung. Der Dateitreiber nutzt Winston Stream mit einem UTF-8-Dateistream im Append-Modus, leitet Streamfehler weiter und wartet beim Herunterfahren auf Schreibvorgänge. Winston File unterdrückt im Dateinamenmodus derzeit Fehler des zugrunde liegenden Schreibstreams und reicht dafür allein nicht aus.

## Einen Treiber registrieren

Implementieren Sie `LogDestinationDriver` aus `apps/api/src/logging/log-destinations.ts` in dieser oder einer eigenen Treiberdatei und ergänzen Sie einen Namen in `defaultLogDrivers`. `configure(env, cwd)` validiert die Optionen des ausgewählten Treibers und gibt eine Factory für einen normalen `winston-transport` zurück. Nicht ausgewählte Treiber werden nicht konfiguriert. Konfigurationsfehler müssen vor dem Öffnen von Ressourcen mit einer verständlichen Meldung ausgelöst werden; die Factory übernimmt IO und Formatierung.

```ts
import Transport from 'winston-transport';
import { LogDestinationDriver, RoutedLogEntry } from './log-destinations';

const exampleDriver: LogDestinationDriver = {
  configure(env) {
    const endpoint = env.LOG_EXAMPLE_ENDPOINT?.trim();
    if (!endpoint) throw new Error('LOG_EXAMPLE_ENDPOINT is required for example.');
    return () => new Transport({
      log(info: RoutedLogEntry, callback) {
        // info an endpoint liefern; nach Zustellung/Pufferung bestätigen.
        // Bei Fehlern ein "error"-Ereignis am Transport auslösen.
        callback();
      },
      close() { /* Ressourcen des Ziels freigeben */ },
    });
  },
};

// Im Register: example: exampleDriver
// Umgebung: LOG_DESTINATIONS=console,example
```

Einträge enthalten `message`, die Nest-Ebene `level` (`log`, `warn`, `error`, `debug`, `verbose`, `fatal`), `context`, `timestamp` (ISO), `displayTimestamp` (Nest-Konsolenzeitstempel), optional `stack` und `printStack`. Variadische Nachrichten erzeugen einzelne Einträge wie einzelne Nest-Ausgabezeilen. `printStack` markiert den letzten Eintrag, damit ein lesbarer Treiber den übergebenen Stack einmal ausgibt. Ein Error als Nachricht bleibt einschließlich seiner Details erhalten. Felder `message` oder `level` innerhalb eines Nachrichtenobjekts dürfen nicht als Routing-Metadaten interpretiert werden. Jeder Treiber besitzt seine Formatierung. Der Router filtert mit Nest vor Winston und lässt alle verbleibenden Nest-Ebenen durch; keine zusätzliche Winston-Schwelle einführen.

Der Writable-Hook `_final(callback)` schließt ausstehende Schreibvorgänge ab; `close()` gibt Ressourcen frei. Betriebsfehler werden als `error`-Ereignis gemeldet. Der Router deaktiviert fehlerhafte Transports, meldet jedes ausgefallene Ziel einmal direkt auf stderr und fängt synchrone Transport-, Formatierungs- und Lifecycle-Ausnahmen ab. Treiber ersetzen nicht den globalen Nest-Logger. Service- und Plugin-Hooks dürfen gemeinsame Transports nicht schließen.

## Start und Lebenszyklus

Vor der ersten Bootstrap-Meldung wird Nests Logpuffer aktiviert. Nachdem der minimale Konfigurationskontext `.env` geladen hat, wird das Prozessrouting einmal initialisiert und der Puffer einmal geleert. Alle weiteren Kontexte teilen diesen Logger. Plugin-Konfiguration und Migrationen erfolgen weiterhin vor dem AppModule-Import. Nur die endgültige Anwendung enthält `withLoggingLifecycle`; dessen Shutdown-Hook wartet auf die Transports. Temporäre Kontexte besitzen die gemeinsamen Ziele nicht. Bei Startfehlern leert der Main-Handler den Puffer auf die Konsole, falls Routing noch nicht verfügbar ist, oder schließt den konfigurierten Logger vor dem Beenden ab.

`routed-logger.spec.ts` prüft die Registrierung eines dritten Treibers ohne Änderungen an Aufrufen oder Router sowie Argumentauswertung, Filter, fail2ban-Format, Dateipfade, Anhängen, Fehlerisolierung und Flush-Verhalten mit der installierten Nest-Version. `process-logging.spec.ts` prüft den Shutdown mit echten Nest-Kontexten.
