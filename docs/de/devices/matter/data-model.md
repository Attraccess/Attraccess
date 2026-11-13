# Matter: Datenmodell und Lebenszyklus

<!-- llms-description: Matter-Gerätedatenmodell: Begriffe, Nodes, Endpoints, Lebenszyklus, Zustandssemantik, Abgleich, Admin-Aktionen und Datenaufbewahrung. -->

> **Das Deinstallieren des Matter-Plugins löscht alle Matter-Daten in Attraccess.** Beim Deinstallieren führt der Host alle Down-Migrationen des Plugins aus. Dabei werden alle Tabellen `plugin_matter_*` gelöscht: die Geräteeinträge, Ihre Namen, Beschreibungen und Standorte sowie die Verbindungseinstellungen. Die Matter-Fabric im Sidecar bleibt **unberührt**. Nach einer Neuinstallation erscheinen die bereits in Betrieb genommenen Nodes daher als **Nicht übernommen** und müssen erneut übernommen werden. Flow-Nodes, die auf die alten Einträge verwiesen, verlieren ihre Verweise. Das ist die einzige Ausnahme von „Matter-Daten werden nie stillschweigend gelöscht“. Beim Deaktivieren und Aktualisieren des Plugins bleiben alle Daten erhalten (siehe [Deaktivieren, Aktualisieren und Deinstallieren](#deaktivieren-aktualisieren-und-deinstallieren)).

Diese Seite beschreibt, wie Attraccess Matter-Geräte speichert, was der gespeicherte Zustand bedeutet und welche Administrator-Aktionen es gibt. Sie baut auf der [Architektur](devices/matter/architecture.md) auf. Es gibt noch keine Geräte-Oberfläche: Die Daten stehen Administratoren (Berechtigung `system.plugins.manage`) über die [unten](#rest-endpunkte) aufgeführten REST-Endpunkte zur Verfügung. Spätere Funktionen (Geräteseiten, Flow-Nodes, Befehle) bauen darauf auf.

## Begriffe

| Deutsch                  | English               | Bedeutung                                                                                                                     |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Node                     | Node                  | Ein in Betrieb genommenes Matter-Gerät, wie Attraccess es kennt. Bestimmt durch Fabric und Node-ID.                           |
| Endpoint                 | Endpoint              | Ein einzeln ansprechbarer Teil eines Nodes, etwa eine Steckdose einer Steckdosenleiste. Bestimmt durch Node und Endpoint-ID.  |
| Überbrücktes Gerät       | Bridged device        | Ein Gerät hinter einer Matter-Bridge. Es erscheint als Endpoint der Bridge und hat eine eigene eindeutige ID.                 |
| Cluster                  | Cluster               | Eine Gruppe von Attributen und Befehlen, die ein Endpoint unterstützt, etwa On/Off.                                           |
| Fähigkeitsprofil         | Capability profile    | Was ein Endpoint kann (etwa `onOff`), aus seinen Clustern abgeleitet, plus ein primäres Profil wie `on_off_actuator`.         |
| Angeforderter Zustand    | Requested State       | Der Wert, den Attraccess vom Gerät verlangt hat. Eine Anforderung, keine Tatsache.                                            |
| Angenommener Befehl      | Accepted Command      | Der Sidecar hat den Befehl angenommen. Das heißt **nicht**, dass das Gerät ihn ausgeführt hat.                                |
| Gemeldeter Zustand       | Reported State        | Der zuletzt vom Gerät gemeldete Wert mit dem Zeitpunkt der Beobachtung.                                                       |
| Veraltet                 | Stale                 | Die letzte Meldung ist älter als die Zeit, in der sie erneuert werden sollte. Wird als Frische `stale` angezeigt.             |
| Externe Zustandsänderung | External State Change | Das Gerät meldete einen anderen Wert, obwohl kein Befehl unterwegs war: Jemand hat das Gerät direkt bedient.                  |
| Störung                  | Fault                 | Gerät oder Sidecar meldeten eine Störung für einen Wert. Die Qualität des Werts ist `fault`, bis eine gute Meldung eintrifft. |
| Unsichere Ausführung     | Uncertain Actuation   | Ein physischer Befehl lief in eine Zeitüberschreitung. Ob er wirkte, ist unbekannt. Er wird nie automatisch wiederholt.       |
| Nicht übernommen         | Unclaimed             | Der Sidecar listet den Node, aber kein Administrator hat ihn übernommen. In Quarantäne: Nichts kann ihn verwenden.            |
| Übernommen               | Claimed               | Ein Administrator hat den Node übernommen.                                                                                    |
| Getrennt                 | Detached              | Der Eintrag existiert in Attraccess, aber der Sidecar listet ihn in der erwarteten Fabric nicht (mehr). Nichts wird gelöscht. |
| Archiviert               | Archived              | Von einem Administrator beiseitegelegt. Der Abgleich fasst ihn nicht an.                                                      |
| Entfernt                 | Removed               | Stillgelegt. Die Zeile bleibt als Historie. Dieselbe Identität kann später als neuer Eintrag wieder auftauchen.               |

## Wer wofür maßgeblich ist

- Der **Sidecar** ist maßgeblich für die Fabric: welche Nodes und Endpoints es gibt und ihre Protokoll-Identität (Hersteller, Produkt, Seriennummer, Softwareversion, Attestierung, Cluster).
- **Attraccess** ist maßgeblich für Namen, Beschreibungen, Standorte, Lebenszyklus-Entscheidungen, das Audit-Log und die stabilen IDs.

Der Abgleich schreibt nie in den Sidecar und überschreibt nie einen Namen, eine Beschreibung oder einen Standort. Eine Änderung durch einen Administrator verändert nie die Protokoll-Identität.

## Stabile Verweise

Jeder Node und jeder Endpoint hat eine von Attraccess erzeugte UUID. Flow-Nodes verweisen auf diese UUIDs, nie auf rohe Matter-IDs, sodass ein Verweis ein [Neu verknüpfen (relink)](#aktionen) übersteht. Im Audit-Log zeigt der Gegenstand eines Eintrags eine aus der UUID abgeleitete Zahl; die vollständige UUID steht in den Details des Eintrags (`nodeRef`, `endpointRef`, `fabricRef`, siehe [Audit](#audit)). Die 64-Bit-IDs von Matter werden als Dezimalzeichenketten gespeichert. Eine Node-ID ist nur **innerhalb einer Fabric** eindeutig, deshalb wird ein Node immer durch die Fabric **und** die Node-ID bestimmt; dieselbe Node-ID in einer anderen Fabric ist ein anderer Node.

Das Datenmodell hat keine Spalte, die einen Matter-Eintrag mit einer Attraccess-Ressource verknüpft. Solche Verknüpfungen gibt es nur in der Konfiguration von Flow-Nodes.

## Lebenszyklus

| Zustand     | Bedeutung                                           | Verlassen durch                                                                                                                                   |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unclaimed` | Vom Sidecar gelistet, nicht übernommen (Quarantäne) | Übernehmen, Archivieren, Zwangsentfernen, Neu verknüpfen als Quelle (zu `removed`, merged), oder Abgleich, wenn der Sidecar ihn nicht mehr listet |
| `claimed`   | Von einem Administrator übernommen                  | Zwangsentfernen, oder Abgleich, wenn der Sidecar ihn nicht mehr listet                                                                            |
| `detached`  | Attraccess bekannt, vom Sidecar nicht gelistet      | Abgleich (nicht bei `fabric_mismatch`) oder Reparatur, wenn wieder gelistet, Neu verknüpfen, Archivieren, Zwangsentfernen                         |
| `archived`  | Beiseitegelegt; der Abgleich ändert ihn nie         | Wiederherstellen (zu `detached`), Zwangsentfernen                                                                                                 |
| `removed`   | Stillgelegt; die Zeile bleibt als Historie          | Nichts                                                                                                                                            |

Ein getrennter Node merkt sich den Grund: `absent_from_sidecar` (der Sidecar listet ihn nicht mehr), `fabric_absent` (der Sidecar hat keine Fabric) oder `fabric_mismatch` (der Sidecar betreibt eine andere Fabric, siehe [unten](#wiederhergestellte-datenbanken-und-ersetzte-sidecars)). Ein mit `fabric_mismatch` getrennter Node bleibt **Getrennt** (`detached`), auch wenn seine ursprüngliche Fabric zurückkehrt; nur Reparieren oder Neu verknüpfen holt ihn zurück.

```text
 Sidecar listet neuen Node ─► unclaimed ──übernehmen──► claimed
                               │     ▲                   │   ▲
           nicht mehr gelistet │     │ wieder verbinden  │   │ wieder verbinden
                               ▼     │                   ▼   │
                            ┌──────────────────────────────────────┐
                            │               detached               │
                            └──────────────────────────────────────┘

 wieder verbinden   wieder gelistet (Abgleich, nicht bei fabric_mismatch) oder Reparieren:
                    zurück zu claimed, wenn der Node je übernommen war, sonst unclaimed
 neu verknüpfen     detached ─► claimed oder unclaimed, wie beim Wiederverbinden
                    (gleiche UUID, neue Identität); der nicht übernommene Quell-Node ─► removed (merged)
 archivieren        detached oder unclaimed ─► archived
 wiederherstellen   archived ─► detached
 zwangsentfernen    jeder Zustand außer removed ─► removed
```

Der Abgleich übernimmt nie von selbst einen Node, löscht nie einen Eintrag und fügt nie stillschweigend einen hinzu.

## Abgleich

Der Abgleich vergleicht die Node-Liste des Sidecars mit den Einträgen in Attraccess. Er läuft, wenn die Verbindung `connected` erreicht, wenn der Event-Stream ihn anfordert, nach einer erfolgreichen Inbetriebnahme und auf Anforderung (`POST /matter/reconciliation`). Läufe überlappen nie: Auslöser, die während eines Laufs eintreffen, werden zu einem Folgelauf zusammengefasst. Es gibt keinen Timer.

Er ändert **nur dann** etwas, wenn der Sidecar `inventory.list` mit `authoritative: true` beantwortet. In jedem anderen Fall bleibt alles unverändert und das Ergebnis wird festgehalten:

| `lastResult`                | Wann                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `applied`                   | Ein maßgebliches Inventar wurde angewendet                                                          |
| `skipped_unavailable`       | Der Sidecar ist nicht verbunden, eingeschränkt oder unterstützt das Inventar noch nicht (wie heute) |
| `skipped_non_authoritative` | Der Sidecar antwortete mit `authoritative: false` (eine unvollständige Sicht)                       |
| `failed`                    | Eine Zeitüberschreitung oder ein anderer Fehler                                                     |

Bei einem maßgeblichen Inventar:

1. Ein Node, den der Sidecar listet und den Attraccess nicht kennt, wird **Nicht übernommen** (`unclaimed`) (Audit `matter.node_quarantined`).
2. Ein übernommener oder nicht übernommener Eintrag, den der Sidecar nicht listet, wird **Getrennt** (`detached`) (`matter.node_detached`).
3. Ein getrennter Eintrag, dessen exakte Identität (Fabric und Node-ID) wieder gelistet wird, wird **wieder verbunden**: zurück zu **Übernommen** (`claimed`), wenn er je übernommen war, sonst zu **Nicht übernommen** (`unclaimed`) (`matter.node_reattached`). Ausnahme ist ein mit `fabric_mismatch` getrennter Eintrag: Er bleibt getrennt, und nur die Zusammenfassung des Laufs vermerkt ihn.
4. Ein archivierter Eintrag wird nie verändert. Taucht er wieder auf, vermerkt nur die Zusammenfassung des Laufs das.
5. Endpoints, Cluster und Fähigkeiten werden aktualisiert. Verschwundene werden als entfernt markiert, nie gelöscht. Ändert sich die eindeutige ID eines überbrückten Endpoints, wird der Eintrag stillgelegt (Grund `replaced`) und ein neuer angelegt, sodass ein Flow-Verweis nie stillschweigend auf andere Hardware zeigt.

`lastSeenAt` von Nodes und Endpoints ist der Beobachtungszeitpunkt des Sidecars, nicht der Zeitpunkt des Laufs. Ein erneuter Lauf gegen dieselbe Antwort ändert daher nichts und schreibt keine Audit-Einträge.

### Wiederhergestellte Datenbanken und ersetzte Sidecars

Wird die Attraccess-Datenbank aus einem anderen Zeitpunkt wiederhergestellt oder der Sidecar-Speicher zurückgesetzt oder ersetzt, meldet der Sidecar eine Fabric, die von der bekannten abweicht. Dann gilt:

- Die alte Fabric wird `absent`; ihre übernommenen und nicht übernommenen Nodes werden **Getrennt** (`detached`) mit `fabric_mismatch`. Sie bleiben getrennt, auch wenn die alte Fabric später zurückkehrt; nur Reparieren oder Neu verknüpfen holt sie zurück.
- Die Nodes der neuen Fabric werden **Nicht übernommen** (`unclaimed`). Sie werden **nie automatisch zugeordnet**, auch nicht bei gleichen Node-IDs oder Seriennummern, weil das einen Flow an das falsche physische Gerät binden könnte. Zuordnen geht nur ausdrücklich per [Neu verknüpfen (relink)](#aktionen).
- Das Audit-Log erhält `matter.fabric_mismatch_detected`.

Hat der Sidecar gar keine Fabric, werden die übernommenen und nicht übernommenen Nodes mit `fabric_absent` getrennt. Was danach passiert, hängt von der Fabric ab, die der Sidecar später meldet:

- Dieselbe Fabric: Die mit `fabric_absent` getrennten Nodes werden wie oben anhand ihrer exakten Identität wieder verbunden.
- Eine **andere** Fabric (ein geleerter Sidecar startet zuerst ohne Fabric und erst dann mit einer neuen): Das ist dieselbe Abweichung wie nach einer Wiederherstellung. Die mit `fabric_absent` getrennten Nodes erhalten `fabric_mismatch`, und das Audit-Log erhält `matter.fabric_mismatch_detected`.

Ist die Attraccess-Datenbank **älter** als der Sidecar, werden die ihr unbekannten Nodes als **Nicht übernommen** (`unclaimed`) in Quarantäne genommen. Ist sie **neuer**, werden die Nodes getrennt, die der Sidecar nicht mehr listet.

## Aktionen

Alle Aktionen brauchen `system.plugins.manage`, validieren ihre Eingabe, werden im Audit-Log festgehalten und antworten mit `409` bei einem nicht erlaubten Übergang und mit `404` bei einer unbekannten ID.

| Aktion                         | Von                                     | Wirkung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Übernehmen (claim)             | `unclaimed`                             | Übernimmt den Node, optional mit Namen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Neu verknüpfen (relink)        | `detached` (Ziel), `unclaimed` (Quelle) | Verschiebt Protokoll-Identität, Endpoints, Cluster und Zustand der Quelle auf den getrennten Eintrag. Dessen UUID, Namen und Flow-Verweise bleiben. Der Eintrag kehrt in den Zustand zurück, den er vor dem Trennen hatte: **Übernommen** (`claimed`), wenn er je übernommen war, sonst **Nicht übernommen** (`unclaimed`). Neu verknüpfen übernimmt den Node nicht implizit. Die Quelle wird `removed` (merged). Weichen Hersteller, Produkt oder Seriennummer ab, antwortet der Aufruf mit `409`, außer `confirmIdentityMismatch: true` wird gesendet. |
| Reparieren (repair)            | `unclaimed`, `claimed`, `detached`      | Liest einen Node erneut vom Sidecar und aktualisiert Identität, Endpoints und Fähigkeiten. Verbindet einen getrennten Node wieder, den der Sidecar mit gleicher Identität meldet. Antwortet mit `409` („Run a reconciliation first“), wenn die Fabric des Nodes nicht die aktive ist, damit nie zwei Fabrics gleichzeitig aktiv sind; mit `409`, wenn der Sidecar eine andere oder gar keine Fabric betreibt oder den Node nicht meldet; mit `503`, wenn der Sidecar nicht antworten kann. In all diesen Fällen ändert sich nichts.                      |
| Archivieren (archive)          | `detached`, `unclaimed`                 | Legt den Node beiseite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Wiederherstellen (restore)     | `archived`                              | Zurück zu `detached`, mit dem Grund, aus dem er getrennt wurde (bei einem Node, der archiviert wurde, als er nicht übernommen war: `absent_from_sidecar`, oder `fabric_mismatch`, wenn seine Fabric nicht mehr die aktive ist). Ein durch eine Fabric-Abweichung getrennter Node bleibt `fabric_mismatch` und wird daher nicht von selbst wieder verbunden. Jeden anderen verbindet der nächste Abgleich wieder, wenn der Sidecar ihn listet.                                                                                                            |
| Zwangsentfernen (force-remove) | jeder Zustand außer `removed`           | Legt den Eintrag und seine Endpoints still. Die Historie bleibt. **Nur Attraccess:** Der Sidecar wird nicht berührt. Listet er den Node weiter, nimmt der nächste Abgleich ihn erneut als **neuen** nicht übernommenen Eintrag in Quarantäne. Braucht `confirm: true`.                                                                                                                                                                                                                                                                                   |
| Bearbeiten (PATCH)             | jeder Zustand außer `removed`           | Ändert Name, Beschreibung oder Standort (und sonst nichts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Die Anfrage zum Neu verknüpfen geht an das getrennte Ziel (`POST /matter/nodes/:id/relink`), mit diesem Body:

```json
{ "sourceNodeId": "<die id (UUID) des Quell-Eintrags, nicht seine Matter-nodeId>", "confirmIdentityMismatch": true }
```

`confirmIdentityMismatch` ist optional. Endpoints werden anhand der Endpoint-ID (und, wenn bekannt, der eindeutigen ID des überbrückten Geräts) zugeordnet; die Zustandszeilen eines zugeordneten Endpoints werden durch den aktuellen Zustand der Quelle ersetzt.

Der heutige Sidecar kann einzelne Nodes noch nicht lesen, Reparieren antwortet daher mit `503` (`unsupported_capability`).

## Zustand

Jeder Endpoint hat pro Zustandsschlüssel wie `onOff.onOff` eine Zeile, die an Ort und Stelle aktualisiert wird. Häufige Meldungen aktualisieren nur diese Zeile. Sie erzeugen keine Historie und keine Audit-Einträge.

`GET /matter/endpoints/:id/state` liefert `{ endpointRef, states: [...] }`, einen Eintrag pro Zustandsschlüssel mit diesen Feldern:

| Feld                 | Bedeutung                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stateKey`           | `<capability>.<attribute>`, zum Beispiel `onOff.onOff`                                                                                                                                                                                                        |
| `reported`           | Der letzte Wert, wann er beobachtet und empfangen wurde, woher er kam (`subscription_report`, `read`, `command_response`) und seine Qualität                                                                                                                  |
| `freshness`          | `fresh`, `stale` oder `unknown` (nie gemeldet), beim Lesen aus `observedAt` und `staleAfterMs` berechnet                                                                                                                                                      |
| `staleAfterMs`       | Millisekunden nach `observedAt`, ab denen der Wert als veraltet gilt: standardmäßig 600000 (10 Minuten) oder das Doppelte des maximalen Subscription-Intervalls, wenn bekannt                                                                                 |
| `requested`          | Der angeforderte Wert, wann, von wem, mit Request-ID und Korrelations-ID                                                                                                                                                                                      |
| `command`            | `none`, `requested`, `accepted`, `reported`, `uncertain` oder `failed`, mit den Zeiten für angenommen und gemeldet                                                                                                                                            |
| `confirmed`          | `true` nur, wenn **nach** der Anforderung eine Meldung mit dem angeforderten Wert eintraf, diese Meldung den Befehl abgeschlossen hat (Befehl `reported`; ein fehlgeschlagener Befehl ist nie bestätigt) und seitdem keine externe Zustandsänderung stattfand |
| `externalChange`     | Eine Meldung, die vom letzten Wert abweicht, während kein Befehl unterwegs war (`requested` oder `accepted`), auch nachdem ein Befehl abgeschlossen ist                                                                                                       |
| `fault`              | Störungscode, Meldung und Zeit; wird von der nächsten guten Meldung gelöscht                                                                                                                                                                                  |
| `uncertainActuation` | `true`, solange der Befehl `uncertain` ist                                                                                                                                                                                                                    |

**Angenommen heißt nie erledigt.** Ein angenommener Befehl bleibt „angenommen“, bis das Gerät den angeforderten Wert meldet. „Nach der Anforderung“ vergleicht die eigene Empfangszeit des Plugins mit der Zeit der Anforderung, eine nachgehende Uhr in Gerät oder Sidecar spielt also keine Rolle. Ein physischer Befehl, der in eine Zeitüberschreitung läuft, wird `uncertain` und nie automatisch wiederholt; er bleibt unsicher bis zu einer passenden Meldung oder einer neuen Anforderung.

Eine externe Zustandsänderung wird auch festgehalten, nachdem ein Befehl abgeschlossen ist (`reported` oder `failed`), etwa wenn jemand das Gerät von Hand zurückschaltet. `confirmed` wird dann `false`.

Eine Störungsmeldung setzt die Qualität `fault` und die Störungsfelder, behält aber den letzten guten gemeldeten Wert. Sie bestätigt keinen Befehl und zählt nicht als externe Zustandsänderung. Die nächste gute Meldung löscht die Störung.

Stillgelegte Endpoints (vom Sidecar entfernt, ersetzte überbrückte Hardware, ein zwangsentfernter Node) behalten ihre Zustandszeilen, sodass `GET /matter/endpoints/:id/state` für sie weiterhin antwortet.

Das Protokoll angeforderter Befehle ist begrenzt: die neuesten 1.000 Zeilen und nichts, was älter als 30 Tage ist.

### Ereignisse

Die Ereignisse `device.state` und `command.outcome` des Sidecars aktualisieren die Zustandszeilen:

- Beide Payloads können optional eine `fabricId` tragen. Ist sie vorhanden, gilt das Ereignis nur für den Node dieser Fabric. Ereignisse erreichen nur die aktive Fabric.
- Eine Meldung, die älter als die gespeicherte ist, wird ignoriert (Auslieferung in falscher Reihenfolge). Eine Meldung, die mehr als 5 Minuten in der Zukunft beobachtet wurde (gemessen an der Uhr des Plugins), wird ignoriert, ebenso ein Wert, der serialisiert größer als 4 KiB ist.
- Ein `command.outcome` gilt nur, wenn es den Endpoint nennt, für den der Befehl festgehalten wurde.
- Ereignisse für unbekannte, entfernte oder archivierte Endpoints werden ignoriert und nur gezählt.
- Ereignisse warten in einer begrenzten Warteschlange (10.000) und werden in Stapeln geschrieben (200 pro Transaktion). Darüber hinaus werden sie verworfen und gezählt.

`GET` und `POST /matter/reconciliation` liefern die Zähler seit dem Start des Plugins als `events`: `applied`, `outOfOrder`, `unknownEndpoint`, `inactiveNode`, `unmappedCluster`, `unknownCommand`, `futureTimestamp`, `oversizedValue` und `dropped`.

## Deaktivieren, Aktualisieren und Deinstallieren

| Ereignis                                                                                                          | Was mit den Matter-Daten passiert                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin deaktiviert oder nicht geladen (Plugins global deaktiviert, fehlgeschlagenes Laden, Boot-Guard-Quarantäne) | Nichts wird verändert oder gelöscht. Es läuft kein Abgleich, und der gespeicherte Zustand gilt anhand seiner Zeitstempel einfach als veraltet. Beim nächsten Laden läuft nach dem Verbindungsaufbau ein Abgleich.                             |
| Plugin-Aktualisierung                                                                                             | Es laufen nur additive Migrationen. Alle Daten bleiben erhalten.                                                                                                                                                                              |
| **Plugin-Deinstallation**                                                                                         | **Alle Matter-Tabellen und -Zeilen werden gelöscht**, auch die Verbindungseinstellungen. Die Fabric im Sidecar bleibt unberührt. Nach einer Neuinstallation erscheinen die Nodes als nicht übernommen; Namen und Flow-Verweise sind verloren. |

Sichern Sie vor dem Deinstallieren, was Sie brauchen, und planen Sie ein, die Nodes danach erneut zu übernehmen.

## REST-Endpunkte

Alle Endpunkte liegen unter `/api/matter/…` und brauchen `system.plugins.manage` (eine eigene Matter-Berechtigung folgt in [ATT-1003](https://linear.app/attraccess/issue/ATT-1003)). Keiner sendet einen Befehl an ein Gerät.

| Endpunkt                                                                                 | Zweck                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /matter/nodes?lifecycleState=&includeInactive=`                                     | Nodes auflisten (archivierte und entfernte nur auf Anfrage)                        |
| `GET /matter/nodes/:id`                                                                  | Ein Node mit Endpoints, Clustern und Fähigkeiten                                   |
| `PATCH /matter/nodes/:id`, `PATCH /matter/endpoints/:id`                                 | `displayName`, `description`, `location` bearbeiten                                |
| `POST /matter/nodes/:id/claim`, `relink`, `repair`, `archive`, `restore`, `force-remove` | Die Aktionen oben                                                                  |
| `GET /matter/endpoints/:id/state`                                                        | `{ endpointRef, states }`: die Zustandseinträge eines Endpoints                    |
| `GET /matter/reconciliation`, `POST /matter/reconciliation`                              | Letztes Ergebnis und die Ereigniszähler (`events`); jetzt einen Abgleich ausführen |

## Audit

Die Audit-Domäne `matter` erfasst `matter.node_quarantined`, `matter.node_detached`, `matter.node_reattached`, `matter.node_claimed`, `matter.node_relinked`, `matter.node_repaired`, `matter.node_archived`, `matter.node_restored`, `matter.node_force_removed`, `matter.node_metadata_updated`, `matter.endpoint_metadata_updated` und `matter.fabric_mismatch_detected`. In der Oberfläche des Audit-Logs erscheinen sie mit lesbaren Namen, etwa „Matter node quarantined“. Der Gegenstand eines Eintrags zeigt eine aus der Plugin-UUID abgeleitete Zahl; die vollständige UUID steht in den Details des Eintrags (`nodeRef`, `endpointRef`, `fabricRef`). Die Einträge enthalten nur IDs, Aufzählungswerte und Kennzeichen, nie freien Text von Geräten oder Geheimnisse. Die Details von `matter.node_detached` und `matter.node_reattached` enthalten `fabricId` und `nodeId`. Telemetrie wird nie auditiert.

Einträge des Abgleichs (`matter.node_quarantined`, `matter.node_detached`, `matter.node_reattached`, `matter.fabric_mismatch_detected`) tragen `initiator`: `system`, wenn ein automatischer Auslöser den Abgleich gestartet hat, `administrator` bei einem manuellen `POST /matter/reconciliation`. Der Host kennt für Plugins keinen System-Akteur, deshalb nennen automatische Einträge den Administrator als Akteur, der zuletzt die Verbindungseinstellungen gespeichert hat. Hat das noch niemand getan, werden automatische Einträge übersprungen und eine Warnung wird protokolliert.
