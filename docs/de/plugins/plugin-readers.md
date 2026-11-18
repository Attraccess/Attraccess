# Plugin-Reader

<!-- llms-description: Wie Backend-Plugins mit READER_DEVICES eigene Kartenleser registrieren, ihnen eine Tür mit reinem Zutritt zuweisen und sie per Karte öffnen. -->

Ein Backend-Plugin, das einen Kartenleser besitzt (zum Beispiel einen NFC-Leser in einer Türeinheit), kann ihn bei
Attraccess als **Plugin-Reader** registrieren. Ein Plugin-Reader verhält sich wie ein Attractap-Reader ohne Display: Ihm
wird eine Ressource zugewiesen, und eine daran gehaltene Karte führt die eine Aktion aus, die der Reader auf dieser
Ressource ausführen darf. Attraccess führt diese Aktion mit denselben Prüfungen wie an einem Attractap-Reader aus,
trägt sie für den Karteninhaber in den Verlauf der Ressource ein, startet die Flows der Ressource und schreibt einen
Audit-Eintrag.

Derzeit bedient ein Plugin-Reader **Türen mit reinem Zutritt**, und seine einzige Aktion ist **Öffnen**. Öffnen wird wie
das Entriegeln der Tür gespeichert und gemeldet (`DoorUnlock`) und startet die Flows des Auslösers „Tür entriegelt“.

## Berechtigung

Deklarieren Sie `READER_DEVICES` zusammen mit `CARD_AUTHENTICATION` (siehe
[Kartenauthentifizierung für Plugins](plugins/card-authentication.md)): Das Plugin authentifiziert zuerst die Karte und
übergibt den Nachweis dieser Authentifizierung an den Reader. Das SDK beschreibt die Berechtigung so: _„Register the
plugin's own card readers. An administrator assigns each one a resource; a card authenticated on a reader runs its
action on that resource for the card owner, with the same checks as an Attractap reader.“_

```json
{
  "permissions": ["CARD_AUTHENTICATION", "READER_DEVICES"]
}
```

Ohne die Berechtigung wirft das Lesen von `context.readers` einen `PluginPermissionError`. `context.readers` ist im Typ
optional, weil ältere Hosts es nicht anbieten.

## Reader

```ts
const readers = context.readers;

await readers.register({
  deviceId: 'unit-1a2b', // Ihre eigene Id des Geräts; dieselbe wie `device` in cards.authenticate
  name: 'Werkstatt Seiteneingang',
  capabilities: { resourceTypes: ['door'], actions: ['open'] },
});

await readers.assignResource('unit-1a2b', resourceId); // zum Beispiel aus Ihrer Verwaltungsseite
```

| Aufruf                                       | Bedeutung                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `register(input)`                            | Legt den Reader an oder aktualisiert Name und Fähigkeiten des Readers mit dieser Geräte-Id.                   |
| `update(deviceId, { name?, capabilities? })` | Ändert einen Reader. Fähigkeiten, die die zugewiesene Ressource nicht mehr erlauben, heben die Zuweisung auf. |
| `remove(deviceId)`                           | Entfernt den Reader und seine Zuweisung. Idempotent.                                                          |
| `get(deviceId)` / `list()`                   | Nur die Reader Ihres Plugins; `get` liefert `null` für eine unbekannte Geräte-Id.                             |
| `assignResource(deviceId, resourceId)`       | Weist dem Reader seine Ressource zu und ersetzt eine vorherige.                                               |
| `unassignResource(deviceId)`                 | Hebt die Zuweisung auf. Idempotent.                                                                           |

Einem Reader kann nur eine Ressource zugewiesen werden, die seine Fähigkeiten erlauben: für `open` eine Tür mit der
Option **Nur Zutritt**. Alles andere wird mit `RESOURCE_NOT_ALLOWED` abgelehnt. Wird die Ressource gelöscht, bleibt der
Reader ohne Ressource bestehen.

Die Verwaltungsaufrufe werden mit einem `PluginReaderError` mit einem dieser stabilen Codes abgelehnt:

| Code                   | Bedeutung                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`     | Eine Geräte-Id, ein Name, Fähigkeiten oder eine Ressourcen-Id, die die Prüfung nicht bestehen. |
| `READER_NOT_FOUND`     | Ihr Plugin hat keinen Reader mit dieser Geräte-Id.                                             |
| `LIMIT_REACHED`        | Ihr Plugin hat bereits 200 Reader.                                                             |
| `RESOURCE_NOT_FOUND`   | Es gibt keine Ressource mit dieser Id.                                                         |
| `RESOURCE_NOT_ALLOWED` | Die Fähigkeiten des Readers erlauben weder den Ressourcentyp noch eine ihrer Aktionen.         |

Ein Fehler im Host (zum Beispiel eine nicht erreichbare Datenbank) wird mit einem allgemeinen `Error` ohne Details
abgelehnt; versuchen Sie es später erneut.

## Erst authentifizieren, dann tappen

Eine an Ihr Gerät gehaltene Karte wird in zwei Schritten verarbeitet:

1. `context.cards.authenticate({ uid, device: deviceId, channel })` prüft die Karte über Ihren Kartenkanal. Für ein
   Plugin mit `READER_DEVICES` enthält ein erfolgreiches Ergebnis `card.authentication`: einen undurchsichtigen,
   einmal verwendbaren Nachweis dieser Authentifizierung an diesem Gerät, 30 Sekunden gültig.
2. `context.readers.tap({ deviceId, authentication })` führt die Aktion des Readers auf seiner Ressource für den
   Karteninhaber aus.

```ts
const result = await context.cards.authenticate({ uid, device: deviceId, channel });
if (!result.ok) return showDenied(result.reason);

if (context.readers && result.card.authentication) {
  const tap = await context.readers.tap({ deviceId, authentication: result.card.authentication });
  return tap.ok ? openTheDoor() : showDenied(tap.reason);
}
```

Die Prüfung `if (context.readers && result.card.authentication)` ist die Funktionserkennung: Hosts, die älter als
Plugin-Reader sind, bieten beides nicht an. Das Plugin handelt nie mit einer bloßen Benutzer-Id: Nur eine Karte, die am
selben Gerät vom selben Plugin authentifiziert wurde, kann getappt werden.

Öffnen Sie die Tür nur, wenn `tap` mit `ok: true` aufgelöst wurde. Das Ergebnis nennt Aktion, Ressource und
Karteninhaber:

```ts
{ ok: true, action: 'open', resourceId: 12, userId: 34 }
```

`tap` wird für jedes Ergebnis aufgelöst. Abgelehnt wird es nur bei einer fehlerhaften Anfrage Ihres Plugins
(`TypeError`: keine Geräte-Id, keine Authentifizierung) oder bei einem Fehler im Host (ein allgemeiner `Error`;
versuchen Sie es später mit einer neuen Authentifizierung).

### Ablehnungsgründe

`tap.reason` ist einer dieser stabilen Werte (`PluginReaderTapFailureReason`). Sie werden nie umbenannt oder entfernt.

| Grund                    | Bedeutung                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHENTICATION_INVALID` | Die Authentifizierung ist unbekannt, bereits verwendet oder stammt von einem anderen Gerät oder Plugin.                                                                         |
| `AUTHENTICATION_EXPIRED` | Die Authentifizierung ist älter als 30 Sekunden. Authentifizieren Sie die Karte erneut.                                                                                         |
| `BUSY`                   | Ein anderer Tap an diesem Reader läuft noch. Versuchen Sie es mit einer neuen Authentifizierung erneut.                                                                         |
| `READER_NOT_FOUND`       | Ihr Plugin hat keinen Reader mit dieser Geräte-Id.                                                                                                                              |
| `NO_RESOURCE`            | Dem Reader ist keine Ressource zugewiesen.                                                                                                                                      |
| `ACTION_NOT_ALLOWED`     | Keine Aktion des Readers ist auf seiner Ressource erlaubt, zum Beispiel ist die Tür nicht mehr „Nur Zutritt“.                                                                   |
| `ACCESS_DENIED`          | Der Karteninhaber darf die Ressource nicht nutzen: keine Berechtigung, keine Einweisung, das Konto ist deaktiviert oder die Karte wurde seit der Authentifizierung deaktiviert. |
| `MAINTENANCE`            | Die Ressource ist in Wartung oder als fehlerhaft gemeldet, und der Karteninhaber darf keine Wartung verwalten.                                                                  |
| `FLOW_FAILED`            | Die Aktion wurde gespeichert, aber ein daran hängender Flow ist fehlgeschlagen. Nicht wiederholen: Das speichert sie erneut.                                                    |

Jeder Tap verbraucht seine Authentifizierung, auch ein abgelehnter. Jeder Tap an einem Reader mit bekannter Geräte-Id
wird ins Audit-Log geschrieben („Karte an einen Plugin-Reader gehalten“), mit Plugin-Id, Geräte-Id, Ressource, Karte,
Inhaber und Ergebnis oder Grund. Die Authentifizierung selbst wird nie protokolliert.

## Grenzwerte

`PLUGIN_READER_LIMITS` im SDK:

| Grenzwert                          | Wert                                   |
| ---------------------------------- | -------------------------------------- |
| Reader pro Plugin                  | 200                                    |
| Geräte-Id                          | 1 bis 200 Zeichen, keine Steuerzeichen |
| Name                               | 1 bis 100 Zeichen, keine Steuerzeichen |
| Ressourcen pro Reader              | 1                                      |
| Gültigkeit einer Authentifizierung | 30 s                                   |

Authentifizierungen liegen nur im Arbeitsspeicher: Ein Neustart der API oder das Deaktivieren des Plugins macht sie
ungültig.

## Lebenszyklus

- Beim Deaktivieren eines Plugins bleiben seine Reader und ihre Zuweisungen erhalten; nach dem Aktivieren funktionieren
  sie wieder.
- Beim Deinstallieren eines Plugins werden seine Reader gelöscht.
- Wird die Option „Nur Zutritt“ einer zugewiesenen Tür ausgeschaltet, bleibt der Reader zugewiesen: Seine Taps werden
  mit `ACTION_NOT_ALLOWED` abgelehnt, bis die Option wieder eingeschaltet ist.
