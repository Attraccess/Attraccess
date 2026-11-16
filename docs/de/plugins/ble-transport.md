# Bluetooth-Transport für Plugins

<!-- llms-description: Beschreibt den BLE-Transportvertrag, über den Backend-Plugins mit Bluetooth-Geräten über Attractap-Reader sprechen: Profile, Endpunkte, Sitzungen, Fehler, Grenzwerte und Tests mit dem Fake. -->

Backend-Plugins mit der Berechtigung `BLE_TRANSPORT` können über Attractap-Reader mit Bluetooth-Low-Energy-Geräten (BLE) sprechen. Der Transport ist bewusst **keine** rohe GATT-Schnittstelle: Jede Operation läuft über ein Profil, das Ihr Plugin registriert hat, und einen Endpunkt, den Ihr Plugin besitzt. Der Kern setzt die Grenzen durch; Ihr Plugin liefert die herstellerspezifische Semantik.

> [!NOTE]
> Diese Seite beschreibt den Vertrag und das, was mitgeliefert wird: die SDK-Typen, die Berechtigung, die Speicherung der Endpunkte, die Freigabe pro Reader und einen deterministischen Fake für Tests. Der eigentliche Reader-Transport (Websocket-Protokoll und Firmware, die den BLE-Verkehr tragen) folgt mit ATT-1033. Bis dahin enden `scan` und `openSession` mit `TRANSPORT_UNAVAILABLE`, während Profile und Endpunkte bereits funktionieren und sich alles gegen den Fake testen lässt.

## Vertrauensgrenze

| Ihr Plugin besitzt                                           | Der Kern besitzt                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Auswerten von Advertisements und Auswahl eines Geräts        | Welche Reader Plugins nutzen dürfen (Freigabe durch Administratoren pro Reader) |
| Zugangsdaten, Schlüssel und das Befehlsprotokoll             | Geräteidentität: Die Adresse, mit der ein Plugin sprechen darf, ist gebunden    |
| Was ein Lesen, Schreiben oder eine Benachrichtigung bedeutet | Das Profil: nur registrierte Services, Characteristics und Operationen          |
| Wann verbunden wird und wann aufgegeben wird                 | Größenlimits, Fristen, Sitzungs-Leases und Abbruch                              |
| Endpunkte löschen, die nicht mehr gebraucht werden           | Eigentum (Plugins sehen die Endpunkte anderer nie) und Aufräumen                |

Die Durchsetzung läuft immer im Host. Die Prüffunktionen sind aus dem SDK exportiert, damit sich der Fake identisch verhält; ein Plugin kann sie aber nicht umgehen.

Administratoren behalten die Kontrolle: Ein Reader ist für Plugins standardmäßig gesperrt. Ein Administrator aktiviert **Plugins die Bluetooth-Nutzung erlauben** im Reader-Editor (Tab Allgemein). Beim Ausschalten enden alle BLE-Sitzungen von Plugins auf diesem Reader sofort; vorhandene Endpunkte bleiben bestehen, aber Scans, neue Endpunkte und Sitzungen scheitern mit `READER_ACCESS_DENIED`.

> [!WARNING]
> `BLE_TRANSPORT` sperrt die Hintertüren anderer Berechtigungen nicht. `DATABASE_ACCESS` umgeht das Eigentum, weil es jede Tabelle lesen kann, und `RESOLVE_HOST_PROVIDERS` (`context.get`) erreicht interne Host-Dienste. Installieren Sie nur Plugins, denen Sie diese Berechtigungen anvertrauen, und lesen oder ändern Sie die Zeilen von `plugin_ble_endpoint` nie darüber: Nutzen Sie `context.ble`.

## Lebenszyklus

`context.ble` steht zur Verfügung, wenn das Plugin `BLE_TRANSPORT` deklariert; ohne die Berechtigung wirft der Getter einen `PluginPermissionError`. Die Eigenschaft ist im Typ optional, damit ein Plugin auch gegen Hosts kompiliert, die sie noch nicht kennen.

```ts
import { PluginPermission, type PluginBackendModule } from '@attraccess/plugins-backend-sdk';

const plugin: PluginBackendModule = {
  register(context) {
    context.ble?.registerProfile({/* ... */});
    return { module: MyModule };
  },
};
```

- **`registerProfile` ist synchron.** Es braucht keinen Host-Dienst und darf deshalb in `register(context)`, in einem Provider-Konstruktor oder im Modul-Scope aufgerufen werden, bei jeder Ladereihenfolge der Plugins.
- **Alle anderen Methoden sind asynchron und werfen nie synchron.** Vor Abschluss des Host-Starts enden sie mit `PluginBleError('NOT_READY')` (wiederholbar). Sie warten nie. Rufen Sie sie aus einem Lifecycle-Hook, einem Request- oder Event-Handler auf oder wiederholen Sie bei `NOT_READY`.
- **Der Host baut Ihr Plugin zweimal.** Beim Start lädt eine Wegwerf-Konfigurations-App Ihre Plugin-Module und wird wieder geschlossen; danach lädt die eigentliche Anwendung sie. Ihre Registrierungen laufen in beiden. Dieselbe Definition erneut zu registrieren ist idempotent, ohne dass Sie etwas tun müssen. Eine _andere_ Definition unter einer vorhandenen ID wirft `PROFILE_CONFLICT`, und Ihr Plugin lädt nicht.
- Profile liegen pro Plugin-ID im Speicher. Endpunkte speichert der Kern in seiner Datenbank; sie überleben Neustarts. Ein Endpunkt, dessen Profil Ihr Plugin (noch) nicht registriert hat, lässt sich auflisten, ändern und löschen; das Öffnen einer Sitzung scheitert aber mit `PROFILE_NOT_REGISTERED`.

## Profile

Ein Profil ist unveränderlich und listet genau auf, was Ihr Plugin mit einer Geräteart tun darf.

```ts
const profile = context.ble.registerProfile({
  id: 'door-lock', // /^[a-z0-9][a-z0-9-]{0,63}$/, pro Plugin eindeutig
  advertisement: { serviceUuids: ['fff0'], namePrefix: 'Lock' }, // optional; nötig zum Scannen
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 20 },
        { key: 'status', uuid: 'fff2', operations: ['read', 'notify'], maxReadBytes: 4, maxNotificationBytes: 20 },
        { key: 'firmware', uuid: 'fff3', operations: ['writeWithoutResponse'], maxWriteBytes: 244 },
      ],
    },
  ],
  limits: { maxSessionMs: 120_000, maxNotificationQueue: 64 },
});
```

- **UUIDs** dürfen 16-, 32- oder 128-Bit lang sein (`"180f"`). Sie werden zu kleingeschriebenen 128-Bit-UUIDs mit Bindestrichen normalisiert. Fehlerhafte oder doppelte UUIDs werden abgelehnt.
- **Schlüssel** (`/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/`) sind profillokale Namen. **Operationen benennen eine Characteristic immer über den Schlüssel, nie über die UUID.** Ein unbekannter Schlüssel endet mit `UNKNOWN_CHARACTERISTIC`.
- **Operationen** sind eine nicht leere Liste ohne Duplikate aus `read`, `write`, `writeWithoutResponse`, `notify`, `indicate`. Eine Operation, die der Schlüssel nicht erlaubt, endet mit `OPERATION_NOT_ALLOWED`.
- **Grenzen** (`maxReadBytes`, `maxWriteBytes`, `maxNotificationBytes`, 1..512) sind für jede erlaubte Operation Pflicht. Ein Schreiben über der Grenze endet mit `PAYLOAD_TOO_LARGE`, **bevor** etwas den Reader erreicht. Auch ein gelesener Wert oder eine Benachrichtigung über der Grenze endet mit `PAYLOAD_TOO_LARGE`.
- **`advertisement`** filtert Scans: Ein Scan liefert nur Advertisements, die jedes gesetzte Kriterium erfüllen (eine der genannten Service-UUIDs, eine der genannten Hersteller-IDs von 0 bis 0xffff und das Namenspräfix). Ein Filter muss mindestens eines der drei Kriterien setzen, sonst `INVALID_PROFILE`. Ein Profil ohne Advertisement-Filter kann nicht scannen (`OPERATION_NOT_ALLOWED`).
- **`limits`** legen die Obergrenze des Sitzungs-Leases fest (`maxSessionMs`, 1 ms bis 15 Minuten; das Standard-Lease beträgt 30 s oder `maxSessionMs`, falls das kleiner ist) und die Benachrichtigungswarteschlange bis auf 256 (`maxNotificationQueue`, Standard 32). Werte über den Host-Grenzen werden mit `INVALID_PROFILE` abgelehnt.

Das zurückgegebene Profil ist tief eingefroren. Ungültige Definitionen werfen `PluginBleError('INVALID_PROFILE')` mit einer Meldung, die das Feld nennt, zum Beispiel `services[0].characteristics[1].maxReadBytes: is required for the allowed operations`.

## Reader und Scannen

```ts
const readers = await context.ble.listReaders();
// [{ readerId: 3, name: 'Werkstatt-Tür', available: true }]

const advertisements = await context.ble.scan(readers[0].readerId, 'door-lock', {
  durationMs: 5000, // Standard 5 s, maximal 15 s
  signal,
});
// [{ address: 'AA:BB:CC:DD:EE:01', addressType: 'public', rssi: -48, name: 'Lock 12',
//    serviceUuids: ['0000fff0-...'], manufacturerData: [{ companyId: 0x1234, data: Uint8Array }] }]
```

`listReaders` liefert nur Reader, die ein Administrator für Plugins freigegeben hat. `available` ist false, wenn der Host keinen Transporttreiber hat oder der Reader gerade kein BLE kann.

## Endpunkte

Ein Endpunkt bindet eine Geräteadresse an einem Reader an eines Ihrer Profile. Der Kern speichert ihn, und genau ein Plugin besitzt ihn.

```ts
const endpoint = await context.ble.createEndpoint({
  readerId: 3,
  address: 'aa:bb:cc:dd:ee:01', // wird zu AA:BB:CC:DD:EE:01 normalisiert
  addressType: 'public',
  profileId: 'door-lock',
  label: 'Werkstatt-Tür', // optional, höchstens 100 Zeichen
});
// endpoint.id ist eine undurchsichtige UUID: Speichern Sie sie in Ihren eigenen Datensätzen.

await context.ble.listEndpoints(); // nur Ihre Endpunkte
await context.ble.getEndpoint(endpoint.id);
await context.ble.updateEndpoint(endpoint.id, { label: null, readerId: 4 }); // profileId ist unveränderlich
await context.ble.deleteEndpoint(endpoint.id);
```

- `profileId` muss von **Ihrem** Plugin registriert sein, sonst `PROFILE_NOT_REGISTERED`.
- Der Reader muss existieren und freigegeben sein: `READER_NOT_FOUND` oder `READER_ACCESS_DENIED`.
- Eine physische Adresse gehört höchstens einem Plugin; ein anderes Plugin, das sie bindet, erhält `ENDPOINT_CONFLICT`. Ein Plugin darf dieselbe Adresse an mehreren Readern binden, aber nur einmal pro Reader.
- Die Endpunkt-ID eines anderen Plugins verhält sich genau wie eine fehlende (`ENDPOINT_NOT_FOUND`), sodass die Existenz von Endpunkten nie durchsickert.
- Endpunkte werden entfernt, wenn ihr Reader gelöscht wird und wenn Ihr Plugin deinstalliert wird.

## Sitzungen

```ts
const result = await context.ble.withSession(
  endpoint.id,
  async (session) => {
    const events = await session.subscribe('status');
    await session.write('command', Uint8Array.of(0x01));
    const confirmation = await events.next({ timeoutMs: 3000 });
    await session.unsubscribe('status');
    return confirmation.value;
  },
  { leaseMs: 20_000 },
);
```

`openSession(endpointId, { signal, leaseMs, connectTimeoutMs })` liefert eine Sitzung; `withSession` öffnet eine, führt Ihre Funktion aus und **schließt die Sitzung immer**, auch wenn Ihre Funktion wirft oder das Signal abbricht. Bevorzugen Sie es.

| Mitglied                                      | Verhalten                                                                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `endpointId`                            | Identifizieren Sitzung und Endpunkt.                                                                                                                           |
| `read(key, { signal, timeoutMs })`            | Liest eine Characteristic; liefert eine Kopie der Bytes.                                                                                                       |
| `write(key, value, { withoutResponse, ... })` | Schreibt. `withoutResponse` braucht die Operation `writeWithoutResponse`, sonst ist `write` nötig. Für Massenübertragungen.                                    |
| `subscribe(key, { signal })`                  | Startet Benachrichtigungen (`notify` oder `indicate`). Liefert einen Stream mit `next({ timeoutMs, signal })`, einem asynchronen Iterator und `unsubscribe()`. |
| `unsubscribe(key)`                            | Beendet ein Abonnement. Ohne Abonnement passiert nichts.                                                                                                       |
| `close()`                                     | Idempotent. Trennt die Verbindung und beendet die Sitzung.                                                                                                     |
| `closed`                                      | Ein Promise, das mit `{ reason }` aufgelöst wird, sobald die Sitzung endete (es wird nie abgelehnt).                                                           |

Regeln:

- **Eine offene Sitzung pro Endpunkt.** Ein zweites `openSession` endet mit `ENDPOINT_BUSY` (wiederholbar). Der Vertrag kennt keine Warteschlange; die Serialisierung pro Reader ist Aufgabe des Transports.
- **Operationen laufen nacheinander in der Reihenfolge der Aufrufe.**
- **Benachrichtigungen** kommen pro Abonnement in Reihenfolge und nur bei der besitzenden Sitzung an, in einer begrenzten Warteschlange (Standard 32, Profilmaximum 256). Läuft die Warteschlange über, verwirft der Host die wartenden Benachrichtigungen und lässt den Stream sofort fehlschlagen, statt Daten stillschweigend zu verwerfen: jedes wartende und spätere `next()` endet mit `NOTIFICATION_OVERFLOW`, die Sitzung bleibt offen. Rufen Sie `session.unsubscribe(key)` auf und abonnieren Sie erneut, um fortzufahren. Wer einen bereits abonnierten Key erneut abonniert, erhält `INVALID_ARGUMENT`. Verarbeiten Sie Benachrichtigungen zügig. Der asynchrone Iterator endet, wenn der Stream beendet wird oder die Sitzung schließt.
- **Nach `close`** enden alle weiteren Operationen mit `SESSION_CLOSED`. Operationen, die beim Schließen noch liefen, enden einmalig: mit `DISCONNECTED`, wenn das Gerät die Verbindung trennte, mit `CANCELLED`, wenn das Open-Signal abbrach, sonst mit `SESSION_CLOSED`.
- **Gründe in `closed`:** `closed`, `lease-expired`, `cancelled`, `disconnected`, `reader-access-revoked`, `endpoint-deleted`, `shutdown`, `error`.
- **Abbruch.** Jede Methode akzeptiert ein `AbortSignal`. Ein Abbruch beendet den wartenden Aufruf mit `CANCELLED`. Bricht das Signal ab, das Sie an `openSession` übergeben haben, schließt die Sitzung. Eine Operation mit Zeitüberschreitung oder Abbruch schließt die Sitzung **nicht**, es sei denn, der Transport meldet die Verbindung als verloren.

## Fehler

Jeder Fehler ist ein `PluginBleError` mit stabilem `code`, einem `retryable`-Flag, optional `operation` und optional `detail`. `detail` ist eine unbedenkliche Diagnose und enthält nie Nutzdaten-Bytes. Berechtigungsfehler bleiben `PluginPermissionError`. Validierungsfehler (`INVALID_PROFILE`, `INVALID_ARGUMENT`) nennen das betroffene Feld in der Meldung.

| Code                     | Wiederholbar | Bedeutung                                                                       |
| ------------------------ | ------------ | ------------------------------------------------------------------------------- |
| `NOT_READY`              | ja           | Der Host hat den Start noch nicht abgeschlossen.                                |
| `TRANSPORT_UNAVAILABLE`  | ja           | Der Host hat keinen Reader-Transport (bis ATT-1033 erscheint).                  |
| `READER_NOT_FOUND`       | nein         | Der Reader existiert nicht.                                                     |
| `READER_ACCESS_DENIED`   | nein         | Ein Administrator hat den Reader nicht für Plugins freigegeben.                 |
| `READER_OFFLINE`         | ja           | Der Reader ist nicht verbunden oder kann gerade kein BLE.                       |
| `READER_UNSUPPORTED`     | nein         | Die Firmware des Readers unterstützt kein BLE.                                  |
| `READER_BUSY`            | ja           | Der Reader bedient eine andere BLE-Verbindung.                                  |
| `PROFILE_NOT_REGISTERED` | nein         | Ihr Plugin hat dieses Profil in diesem Prozess nicht registriert.               |
| `PROFILE_CONFLICT`       | nein         | Unter dieser ID ist bereits eine andere Definition registriert.                 |
| `INVALID_PROFILE`        | nein         | Die Profildefinition ist ungültig.                                              |
| `INVALID_ARGUMENT`       | nein         | Ein Argument ist ungültig (die Meldung nennt das Feld).                         |
| `ENDPOINT_NOT_FOUND`     | nein         | Der Endpunkt existiert nicht oder gehört einem anderen Plugin.                  |
| `ENDPOINT_CONFLICT`      | nein         | Die Adresse ist bereits gebunden (an ein anderes Plugin oder an diesem Reader). |
| `ENDPOINT_BUSY`          | ja           | Der Endpunkt hat bereits eine offene Sitzung.                                   |
| `UNKNOWN_CHARACTERISTIC` | nein         | Der Schlüssel ist nicht im Profil.                                              |
| `OPERATION_NOT_ALLOWED`  | nein         | Das Profil erlaubt diese Operation für den Schlüssel (oder das Scannen) nicht.  |
| `PAYLOAD_TOO_LARGE`      | nein         | Nutzdaten überschreiten ihre Profilgrenze.                                      |
| `TIMEOUT`                | ja           | Eine Frist ist abgelaufen.                                                      |
| `CANCELLED`              | nein         | Der Aufruf wurde über sein `AbortSignal` abgebrochen.                           |
| `SESSION_CLOSED`         | nein         | Die Sitzung ist geschlossen.                                                    |
| `DEVICE_NOT_FOUND`       | ja           | Das Gerät wurde in der Nähe des Readers nicht gefunden.                         |
| `CONNECTION_FAILED`      | ja           | Der Verbindungsaufbau ist fehlgeschlagen.                                       |
| `DISCONNECTED`           | ja           | Das Gerät hat die Verbindung getrennt.                                          |
| `GATT_ERROR`             | nein         | Das Gerät antwortete mit einem GATT-Fehler.                                     |
| `NOTIFICATION_OVERFLOW`  | nein         | Die Benachrichtigungswarteschlange ist übergelaufen.                            |
| `INTERNAL`               | nein         | Ein unerwarteter Host-Fehler. Die Meldung enthält nie Nutzdaten.                |

## Grenzwerte

| Grenze                                        | Standard | Maximum                                      |
| --------------------------------------------- | -------- | -------------------------------------------- |
| Operations-Timeout (`timeoutMs`)              | 10 s     | 60 s                                         |
| Verbindungs-Timeout (`connectTimeoutMs`)      | 15 s     | 60 s                                         |
| Sitzungs-Lease (`leaseMs`)                    | 30 s     | `maxSessionMs` des Profils, höchstens 15 min |
| Scandauer (`durationMs`)                      | 5 s      | 15 s                                         |
| Benachrichtigungswarteschlange pro Abonnement | 32       | 256 (`maxNotificationQueue` des Profils)     |
| Nutzdaten pro Characteristic                  | -        | 1..512 Bytes, im Profil festgelegt           |
| Endpunkt-Bezeichnung                          | -        | 100 Zeichen                                  |

Werte über einer Grenze werden mit `INVALID_ARGUMENT` abgelehnt (in einem Profil mit `INVALID_PROFILE`); sie werden nie stillschweigend gekürzt. Die Konstanten sind als `PLUGIN_BLE_LIMITS` exportiert.

## Pflichten beim Aufräumen

Ihr Plugin sollte:

- `withSession` nutzen oder jede geöffnete Sitzung in einem `finally`-Block schließen.
- Streams beenden, die es nicht mehr liest, und `closed` auswerten, um zu erfahren, warum eine Sitzung endete.
- Endpunkte löschen, die nicht mehr gebraucht werden (zum Beispiel wenn jemand das Schloss im Plugin entfernt).
- **Nie Nutzdaten-Bytes, Schlüssel oder Zugangsdaten protokollieren.** Protokollieren Sie Operationsnamen und Ergebnisse.
- Sitzungs-Leases kurz halten. Lange Leases sind für lange Übertragungen gedacht, etwa Firmware-Updates.

Der Host räumt für Sie auf:

| Ereignis                                                                                                                                                    | Was passiert                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Ihr Plugin-Modul wird zerstört                                                                                                                              | Seine Sitzungen schließen mit `shutdown`. Endpunkte bleiben.                      |
| Ein Administrator schaltet den Reader ab                                                                                                                    | Seine Sitzungen schließen mit `reader-access-revoked`. Endpunkte bleiben.         |
| Ein Reader wird gelöscht                                                                                                                                    | Sitzungen schließen mit `reader-access-revoked`; seine Endpunkte werden gelöscht. |
| Ein Endpunkt wird gelöscht oder sein Reader, seine Adresse oder sein Adresstyp ändert sich (eine reine Änderung der Bezeichnung lässt die Sitzung bestehen) | Seine Sitzung schließt mit `endpoint-deleted`.                                    |
| Ein Lease läuft ab                                                                                                                                          | Die Sitzung schließt mit `lease-expired`.                                         |
| Ihr Plugin wird deinstalliert                                                                                                                               | Seine Endpunkte werden gelöscht.                                                  |

Jedes Schließen bricht wartende Operationen und Abonnements ab, weist den Transport zum Trennen an und beendet jedes wartende Promise genau einmal.

## Testen mit dem Fake

`createFakeBleHost` ist ein deterministischer Fake des Hosts. Er braucht weder Nest noch Datenbank oder Netzwerk, nutzt dieselbe Validierung, dieselben Fehlercodes und dieselben Schließgründe wie der Host und bewegt die Zeit nur, wenn Sie `advance` aufrufen. Mehrere Plugins können sich einen Fake-Host teilen, sodass sich Verhalten zwischen Plugins testen lässt.

```ts
import { createFakeBleHost } from '@attraccess/plugins-backend-sdk';

it('entsperrt und wartet auf die Bestätigung', async () => {
  const host = createFakeBleHost();
  host.addReader({ readerId: 1, name: 'Tür-Reader', allowPluginBle: true });
  host.addPeripheral({
    readerId: 1,
    address: 'AA:BB:CC:00:00:01',
    addressType: 'public',
    advertisement: { name: 'Lock 1', serviceUuids: ['fff0'] },
    characteristics: {
      fff1: { onWrite: () => host.notify('AA:BB:CC:00:00:01', 'fff2', Uint8Array.of(2)) },
      fff2: { value: Uint8Array.of(1) },
    },
  });

  const ble = host.contextFor('my-plugin');
  ble.registerProfile({
    id: 'door-lock',
    advertisement: { serviceUuids: ['fff0'] },
    services: [
      {
        uuid: 'fff0',
        characteristics: [
          { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 20 },
          { key: 'status', uuid: 'fff2', operations: ['read', 'notify'], maxReadBytes: 4, maxNotificationBytes: 20 },
        ],
      },
    ],
  });
  const [found] = await ble.scan(1, 'door-lock');
  const endpoint = await ble.createEndpoint({
    readerId: 1,
    address: found.address,
    addressType: found.addressType,
    profileId: 'door-lock',
  });

  const confirmation = await ble.withSession(endpoint.id, async (session) => {
    const events = await session.subscribe('status');
    await session.write('command', Uint8Array.of(1));
    const first = (await events.next()).value[0];
    await session.unsubscribe('status');
    return first;
  });

  expect(confirmation).toBe(2);
  expect(host.transcript.map((entry) => entry.op)).toEqual([
    'scan',
    'connect',
    'subscribe',
    'write',
    'unsubscribe',
    'disconnect',
  ]);
});
```

Bedienfläche des Fake-Hosts:

| Mitglied                                            | Zweck                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contextFor(pluginId)`                              | Ein `PluginBleContext` für ein Plugin.                                                                                                                                                                       |
| `addReader(reader)`, `setReaderAccess(id, allowed)` | Reader (`readerId`, `name`, `allowPluginBle?`, `available?`) und die Administrator-Freigabe (Standard aus).                                                                                                  |
| `addPeripheral(peripheral)`                         | Ein Gerät: `readerId` oder `readerIds`, `address`, `addressType`, `advertisement`, `characteristics`. Characteristics werden über ihre UUID angegeben und nehmen `value`, `onRead`, `onWrite` und `delayMs`. |
| `notify(address, uuid, bytes)`                      | Das Gerät sendet eine Benachrichtigung.                                                                                                                                                                      |
| `disconnect(address)`                               | Das Gerät trennt die Verbindung: Sitzungen schließen mit `disconnected`.                                                                                                                                     |
| `failNext(op, code, { detail })`                    | Das nächste `scan`, `connect`, `read`, `write`, `subscribe`, `unsubscribe` oder `disconnect` schlägt fehl.                                                                                                   |
| `advance(ms)`                                       | Bewegt die manuelle Uhr: löst Timeouts und Lease-Ablauf aus. Es werden keine echten Timer genutzt.                                                                                                           |
| `transcript`, `openSessions()`                      | Jedes validierte Primitiv, das den Transport erreichte, der Reihe nach, und die offenen Sitzungen.                                                                                                           |
| `createFakeBleHost({ ready })`, `setReady(ready)`   | Simuliert Aufrufe vor dem Host-Start (`NOT_READY`).                                                                                                                                                          |

Um einen Timeout zu testen, geben Sie einer Characteristic ein `delayMs`, das länger als der Timeout ist, starten den Aufruf und rufen dann `await host.advance(timeoutMs)` auf.

## Echte Reader

Fake und Host teilen dieselbe Validierung und werden von einer gemeinsamen Vertrags-Testsuite geprüft. Der Transport, der BLE-Verkehr über echte Attractap-Reader trägt (Websocket-Protokoll und Firmware), folgt mit ATT-1033. Benachrichtigungen, Abbruch und Telemetrie auf echter Hardware folgen mit ATT-1036. An Ihrem Plugin ändert sich nichts, wenn er erscheint; ein Administrator aktiviert dann **Plugins die Bluetooth-Nutzung erlauben** an einem Reader.
