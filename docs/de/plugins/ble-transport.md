# Bluetooth-Transport für Plugins

<!-- llms-description: Beschreibt den BLE-Transportvertrag, über den Backend-Plugins mit Bluetooth-Geräten über Attractap-Reader sprechen: Profile, Endpunkte, Sitzungen, Fehler, Grenzwerte und Tests mit dem Fake. -->

Backend-Plugins mit der Berechtigung `BLE_TRANSPORT` können über Attractap-Reader mit Bluetooth-Low-Energy-Geräten (BLE) sprechen. Der Transport ist bewusst **keine** rohe GATT-Schnittstelle: Jede Operation läuft über ein Profil, das Ihr Plugin registriert hat, und einen Endpunkt, den Ihr Plugin besitzt. Der Kern setzt die Grenzen durch; Ihr Plugin liefert die herstellerspezifische Semantik.

> [!NOTE]
> Für Plugin-Bluetooth brauchen Reader die Attractap-Firmware **2.5.0 oder neuer**. Mit älterer Firmware enden `scan` und `openSession` mit `READER_UNSUPPORTED`. `TRANSPORT_UNAVAILABLE` tritt nur auf Hosts ohne Reader-Transport auf (zum Beispiel auf einem Test-Host); wiederholen Sie den Fehler nicht in einer engen Schleife.

## Vertrauensgrenze

| Ihr Plugin besitzt                                           | Der Kern besitzt                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Auswerten von Advertisements und Auswahl eines Geräts        | Welche Reader Plugins nutzen dürfen (Freigabe durch Administratoren pro Reader) |
| Zugangsdaten, Schlüssel und das Befehlsprotokoll             | Geräteidentität: Die Adresse, mit der ein Plugin sprechen darf, ist gebunden    |
| Was ein Lesen, Schreiben oder eine Benachrichtigung bedeutet | Das Profil: nur registrierte Services, Characteristics und Operationen          |
| Wann verbunden wird und wann aufgegeben wird                 | Größenlimits, Fristen, Sitzungs-Leases und Abbruch                              |
| Endpunkte löschen, die nicht mehr gebraucht werden           | Eigentum (Plugins sehen die Endpunkte anderer nie) und Aufräumen                |

Die Durchsetzung läuft immer im Host. Die Prüffunktionen sind aus dem SDK exportiert, damit sich der Fake identisch verhält; ein Plugin kann sie aber nicht umgehen.

Plugin-Bluetooth funktioniert nur an [gekoppelten Readern](attractap/pairing.md), die über die verschlüsselte Reader-Verbindung mit dem Server sprechen. Die Reader-Firmware lehnt BLE-Befehle über die ältere tokenbasierte Verbindung und vor der Anmeldung des Readers ab; der Host meldet einen solchen Reader als `READER_OFFLINE` mit Detail `pairing-required`.

> [!IMPORTANT]
> Die Funkverbindung zwischen Reader und Gerät hat **keine Sicherheit auf Bluetooth-Ebene**. Die Reader-Firmware ist ohne BLE-Sicherheit gebaut (`CONFIG_BT_NIMBLE_SECURITY_ENABLE` ist aus): Sie koppelt sich nie mit einem Gerät (kein Pairing, kein Bonding), und die BLE-Verbindung ist nicht verschlüsselt. Jeder in Funkreichweite kann den Verkehr mitschneiden. Sind Nutzdaten sensibel (Benutzercodes, Schlüssel, Entsperrbefehle), muss Ihr Plugin sie selbst verschlüsseln und authentifizieren, zum Beispiel mit der Sicherheit des Geräteprotokolls.

Administratoren behalten die Kontrolle: Ein Reader ist für Plugins standardmäßig gesperrt. Ein Administrator aktiviert **Bluetooth-Nutzung durch Plugins erlauben** im Reader-Editor (Tab Allgemein). Beim Ausschalten enden alle BLE-Sitzungen von Plugins auf diesem Reader sofort; vorhandene Endpunkte bleiben bestehen, aber Scans, neue Endpunkte und Sitzungen scheitern mit `READER_ACCESS_DENIED`.

> [!WARNING]
> `BLE_TRANSPORT` sperrt die Hintertüren anderer Berechtigungen nicht. `DATABASE_ACCESS` umgeht das Eigentum, weil es jede Tabelle lesen kann, und `RESOLVE_HOST_PROVIDERS` (`context.get`) erreicht interne Host-Dienste. Installieren Sie nur Plugins, denen Sie diese Berechtigungen anvertrauen, und lesen oder ändern Sie die Zeilen von `plugin_ble_endpoint` nie darüber: Nutzen Sie `context.ble`. Nutzen Sie `context.get` auch nie, um an den BLE-Transport zu gelangen: Damit umgehen Sie alle Prüfungen dieser Seite.

## Lebenszyklus

`context.ble` steht zur Verfügung, wenn das Plugin `BLE_TRANSPORT` deklariert; ohne die Berechtigung wirft der Getter einen `PluginPermissionError`. Die Eigenschaft ist im Typ optional, damit ein Plugin auch gegen Hosts kompiliert, die sie noch nicht kennen.

```ts
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';

const plugin: PluginBackendModule = {
  register(context) {
    const ble = context.ble;
    if (!ble) throw new Error('This plugin needs a host with BLE transport support');
    ble.registerProfile({/* ... */});
    return { module: MyModule };
  },
};
```

Die folgenden Beispiele nutzen dieses `ble`.

- **`registerProfile` ist synchron.** Es braucht keinen Host-Dienst und darf deshalb in `register(context)`, in einem Provider-Konstruktor oder im Modul-Scope aufgerufen werden, bei jeder Ladereihenfolge der Plugins.
- **Alle anderen Methoden sind asynchron und werfen nie synchron.** Vor Abschluss des Host-Starts enden sie mit `PluginBleError('NOT_READY')` (wiederholbar). Sie warten nie. Rufen Sie sie aus einem Lifecycle-Hook, einem Request- oder Event-Handler auf oder wiederholen Sie bei `NOT_READY`.
- **Der Host baut Ihr Plugin zweimal.** Beim Start lädt eine Wegwerf-Konfigurations-App Ihre Plugin-Module und wird wieder geschlossen; danach lädt die eigentliche Anwendung sie. Ihre Registrierungen laufen in beiden. Dieselbe Definition erneut zu registrieren ist idempotent, ohne dass Sie etwas tun müssen. Eine _andere_ Definition unter einer vorhandenen ID wirft `PROFILE_CONFLICT`, und Ihr Plugin lädt nicht.
- Profile liegen pro Plugin-ID im Speicher. Endpunkte speichert der Kern in seiner Datenbank; sie überleben Neustarts. Ein Endpunkt, dessen Profil Ihr Plugin (noch) nicht registriert hat, lässt sich auflisten, ändern und löschen; das Öffnen einer Sitzung scheitert aber mit `PROFILE_NOT_REGISTERED`.
- **Ein Profil lässt sich zur Laufzeit der API nicht ändern.** Einmal registriert, behält eine Profil-ID ihre Definition bis zum Neustart der API (das Installieren oder Aktualisieren von Plugins startet sie neu). Ein Plugin, das ein Profil aus seinen Einstellungen baut, erhält nach einer Änderung der Einstellungen bis zum nächsten Neustart `PROFILE_CONFLICT`.
- **Profile haben keine Version.** Ändert ein Plugin-Update ein Profil unter derselben ID, werden vorhandene Endpunkte mit der neuen Definition ausgelegt. Verwenden Sie für inkompatible Änderungen eine neue Profil-ID.

## Profile

Ein Profil ist unveränderlich und listet genau auf, was Ihr Plugin mit einer Geräteart tun darf.

```ts
const profile = ble.registerProfile({
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
- **Die Reihenfolge der Listen spielt keine Rolle.** `registerProfile` sortiert `operations` und die Listen des Advertisement-Filters in eine feste Reihenfolge; dieselbe Definition mit anders sortierten Listen erneut zu registrieren ist daher idempotent.
- **Grenzen** (`maxReadBytes`, `maxWriteBytes`, `maxNotificationBytes`, 1..512) sind für jede erlaubte Operation Pflicht. Eine Grenze, die Sie für eine nicht erlaubte Operation angeben, muss trotzdem zwischen 1 und 512 liegen. Ein Schreiben über der Grenze endet mit `PAYLOAD_TOO_LARGE`, **bevor** etwas den Reader erreicht. Auch ein gelesener Wert über der Grenze endet mit `PAYLOAD_TOO_LARGE`; eine Benachrichtigung über der Grenze lässt ihren Stream fehlschlagen (siehe [Sitzungen](#sitzungen)).
- **`advertisement`** filtert Scans: Ein Scan liefert nur Advertisements, die jedes gesetzte Kriterium erfüllen (eine der genannten Service-UUIDs, eine der genannten Hersteller-IDs von 0 bis 0xffff und das Namenspräfix). Ein Filter muss mindestens eines der drei Kriterien setzen, sonst `INVALID_PROFILE`. Ein Profil ohne Advertisement-Filter kann nicht scannen (`OPERATION_NOT_ALLOWED`).
- **`limits`** legen die Obergrenze des Sitzungs-Leases fest (`maxSessionMs`, 1 ms bis 15 Minuten, Standard 30 s; das Standard-Lease beträgt 30 s oder `maxSessionMs`, falls das kleiner ist) und die Benachrichtigungswarteschlange bis auf 256 (`maxNotificationQueue`, Standard 32). Weil `maxSessionMs` standardmäßig 30 s beträgt, braucht ein `leaseMs` über 30 s `limits.maxSessionMs` im Profil. Werte über den Host-Grenzen werden mit `INVALID_PROFILE` abgelehnt.

Das zurückgegebene Profil ist tief eingefroren. Ungültige Definitionen werfen `PluginBleError('INVALID_PROFILE')` mit einer Meldung, die das Feld nennt, zum Beispiel `services[0].characteristics[1].maxReadBytes: is required for the allowed operations`.

## Reader und Scannen

```ts
const readers = await ble.listReaders();
// [{ readerId: 3, name: 'Werkstatt-Tür', available: true }]

const advertisements = await ble.scan(readers[0].readerId, 'door-lock', {
  durationMs: 5000, // Standard 5 s, maximal 15 s
  signal,
});
// [{ address: 'AA:BB:CC:DD:EE:01', addressType: 'public', rssi: -48, name: 'Lock 12',
//    serviceUuids: ['0000fff0-...'], manufacturerData: [{ companyId: 0x1234, data: Uint8Array }] }]
```

`listReaders` liefert nur Reader, die ein Administrator für Plugins freigegeben hat. `available` ist true, solange der Reader online ist und seine Firmware Plugin-Bluetooth unterstützt. Es ist false, wenn der Host keinen Transporttreiber hat, der Reader offline ist oder seine Firmware zu alt ist. Ein Reader, der gerade die Sitzung eines anderen Plugins bedient, bleibt `available`.

Ein Reader erledigt **eine BLE-Aufgabe zur Zeit**: einen Scan oder eine Sitzung, für alle Plugins zusammen. Ein `scan` oder `openSession`, während ein anderer Scan oder eine andere Sitzung den Reader nutzt, endet sofort mit `READER_BUSY` (wiederholbar). Es gibt keine Warteschlange. Ein Scan liefert höchstens 32 Advertisements, nach Adresse dedupliziert (auf dem Reader und noch einmal im Host).

`scan` hat eine Frist im Host: Antwortet der Transport nicht innerhalb von `durationMs` plus 5 s, endet der Scan mit `TIMEOUT`. Advertisements, die der Reader fehlerhaft meldet, werden übersprungen; sie lassen den Scan nicht scheitern.

## Endpunkte

Ein Endpunkt bindet eine Geräteadresse an einem Reader an eines Ihrer Profile. Der Kern speichert ihn, und genau ein Plugin besitzt ihn.

```ts
const endpoint = await ble.createEndpoint({
  readerId: 3,
  address: 'aa:bb:cc:dd:ee:01', // wird zu AA:BB:CC:DD:EE:01 normalisiert
  addressType: 'public',
  profileId: 'door-lock',
  label: 'Werkstatt-Tür', // optional, höchstens 100 Zeichen
});
// endpoint.id ist eine UUID ohne eigene Bedeutung: Speichern Sie sie in Ihren eigenen Datensätzen.

await ble.listEndpoints(); // nur Ihre Endpunkte
await ble.getEndpoint(endpoint.id);
await ble.updateEndpoint(endpoint.id, { label: null, readerId: 4 }); // profileId ist unveränderlich
await ble.deleteEndpoint(endpoint.id);
```

- `profileId` muss von **Ihrem** Plugin registriert sein, sonst `PROFILE_NOT_REGISTERED`.
- Der Reader muss existieren und freigegeben sein: `READER_NOT_FOUND` oder `READER_ACCESS_DENIED`.
- Eine physische Adresse gehört höchstens einem Plugin; ein anderes Plugin, das sie bindet, erhält `ENDPOINT_CONFLICT`. Ein Plugin darf dieselbe Adresse an mehreren Readern binden, aber nur einmal pro Reader.
- Die Endpunkt-ID eines anderen Plugins verhält sich genau wie eine fehlende (`ENDPOINT_NOT_FOUND`), sodass die Existenz von Endpunkten nie durchsickert.
- Endpunkte werden entfernt, wenn ihr Reader gelöscht wird und wenn Ihr Plugin deinstalliert wird.

## Sitzungen

```ts
const result = await ble.withSession(
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

| Eigenschaft/Methode                           | Verhalten                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `endpointId`                            | Identifizieren Sitzung und Endpunkt.                                                                                                                                                                                                                                       |
| `mtu`                                         | Die ausgehandelte ATT-MTU (23..517). Ein Schreiben ohne Antwort trägt höchstens `mtu - 3` Bytes; mehr endet mit `PAYLOAD_TOO_LARGE` (Detail `exceeds-mtu`). Schreiben mit Antwort nutzt bis zur Profilgrenze das Long-Write-Verfahren.                                     |
| `read(key, { signal, timeoutMs })`            | Liest eine Characteristic; liefert eine Kopie der Bytes.                                                                                                                                                                                                                   |
| `write(key, value, { withoutResponse, ... })` | Schreibt. Ein leerer Wert endet mit `INVALID_ARGUMENT`. `withoutResponse` braucht die Operation `writeWithoutResponse`, sonst ist `write` nötig; ein Schlüssel, der nur `writeWithoutResponse` erlaubt, braucht also `{ withoutResponse: true }`. Für Massenübertragungen. |
| `subscribe(key, { signal })`                  | Startet Benachrichtigungen (`notify` oder `indicate`). Liefert einen Stream mit `next({ timeoutMs, signal })`, einem asynchronen Iterator und `unsubscribe()`.                                                                                                             |
| `unsubscribe(key)`                            | Beendet ein Abonnement. Ohne Abonnement passiert nichts.                                                                                                                                                                                                                   |
| `close()`                                     | Idempotent. Trennt die Verbindung und beendet die Sitzung.                                                                                                                                                                                                                 |
| `closed`                                      | Ein Promise, das mit `{ reason }` aufgelöst wird (nie abgelehnt), sobald die Sitzung endete und der Host die Verbindung getrennt hat.                                                                                                                                      |

Regeln:

- **Eine offene Sitzung pro Endpunkt.** Ein zweites `openSession` endet mit `ENDPOINT_BUSY` (wiederholbar). Es gibt keine Warteschlange.
- **Eine Sitzung pro Reader.** Ein Reader hält eine BLE-Verbindung zur Zeit, für alle Plugins. Solange eine Sitzung oder ein Scan ihn nutzt, enden `openSession` und `scan` über diesen Reader mit `READER_BUSY` (wiederholbar). Eine lange Sitzung, etwa ein Firmware-Update eines Geräts, blockiert den Reader für alle Plugins, bis sie endet. Halten Sie Sitzungen deshalb so kurz, wie die Aufgabe es erlaubt.
- **Schreiben ohne Antwort läuft im Pipelining.** `write(..., { withoutResponse: true })` ist erledigt, sobald die Reader-Verbindung den Schreibvorgang in Reihenfolge eingereiht hat, nicht erst nach einem Roundtrip. So bleiben große Übertragungen schnell. Scheitert einer davon später am Reader, endet das nächste `read`, `write` oder `subscribe`, das Ihr Plugin in der Sitzung startet, mit dem Code dieses Fehlers. Folgt keine solche Operation, wird der Fehler nur beim Schließen der Sitzung protokolliert; Ihr Plugin erfährt nichts davon. Beenden Sie eine Übertragung mit einer Operation, die eine Antwort hat (ein Schreiben mit Antwort, ein Lesen oder die Bestätigungs-Benachrichtigung des Geräts), um zu wissen, dass sie angekommen ist. Teilen Sie große Daten in Stücke von `session.mtu - 3` Bytes.
- **Operationen laufen nacheinander in der Reihenfolge der Aufrufe.**
- **Benachrichtigungen** kommen pro Abonnement in Reihenfolge und nur bei der besitzenden Sitzung an, in einer begrenzten Warteschlange (Standard 32, Profilmaximum 256). Verarbeiten Sie sie zügig. Wer einen bereits abonnierten Schlüssel erneut abonniert, erhält `INVALID_ARGUMENT`.
- **Ein fehlschlagender Stream verwirft nie stillschweigend Daten.** Läuft die Warteschlange über, verwirft der Host die wartenden Benachrichtigungen und lässt den Stream sofort mit `NOTIFICATION_OVERFLOW` fehlschlagen. Eine Benachrichtigung über `maxNotificationBytes` lässt den Stream ebenso mit `PAYLOAD_TOO_LARGE` fehlschlagen. Jedes wartende und spätere `next()` endet dann mit diesem Code, die Sitzung bleibt offen. Rufen Sie `session.unsubscribe(key)` auf und abonnieren Sie erneut, um fortzufahren.
- **Wie ein Stream endet.** Der asynchrone Iterator endet ohne Fehler, wenn der Stream beendet wird oder die Sitzung regulär schließt (`close()`, Lease-Ablauf, Entzug der Freigabe, Herunterfahren). Er wirft, wenn das Gerät die Verbindung trennt (`DISCONNECTED`), bei einem Überlauf und bei einer zu großen Benachrichtigung. `stream.unsubscribe()` bewirkt wie das Verlassen einer `for await`-Schleife nichts mehr, sobald der Stream geendet hat oder die Sitzung geschlossen ist. Es beendet immer nur diesen Stream, nie ein neueres Abonnement auf demselben Schlüssel.
- **Nach `close`** enden alle weiteren Operationen mit `SESSION_CLOSED`. Operationen, die beim Schließen noch liefen, enden sofort und genau einmal: mit `DISCONNECTED`, wenn das Gerät die Verbindung trennte, mit `CANCELLED`, wenn das an `openSession` übergebene Signal abbrach, sonst mit `SESSION_CLOSED`.
- **`closed` wartet auf das Trennen.** Es wird erst aufgelöst, wenn der Host die Verbindung getrennt hat (begrenzt durch eine Frist im Host). Eine neue Sitzung direkt danach zu öffnen, scheitert deshalb nicht mit `ENDPOINT_BUSY`. Nach einer Zeitüberschreitung beim Verbinden oder einem abgebrochenen Öffnen bleibt der Endpunkt belegt (`ENDPOINT_BUSY`, wiederholbar), bis der Verbindungsversuch des Readers beendet ist, höchstens 10 s.
- **Gründe in `closed`:** `closed`, `lease-expired`, `cancelled`, `disconnected`, `reader-access-revoked`, `endpoint-deleted`, `shutdown`, `error`.
- **Abbruch.** `scan`, `openSession`, `withSession`, `read`, `write`, `subscribe` und `next` akzeptieren ein `AbortSignal`. Ein Abbruch beendet den wartenden Aufruf mit `CANCELLED`. Bricht das Signal ab, das Sie an `openSession` übergeben haben, schließt die Sitzung. Eine Operation mit Zeitüberschreitung oder Abbruch schließt die Sitzung **nicht**, es sei denn, der Transport meldet die Verbindung als verloren. An einem echten Reader erreicht der Abbruch den Reader: Ein Scan stoppt, ein laufender Verbindungsaufbau wird abgebrochen und der Reader freigegeben. Ein Lese- oder Schreibvorgang, den das Funkmodul schon begonnen hat, lässt sich nicht mittendrin abbrechen: Ihr Aufruf endet sofort, der Reader verwirft das späte Ergebnis, und die nächste Operation beginnt, sobald das Funkmodul fertig ist.

## Fehler

Jeder Fehler ist ein `PluginBleError` mit stabilem `code`, einem `retryable`-Flag, optional `operation` und optional `detail`. `detail` ist eine unbedenkliche Diagnose und enthält nie Nutzdaten-Bytes. Berechtigungsfehler bleiben `PluginPermissionError`. Validierungsfehler (`INVALID_PROFILE`, `INVALID_ARGUMENT`) nennen das betroffene Feld in der Meldung. `retryable` bedeutet, dass ein späterer Versuch gelingen kann, nicht, dass Sie sofort wiederholen sollen: Warten Sie zwischen den Versuchen.

| Code                     | Wiederholbar | Bedeutung                                                                                        |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| `NOT_READY`              | ja           | Der Host hat den Start noch nicht abgeschlossen.                                                 |
| `TRANSPORT_UNAVAILABLE`  | ja           | Der Host läuft ohne Reader-Transport (zum Beispiel ein Test-Host).                               |
| `READER_NOT_FOUND`       | nein         | Der Reader existiert nicht.                                                                      |
| `READER_ACCESS_DENIED`   | nein         | Ein Administrator hat den Reader nicht für Plugins freigegeben.                                  |
| `READER_OFFLINE`         | ja           | Der Reader ist nicht verbunden oder unterstützt gerade kein BLE.                                 |
| `READER_UNSUPPORTED`     | nein         | Die Firmware des Readers unterstützt kein Plugin-BLE (`detail` nennt den Grund).                 |
| `READER_BUSY`            | ja           | Ein anderer Scan oder eine andere Sitzung nutzt den Reader, oder er aktualisiert seine Firmware. |
| `PROFILE_NOT_REGISTERED` | nein         | Ihr Plugin hat dieses Profil in diesem Prozess nicht registriert.                                |
| `PROFILE_CONFLICT`       | nein         | Unter dieser ID ist bereits eine andere Definition registriert.                                  |
| `INVALID_PROFILE`        | nein         | Die Profildefinition ist ungültig.                                                               |
| `INVALID_ARGUMENT`       | nein         | Ein Argument ist ungültig (die Meldung nennt das Feld).                                          |
| `ENDPOINT_NOT_FOUND`     | nein         | Der Endpunkt existiert nicht oder gehört einem anderen Plugin.                                   |
| `ENDPOINT_CONFLICT`      | nein         | Die Adresse ist bereits gebunden (an ein anderes Plugin oder an diesem Reader).                  |
| `ENDPOINT_BUSY`          | ja           | Der Endpunkt hat bereits eine offene Sitzung.                                                    |
| `UNKNOWN_CHARACTERISTIC` | nein         | Der Schlüssel ist nicht im Profil.                                                               |
| `OPERATION_NOT_ALLOWED`  | nein         | Das Profil erlaubt diese Operation für den Schlüssel (oder das Scannen) nicht.                   |
| `PAYLOAD_TOO_LARGE`      | nein         | Nutzdaten überschreiten ihre Profilgrenze.                                                       |
| `TIMEOUT`                | ja           | Eine Frist ist abgelaufen.                                                                       |
| `CANCELLED`              | nein         | Der Aufruf wurde über sein `AbortSignal` abgebrochen.                                            |
| `SESSION_CLOSED`         | nein         | Die Sitzung ist geschlossen.                                                                     |
| `DEVICE_NOT_FOUND`       | ja           | Das Gerät wurde in der Nähe des Readers nicht gefunden.                                          |
| `CONNECTION_FAILED`      | ja           | Der Verbindungsaufbau ist fehlgeschlagen.                                                        |
| `DISCONNECTED`           | ja           | Das Gerät hat die Verbindung getrennt.                                                           |
| `GATT_ERROR`             | nein         | Das Gerät antwortete mit einem GATT-Fehler.                                                      |
| `NOTIFICATION_OVERFLOW`  | nein         | Die Benachrichtigungswarteschlange ist übergelaufen.                                             |
| `INTERNAL`               | nein         | Ein unerwarteter Host-Fehler. Die Meldung enthält nie Nutzdaten.                                 |

## Grenzwerte

| Grenze                                        | Standard     | Maximum                                                      |
| --------------------------------------------- | ------------ | ------------------------------------------------------------ |
| Operations-Timeout (`timeoutMs`)              | 10 s         | 60 s                                                         |
| Verbindungs-Timeout (`connectTimeoutMs`)      | 15 s         | 60 s                                                         |
| Sitzungs-Lease (`leaseMs`)                    | 30 s         | `maxSessionMs` des Profils (Standard 30 s), höchstens 15 min |
| Scandauer (`durationMs`)                      | 5 s          | 15 s                                                         |
| Benachrichtigungswarteschlange pro Abonnement | 32           | 256 (`maxNotificationQueue` des Profils)                     |
| Nutzdaten pro Characteristic                  | -            | 1..512 Bytes, im Profil festgelegt                           |
| ATT-MTU (`session.mtu`)                       | ausgehandelt | 23..517                                                      |
| Endpunkt-Bezeichnung                          | -            | 100 Zeichen                                                  |

Werte über einer Grenze werden mit `INVALID_ARGUMENT` abgelehnt (in einem Profil mit `INVALID_PROFILE`); sie werden nie stillschweigend gekürzt. Die Konstanten sind als `PLUGIN_BLE_LIMITS` exportiert.

Echte Reader setzen zusätzlich diese Grenzen:

| Grenze                                   | Maximum                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Scanfilter (`advertisement` des Profils) | 8 Service-UUIDs, 8 Hersteller-IDs, Namenspräfix von 64 Bytes (UTF-8); ein größerer Filter endet mit `INVALID_ARGUMENT`                    |
| Characteristics pro Profil               | 16 (mehr enden mit `READER_UNSUPPORTED`, Detail `allowlist-too-large:<n>`)                                                                |
| Wartende Anfragen pro Reader             | 16, der kleinere Wert aus der Host-Grenze (32) und der Grenze, die die Firmware meldet; mehr enden mit `READER_BUSY`, Detail `queue-full` |
| Benachrichtigungspuffer auf dem Reader   | 64 Benachrichtigungen oder 32 KiB pro Sitzung                                                                                             |

Ein beworbener Name ist höchstens 31 Bytes lang; ein längeres Namenspräfix passt deshalb nie.

## Echte Reader

Die Reader-Firmware (2.5.0 oder neuer) meldet Plugin-Bluetooth beim Verbinden an. Host und Reader setzen die Regeln beide durch:

- **Kompatibilität.** Ein Reader ohne diese Fähigkeit oder mit einer Protokollversion, die der Host nicht unterstützt, lässt `scan` und `openSession` mit `READER_UNSUPPORTED` enden. `detail` ist `no-ble-capability`, `protocol-version:<n>` oder `missing-operation:<op>`. Ein Profil mit mehr Characteristics, als der Reader annimmt (16), endet mit `READER_UNSUPPORTED`, Detail `allowlist-too-large:<n>`. Im ersten Fall hilft ein Firmware-Update des Readers (OTA vom Server).
- **Durchsetzung am Reader.** Mit jeder Sitzung schickt der Host dem Reader das Profil als Allowlist: die gebundene Adresse und je Characteristic den Service, die Operationen und die Größenlimits. Der Reader lehnt alles andere ab, bevor er das Funkmodul benutzt. Das schützt vor Fehlern im Host, nicht vor einem kompromittierten Server, der jede beliebige Allowlist schicken könnte.
- **Fristen am Reader.** Der Reader hält eigene Fristen und trennt das Gerät deshalb selbst, wenn der Server schweigt:
  - Jede Operation hat am Reader eine Frist von ihrem `timeoutMs` plus 2 s. Eine Operation, die sie überschreitet, endet mit `TIMEOUT`, und die Sitzung bleibt offen, wie im Host.
  - Der Reader beendet die Sitzung selbst nur, wenn eine GATT-Operation im Funk-Stack hängt (etwa 35 s) oder wenn sein Lease abläuft (Ihr Lease plus 10 s, gezählt ab dem Aufbau der Verbindung).
  - Verliert der Reader die Verbindung zum Server, trennt er das Gerät sofort.
- **Bytes vom Reader** prüft der Host, bevor er sie dekodiert. Ein gelesener Wert über seiner Grenze endet mit `PAYLOAD_TOO_LARGE` (Detail `max-read`), ein fehlerhafter (falsche Kodierung oder kein Wert) mit `INTERNAL` (Detail `malformed-result`).
- **Benachrichtigungen** puffert der Reader (64 Benachrichtigungen oder 32 KiB pro Sitzung) und leitet sie in Reihenfolge mit einer Sequenznummer weiter. Jeder Fehler lässt den Stream scheitern:
  - ein voller Puffer am Reader: `NOTIFICATION_OVERFLOW` (Detail `reader-buffer`); eine volle Warteschlange des Hosts für das Abonnement: `NOTIFICATION_OVERFLOW`;
  - eine Benachrichtigung über `maxNotificationBytes`: `PAYLOAD_TOO_LARGE` (Detail `max-notification`);
  - eine Lücke oder ein Duplikat in der Sequenz oder eine fehlerhafte Benachrichtigung: `INTERNAL` (Detail `malformed-notification`).

  Nichts geht stillschweigend verloren.

- **Diagnose.** Funkfehler werden auf die Codes oben abgebildet; `detail` enthält den Rohgrund als sicheren Text, zum Beispiel `nimble:rc=13`, `hci:0x3e`, `att:0x0a` oder `reason:0x08`. `READER_OFFLINE` hat diese Details:
  - `pairing-required`: Der Reader ist nicht gekoppelt (siehe [Vertrauensgrenze](#vertrauensgrenze)). Koppeln Sie ihn.
  - `firmware-info-pending`: Der Reader ist verbunden, hat seine Firmware aber noch nicht gemeldet. Versuchen Sie es kurz danach erneut.
  - `ble-init-failed`: Der Reader konnte seinen Bluetooth-Stack nicht starten. Starten Sie den Reader neu, wenn der Fehler bleibt.
  - kein Detail: Der Reader ist nicht verbunden.
- **Latenz.** Jede Operation, auf die Sie warten, läuft vom Server zum Reader und zurück, über WLAN typischerweise 0,2 bis 0,3 s. Ein Protokoll, das nach jedem Stück auf eine Bestätigung wartet, ist durch diesen Roundtrip begrenzt (gemessen: etwa 1,8 KiB/s mit 512-Byte-Stücken). Schicken Sie große Datenmengen als Schreiben ohne Antwort im Pipelining oder in größeren Fenstern zwischen den Bestätigungen.
- **Abbrechen auf dem Reader.** Ein abgebrochener `scan` oder `openSession` endet sofort, aber der Reader bleibt belegt, bis er die abgebrochene Anfrage beantwortet hat (der Abbruch selbst hat keine Antwort), meist einen Roundtrip lang (0,2 bis 0,3 s). Ein `scan` oder `openSession` in diesem Fenster endet mit `READER_BUSY` (wiederholbar); versuchen Sie es nach einer kurzen Pause erneut.
- **Firmware-Updates.** Startet ein Reader ein Firmware-Update, beendet er seine BLE-Sitzung (`disconnected`) und lehnt neue BLE-Arbeit bis zum Neustart mit `READER_BUSY` (Detail `ota`) ab.

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
| Ein Administrator schaltet **Bluetooth-Nutzung durch Plugins erlauben** am Reader aus                                                                       | Seine Sitzungen schließen mit `reader-access-revoked`. Endpunkte bleiben.         |
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

| Eigenschaft/Methode                                 | Zweck                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contextFor(pluginId)`                              | Ein `PluginBleContext` für ein Plugin.                                                                                                                                                                       |
| `addReader(reader)`, `setReaderAccess(id, allowed)` | Reader (`readerId`, `name`, `allowPluginBle?`, `available?`) und die Administrator-Freigabe (Standard aus).                                                                                                  |
| `removeReader(id)`                                  | Löscht einen Reader: Sitzungen schließen mit `reader-access-revoked`, seine Endpunkte werden gelöscht.                                                                                                       |
| `setReaderAvailable(id, available)`                 | `false`: Scans und Sitzungen am Reader scheitern mit `READER_OFFLINE`.                                                                                                                                       |
| `setTransportAvailable(available)`                  | `false`: ein Host ohne Transport (`TRANSPORT_UNAVAILABLE`).                                                                                                                                                  |
| `setReaderSupported(id, supported, detail?)`        | `false`: Reader-Firmware ohne Plugin-BLE; Scans und Sitzungen scheitern mit `READER_UNSUPPORTED` und `detail` (Standard `no-ble-capability`).                                                                |
| `setMtu(mtu)`                                       | Die ATT-MTU künftig geöffneter Verbindungen (Standard 247, auch als `createFakeBleHost({ mtu })`).                                                                                                           |
| `addPeripheral(peripheral)`                         | Ein Gerät: `readerId` oder `readerIds`, `address`, `addressType`, `advertisement`, `characteristics`. Characteristics werden über ihre UUID angegeben und nehmen `value`, `onRead`, `onWrite` und `delayMs`. |
| `notify(address, uuid, bytes)`                      | Das Gerät sendet eine Benachrichtigung.                                                                                                                                                                      |
| `disconnect(address)`                               | Das Gerät trennt die Verbindung: Sitzungen schließen mit `disconnected`.                                                                                                                                     |
| `failNext(op, code, { detail })`                    | Das nächste `scan`, `connect`, `read`, `write`, `subscribe`, `unsubscribe` oder `disconnect` schlägt fehl.                                                                                                   |
| `advance(ms)`                                       | Bewegt die manuelle Uhr: löst Timeouts und Lease-Ablauf aus. Es werden keine echten Timer genutzt.                                                                                                           |
| `transcript`, `openSessions()`                      | Jedes validierte Primitiv, das den Transport erreichte, der Reihe nach, und die offenen Sitzungen.                                                                                                           |
| `createFakeBleHost({ ready })`, `setReady(ready)`   | Simuliert Aufrufe vor dem Host-Start (`NOT_READY`).                                                                                                                                                          |
| `createFakeBleHost({ startTime })`                  | Startzeit der Fake-Uhr in ms seit 1970 (Standard 2026-01-01T00:00:00Z).                                                                                                                                      |
| `shutdownPlugin(pluginId)`                          | Das Plugin-Modul wird zerstört: Seine Sitzungen schließen mit `shutdown`.                                                                                                                                    |
| `uninstallPlugin(pluginId)`                         | Das Plugin wird deinstalliert: Seine Sitzungen schließen, seine Endpunkte werden gelöscht.                                                                                                                   |

Um einen Timeout zu testen, geben Sie einer Characteristic ein `delayMs`, das länger als der Timeout ist, starten den Aufruf und rufen dann `await host.advance(timeoutMs)` auf.

## Der Fake und echte Reader

Fake und Host teilen dieselbe Validierung und werden von einer gemeinsamen Vertrags-Testsuite geprüft. Sie läuft gegen den Fake, gegen den Host mit einem Testtreiber und gegen den Host mit dem echten Reader-Treiber, der mit einem simulierten Reader spricht. Ein Plugin, dessen Tests gegen den Fake bestehen, verhält sich an einem echten Reader genauso; dort aktiviert ein Administrator **Bluetooth-Nutzung durch Plugins erlauben** an einem Reader mit Firmware 2.5.0 oder neuer.
