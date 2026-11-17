# Kartenauthentifizierung für Plugins

<!-- llms-description: Wie Backend-Plugins mit CARD_AUTHENTICATION eine NFC-Karte an ihrem Gerät über einen Kartenkanal authentifizieren lassen: Grenzwerte, Fehlergründe, BLE-Beispiel. -->

Ein Backend-Plugin, das ein NFC-fähiges Gerät besitzt (ein Terminal, eine Türeinheit, ein Maschinenpanel), kann
Attraccess eine Karte authentifizieren lassen, die an dieses Gerät gehalten wird. Das Plugin übergibt die UID der Karte
und einen **Kartenkanal**: eine Funktion, die eine APDU an die Karte weiterleitet und die Antwort der Karte zurückgibt.
Attraccess führt über diesen Kanal dieselbe Prüfung aus wie bei einem Tap an einem Attractap-Reader und teilt dem Plugin
mit, wem die Karte gehört.

Eine an einem Attractap angelernte Karte funktioniert deshalb am Gerät des Plugins genauso, mit denselben Fehlerbedeutungen.

## Vertrauensgrenze

| Ihr Plugin verantwortet                                           | Der Kern verantwortet                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Das Gerät, seine Verbindung (BLE, seriell, Netzwerk) und Framing  | Kartenschlüssel, Sitzungsschlüssel und Secure Messaging             |
| Die UID melden und APDUs und Antworten Byte für Byte weiterleiten | Kartentyp-Erkennung und die Entscheidung, ob die Karte echt ist     |
| Zugriffsentscheidungen nach der Authentifizierung                 | Grenzwerte, Timeouts und das serverweite Budget für Kartengespräche |

Kartenschlüssel und Sitzungsschlüssel verlassen die API nie. Das Plugin sieht nur die APDUs, die Attraccess sendet, und
die Antworten der Karte; beide sind durch das Secure Messaging der Karte geschützt. Das Ergebnis enthält `id`, `uid` und
`userId` der Karte, sonst nichts.

## Berechtigung

Deklarieren Sie `CARD_AUTHENTICATION` im Manifest. Administratoren sehen sie bei der Installation mit dieser
Beschreibung: _„Authenticate NFC cards held to the plugin's own devices with the Attraccess card keys. The plugin
receives the card and its owner, never the keys."_

```json
{
  "permissions": ["CARD_AUTHENTICATION", "ACCESS_RESOURCES"]
}
```

Ohne die Berechtigung wirft das Lesen von `context.cards` einen `PluginPermissionError`. `context.cards` ist im Typ
optional, weil ältere Hosts es nicht anbieten; ein solcher Host wirft einen Fehler „unavailable in this host".

## Verwendung

```ts
import type { PluginCardChannel, PluginContext } from '@attraccess/plugins-backend-sdk';

async function onCardPresented(
  context: PluginContext,
  deviceId: string,
  uid: string,
  channel: PluginCardChannel,
  resourceId: number,
) {
  const cardLeft = new AbortController(); // abbrechen, wenn das Gerät meldet, dass die Karte das Feld verlassen hat
  const result = await context.cards.authenticate({ uid, device: deviceId, channel, signal: cardLeft.signal });
  if (!result.ok) return deny(result.reason);

  // Die Authentifizierung sagt nur, wem die Karte gehört. Ob diese Person etwas darf, entscheidet Ihr Plugin.
  const access = await context.resourceAccess.canStart(result.card.userId, resourceId);
  return access.allowed ? grant(result.card.userId) : deny('NO_ACCESS');
}
```

### Der Kartenkanal

```ts
interface PluginCardChannel {
  exchange(apdu: Uint8Array, options: { signal: AbortSignal }): Promise<Uint8Array>;
}
```

- Leiten Sie eine vollständige APDU an die Karte weiter und lösen Sie mit der **vollständigen** Antwort der Karte auf,
  einschließlich Statusbytes.
- Attraccess sendet immer nur eine APDU und wartet auf ihre Antwort, bevor es die nächste sendet.
- `options.signal` wird abgebrochen, wenn Attraccess nicht mehr auf die Antwort wartet (Timeout eines Austauschs,
  Timeout des Gesprächs, Abbruch, Entladen des Plugins). Hören Sie dann auf weiterzuleiten. Eine spätere Antwort wird
  ignoriert.
- Lehnen Sie ab (reject), wenn Ihr Gerät einen Fehler hat. Eine Antwort, die kein `Uint8Array` ist oder länger als
  64 Bytes, beendet das Gespräch mit `DEVICE_ERROR`.
- Protokollieren Sie APDUs und Antworten nie: Sie enthalten Kryptogramme.

### Anfrage

| Feld      | Bedeutung                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uid`     | Die UID der Karte, wie Ihr Gerät sie meldet, hexadezimal, 4 bis 32 Zeichen. Alles andere ergibt `INVALID_UID`.                                                                          |
| `device`  | Ihre eigene Kennung des Geräts, an dem die Karte liegt (1 bis 200 Zeichen), zum Beispiel eine BLE-Endpunkt-ID.                                                                          |
| `channel` | Der Kartenkanal von oben.                                                                                                                                                               |
| `signal`  | Optional. Brechen Sie es ab, wenn die Karte das Feld verlassen hat oder Sie aufgeben; das Gespräch endet mit `CARD_REMOVED`. Ein bereits abgebrochenes Signal beendet es vor dem Start. |

`authenticate` löst für jedes Karten- oder Gesprächsergebnis auf. Es lehnt nur bei Programmierfehlern ab: fehlende
Berechtigung, fehlendes `channel.exchange` oder ungültiges `device`.

### Ein Gespräch pro Gerät

Attraccess führt ein Gespräch pro Plugin und `device`. Ein neues `authenticate` für dasselbe Gerät beendet das laufende
mit `CARD_REMOVED` und bricht das `signal` seines offenen Austauschs ab, so wie eine neue Karte an einem Attractap-Reader
die vorige ersetzt. Gespräche an verschiedenen Geräten laufen nebeneinander.

## Grenzwerte

Die Grenzwerte sind dieselben wie für Attractap-Reader (`PLUGIN_CARD_LIMITS` im SDK):

| Grenzwert                           | Wert     |
| ----------------------------------- | -------- |
| Zeit pro Austausch                  | 3 s      |
| Zeit pro Gespräch                   | 15 s     |
| Austausche pro Gespräch             | 32       |
| Längste Antwort (mit Status)        | 64 Bytes |
| Längste APDU, die Attraccess sendet | 62 Bytes |

Plugin-Gespräche zählen zum selben serverweiten Limit wie Reader-Gespräche. Ist es erreicht, löst `authenticate` mit
`BUSY` auf.

## Fehlergründe

`result.reason` ist einer dieser stabilen Werte (`PluginCardFailureReason`). Sie werden nie umbenannt oder entfernt.

| Grund                        | Bedeutung                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `BUSY`                       | Der Server ist am Limit gleichzeitiger Kartengespräche. Später erneut versuchen.                                        |
| `CARD_REMOVED`               | Ihr `signal` wurde abgebrochen, oder ein neueres `authenticate` für dasselbe Gerät hat übernommen.                      |
| `TIMEOUT`                    | Ein Austausch dauerte länger als 3 s oder das Gespräch länger als 15 s.                                                 |
| `TOO_MANY_EXCHANGES`         | Das Gespräch brauchte mehr als 32 Austausche.                                                                           |
| `DEVICE_ERROR`               | `exchange` hat abgelehnt oder geworfen, oder mit etwas geantwortet, das kein `Uint8Array` oder länger als 64 Bytes ist. |
| `CANCELLED`                  | Die API fährt herunter, oder Ihr Plugin wird deaktiviert, deinstalliert oder neu gestartet.                             |
| `INVALID_UID`                | Die UID besteht nicht aus 4 bis 32 Hex-Zeichen.                                                                         |
| `CARD_NOT_FOUND`             | Für diese UID ist keine Karte angelernt.                                                                                |
| `CARD_NOT_ACTIVE`            | Die Karte ist angelernt, aber nicht die aktive Karte des Benutzers.                                                     |
| `CARD_NOT_SUPPORTED`         | Der Kartentyp wird nicht unterstützt (zum Beispiel eine DESFire EV1).                                                   |
| `CARD_AUTHENTICATION_FAILED` | Die Karte hat den gespeicherten Schlüssel nicht nachgewiesen: kopierte UID, fremde Karte oder manipulierte Antwort.     |

Anders als bei Attractap-Readern werden `TIMEOUT` und `TOO_MANY_EXCHANGES` getrennt gemeldet.

## Unterbrochenes Anlernen und Zurücksetzen

Wurde das Anlernen oder Zurücksetzen an einem Attractap unterbrochen, nachdem der Schlüssel geschrieben war, schließt die
nächste Vorlage der Karte es ab, an einem Reader oder an Ihrem Gerät. Audit-Einträge, die dabei entstehen, tragen die
Quelle `plugin-recovery` und die ID Ihres Plugins (`details.pluginId`) statt einer Reader-ID.

Karten über ein Plugin-Gerät anzulernen oder zurückzusetzen ist nicht möglich: Plugins können nur authentifizieren.

## Beispiel: ein Kartenkanal über Bluetooth

Dieses Beispiel leitet APDUs über [`context.ble`](plugins/ble-transport.md) an ein Gerät weiter, an dem die Karte liegt.
Das Framing ist für das Beispiel erfunden: Das Plugin schreibt `[seq, ...apdu]` in eine Characteristic, und das Gerät
antwortet mit einer Notification `[seq, ...antwort]` auf einer anderen. Ihr Gerät legt sein eigenes Framing fest.
Deklarieren Sie `BLE_TRANSPORT` und `CARD_AUTHENTICATION`.

```ts
import type { PluginBleSession, PluginCardChannel, PluginContext } from '@attraccess/plugins-backend-sdk';

context.ble.registerProfile({
  id: 'nfc-terminal',
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 63 },
        { key: 'answer', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 65 },
      ],
    },
  ],
});

async function bleCardChannel(session: PluginBleSession): Promise<PluginCardChannel> {
  const answers = await session.subscribe('answer');
  let seq = 0;
  return {
    async exchange(apdu, { signal }) {
      seq = (seq + 1) & 0xff;
      await session.write('command', Uint8Array.of(seq, ...apdu), { signal });
      for (;;) {
        const { value } = await answers.next({ signal });
        if (value[0] === seq) return value.subarray(1); // veraltete Antworten abgebrochener Austausche überspringen
      }
    },
  };
}

function cardPresented(context: PluginContext, endpointId: string, uid: string) {
  return context.ble.withSession(endpointId, async (session) =>
    context.cards.authenticate({ uid, device: endpointId, channel: await bleCardChannel(session) }),
  );
}
```

BLE-Fehler, mit denen Ihr `exchange` ablehnt (zum Beispiel `TIMEOUT` oder `DISCONNECTED`), beenden das Gespräch mit
`DEVICE_ERROR`.

## Testen

Die Tests der API prüfen die Kartenauthentifizierung für Plugins gegen emulierte DESFire-EV2/EV3- und NTAG-424-Karten,
einschließlich des BLE-Beispiels oben auf dem BLE-Fake des SDK (`createFakeBleHost`, siehe
[Testen mit dem Fake](plugins/ble-transport.md)). Ersetzen Sie in den Tests Ihres Plugins `context.cards.authenticate`
durch einen Stub und testen Sie Ihren Kanal gegen ein Fake-Gerät: Prüfen Sie, dass er jede Antwort vollständig mit
Statusbytes zurückgibt und aufhört, wenn `signal` abgebrochen wird.
