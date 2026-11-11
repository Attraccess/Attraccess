# Matter: Datenmodell und Lebenszyklus

<!-- llms-description: Matter-Gerätedatenmodell: Begriffe, Nodes, Endpoints, Lebenszyklus, Zustandssemantik, Abgleich, Admin-Aktionen und Datenaufbewahrung. -->

> **Das Deinstallieren des Matter-Plugins löscht alle Matter-Daten in Attraccess.** Beim Deinstallieren führt der Host alle Down-Migrationen des Plugins aus. Dabei werden alle Tabellen `plugin_matter_*` gelöscht: die Geräteeinträge, Ihre Namen, Beschreibungen und Standorte sowie die Verbindungseinstellungen. Die Matter-Fabric im Sidecar bleibt **unberührt**. Nach einer Neuinstallation erscheinen die bereits in Betrieb genommenen Nodes daher als **Nicht übernommen** und müssen erneut übernommen werden. Flow-Nodes, die auf die alten Einträge verwiesen, verlieren ihre Verweise. Das ist die einzige Ausnahme von „Matter-Daten werden nie stillschweigend gelöscht“. Deaktivieren und Aktualisieren des Plugins behalten alle Daten (siehe [Deaktivieren, Aktualisieren und Deinstallieren](#deaktivieren-aktualisieren-und-deinstallieren)).

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
| Externe Zustandsänderung | External State Change | Das Gerät meldete einen anderen Wert, obwohl kein Befehl ausstand: Jemand hat das Gerät direkt bedient.                       |
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

Jeder Node und jeder Endpoint hat eine von Attraccess erzeugte UUID. Flow-Nodes und das Audit-Log verweisen auf diese UUIDs, nie auf rohe Matter-IDs, sodass ein Verweis ein [Relink](#aktionen) übersteht. Die 64-Bit-IDs von Matter werden als Dezimalzeichenketten gespeichert. Eine Node-ID ist nur **innerhalb einer Fabric** eindeutig, deshalb wird ein Node immer durch die Fabric **und** die Node-ID bestimmt; dieselbe Node-ID in einer anderen Fabric ist ein anderer Node.

Das Datenmodell hat keine Spalte, die einen Matter-Eintrag mit einer Attraccess-Ressource verknüpft. Solche Verknüpfungen gibt es nur in der Konfiguration von Flow-Nodes.

## Lebenszyklus

| Zustand     | Bedeutung                                           | Verlassen durch                                                                                 |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `unclaimed` | Vom Sidecar gelistet, nicht übernommen (Quarantäne) | Übernehmen, Archivieren, Zwangsentfernen, oder Abgleich, wenn der Sidecar ihn nicht mehr listet |
| `claimed`   | Von einem Administrator übernommen                  | Zwangsentfernen, oder Abgleich, wenn der Sidecar ihn nicht mehr listet                          |
| `detached`  | Attraccess bekannt, vom Sidecar nicht gelistet      | Abgleich oder Reparatur (wenn wieder gelistet), Relink, Archivieren, Zwangsentfernen            |
| `archived`  | Beiseitegelegt; der Abgleich ändert ihn nie         | Wiederherstellen (zu `detached`), Zwangsentfernen                                               |
| `removed`   | Stillgelegt; die Zeile bleibt als Historie          | Nichts                                                                                          |

Ein getrennter Node merkt sich den Grund: `absent_from_sidecar` (der Sidecar listet ihn nicht mehr), `fabric_absent` (der Sidecar hat keine Fabric) oder `fabric_mismatch` (der Sidecar betreibt eine andere Fabric, siehe [unten](#wiederhergestellte-datenbanken-und-ersetzte-sidecars)).

```text
 Sidecar listet neuen Node ─► unclaimed ──übernehmen──► claimed
                                 │  ▲                     │
            nicht mehr gelistet ─┘  │ wieder gelistet     │ nicht mehr gelistet
                                 ▼  │                     ▼
                               detached ◄────────────────┘
                                │    │
                   archivieren  │    │ Relink (von einem nicht übernommenen Node)
                                ▼    ▼
                          archived  claimed (gleiche UUID, neue Identität)

 Zwangsentfernen (jeder Zustand außer removed) ─► removed
 Wiederherstellen (archived) ─► detached
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

1. Ein Node, den der Sidecar listet und den Attraccess nicht kennt, wird **unclaimed** (Audit `matter.node_quarantined`).
2. Ein übernommener oder nicht übernommener Eintrag, den der Sidecar nicht listet, wird **detached** (`matter.node_detached`).
3. Ein getrennter Eintrag, dessen exakte Identität (Fabric und Node-ID) wieder gelistet wird, wird **wieder verbunden**, zurück zu claimed oder unclaimed (`matter.node_reattached`).
4. Ein archivierter Eintrag wird nie verändert. Taucht er wieder auf, vermerkt nur die Zusammenfassung des Laufs das.
5. Endpoints, Cluster und Fähigkeiten werden aktualisiert. Verschwundene werden als entfernt markiert, nie gelöscht. Ändert sich die eindeutige ID eines überbrückten Endpoints, wird der Eintrag stillgelegt (Grund `replaced`) und ein neuer angelegt, sodass ein Flow-Verweis nie stillschweigend auf andere Hardware zeigt.

Ein erneuter Lauf gegen dieselbe Antwort ändert nichts und schreibt keine Audit-Einträge.

### Wiederhergestellte Datenbanken und ersetzte Sidecars

Wird die Attraccess-Datenbank aus einem anderen Zeitpunkt wiederhergestellt oder der Sidecar-Speicher zurückgesetzt oder ersetzt, meldet der Sidecar eine Fabric, die von der bekannten abweicht. Dann gilt:

- Die alte Fabric wird `absent`; ihre übernommenen und nicht übernommenen Nodes werden **detached** mit `fabric_mismatch`.
- Die Nodes der neuen Fabric werden **unclaimed**. Sie werden **nie automatisch zugeordnet**, auch nicht bei gleichen Node-IDs oder Seriennummern, weil das einen Flow an das falsche physische Gerät binden könnte. Zuordnen geht nur ausdrücklich per [Relink](#aktionen).
- Das Audit-Log erhält `matter.fabric_mismatch_detected`.

Hat der Sidecar gar keine Fabric, werden alle aktiven Nodes mit `fabric_absent` getrennt.

Ist die Attraccess-Datenbank **älter** als der Sidecar, werden die ihr unbekannten Nodes als unclaimed in Quarantäne genommen. Ist sie **neuer**, werden die Nodes getrennt, die der Sidecar nicht mehr listet.

## Aktionen

Alle Aktionen brauchen `system.plugins.manage`, validieren ihre Eingabe, werden im Audit-Log festgehalten und antworten mit `409` bei einem nicht erlaubten Übergang und mit `404` bei einer unbekannten ID.

| Aktion                         | Von                                     | Wirkung                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Übernehmen (claim)             | `unclaimed`                             | Übernimmt den Node, optional mit Namen.                                                                                                                                                                                                                                                                                        |
| Relink                         | `detached` (Ziel), `unclaimed` (Quelle) | Verschiebt Protokoll-Identität, Endpoints, Cluster und Zustand der Quelle auf den getrennten Eintrag. Dessen UUID, Namen und Flow-Verweise bleiben. Die Quelle wird `removed` (merged). Weichen Hersteller, Produkt oder Seriennummer ab, antwortet der Aufruf mit `409`, außer `confirmIdentityMismatch: true` wird gesendet. |
| Reparieren (repair)            | `unclaimed`, `claimed`, `detached`      | Liest einen Node erneut vom Sidecar und aktualisiert Identität, Endpoints und Fähigkeiten. Verbindet einen getrennten Node wieder, den der Sidecar mit gleicher Identität meldet. Kann der Sidecar nicht antworten, ändert sich nichts und es kommt `503` oder `409`.                                                          |
| Archivieren                    | `detached`, `unclaimed`                 | Legt den Node beiseite.                                                                                                                                                                                                                                                                                                        |
| Wiederherstellen (restore)     | `archived`                              | Zurück zu `detached`. Der nächste Abgleich verbindet ihn wieder, wenn der Sidecar ihn listet.                                                                                                                                                                                                                                  |
| Zwangsentfernen (force-remove) | jeder Zustand außer `removed`           | Legt den Eintrag und seine Endpoints still. Die Historie bleibt. **Nur Attraccess:** Der Sidecar wird nicht berührt. Listet er den Node weiter, nimmt der nächste Abgleich ihn erneut als **neuen** nicht übernommenen Eintrag in Quarantäne. Braucht `confirm: true`.                                                         |
| Bearbeiten                     | jeder Zustand außer `removed`           | Ändert Name, Beschreibung oder Standort (und sonst nichts).                                                                                                                                                                                                                                                                    |

## Zustand

Jeder Endpoint hat pro Zustandsschlüssel wie `onOff.onOff` eine Zeile, die an Ort und Stelle aktualisiert wird. Häufige Meldungen aktualisieren nur diese Zeile. Sie erzeugen keine Historie und keine Audit-Einträge.

| Feld                 | Bedeutung                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reported`           | Der letzte Wert, wann er beobachtet und empfangen wurde, woher er kam (`subscription_report`, `read`, `command_response`) und seine Qualität                 |
| `freshness`          | `fresh`, `stale` oder `unknown` (nie gemeldet), beim Lesen berechnet. Veraltet nach 10 Minuten oder dem Doppelten des maximalen Abo-Intervalls, wenn bekannt |
| `requested`          | Der angeforderte Wert, wann, von wem, mit Request-ID und Korrelations-ID                                                                                     |
| `command`            | `none`, `requested`, `accepted`, `reported`, `uncertain` oder `failed`, mit den Zeiten für angenommen und gemeldet                                           |
| `confirmed`          | `true` nur, wenn **nach** der Anforderung eine Meldung mit dem angeforderten Wert eintraf                                                                    |
| `externalChange`     | Eine Meldung, die vom letzten Wert abweicht, während kein Befehl ausstand                                                                                    |
| `fault`              | Störungscode, Meldung und Zeit; wird von der nächsten guten Meldung gelöscht                                                                                 |
| `uncertainActuation` | `true`, solange der Befehl `uncertain` ist                                                                                                                   |

**Angenommen heißt nie erledigt.** Ein angenommener Befehl bleibt „angenommen“, bis das Gerät den angeforderten Wert meldet. Eine Meldung, die älter als die gespeicherte ist, wird ignoriert (Auslieferung in falscher Reihenfolge). Ereignisse für unbekannte, entfernte oder archivierte Endpoints werden ignoriert und nur gezählt. Die Zeitüberschreitung eines physischen Befehls wird `uncertain` und nie automatisch wiederholt; sie bleibt unsicher bis zu einer passenden Meldung oder einer neuen Anforderung.

Das Protokoll angeforderter Befehle ist begrenzt: die neuesten 1.000 Zeilen und nichts, was älter als 30 Tage ist.

## Deaktivieren, Aktualisieren und Deinstallieren

| Ereignis                                                                                                          | Was mit den Matter-Daten passiert                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin deaktiviert oder nicht geladen (Plugins global deaktiviert, fehlgeschlagenes Laden, Boot-Guard-Quarantäne) | Nichts wird verändert oder gelöscht. Es läuft kein Abgleich, und der gespeicherte Zustand wird anhand seiner Zeitstempel schlicht veraltet. Beim nächsten Laden läuft nach dem Verbindungsaufbau ein Abgleich.                                |
| Plugin-Aktualisierung                                                                                             | Es laufen nur additive Migrationen. Alle Daten bleiben erhalten.                                                                                                                                                                              |
| **Plugin-Deinstallation**                                                                                         | **Alle Matter-Tabellen und -Zeilen werden gelöscht**, auch die Verbindungseinstellungen. Die Fabric im Sidecar bleibt unberührt. Nach einer Neuinstallation erscheinen die Nodes als nicht übernommen; Namen und Flow-Verweise sind verloren. |

Sichern Sie vor dem Deinstallieren, was Sie brauchen, und planen Sie ein, die Nodes danach erneut zu übernehmen.

## REST-Endpunkte

Alle Endpunkte liegen unter `/api/matter/…` und brauchen `system.plugins.manage` (eine eigene Matter-Berechtigung folgt in [ATT-1003](https://linear.app/attraccess/issue/ATT-1003)). Keiner sendet einen Befehl an ein Gerät.

| Endpunkt                                                                                 | Zweck                                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /matter/nodes?lifecycleState=&includeInactive=`                                     | Nodes auflisten (archivierte und entfernte nur auf Anfrage) |
| `GET /matter/nodes/:id`                                                                  | Ein Node mit Endpoints, Clustern und Fähigkeiten            |
| `PATCH /matter/nodes/:id`, `PATCH /matter/endpoints/:id`                                 | `displayName`, `description`, `location` bearbeiten         |
| `POST /matter/nodes/:id/claim`, `relink`, `repair`, `archive`, `restore`, `force-remove` | Die Aktionen oben                                           |
| `GET /matter/endpoints/:id/state`                                                        | Die Zustandseinträge eines Endpoints                        |
| `GET /matter/reconciliation`, `POST /matter/reconciliation`                              | Letztes Ergebnis; jetzt einen Abgleich ausführen            |

## Audit

Die Audit-Domäne `matter` erfasst `node_quarantined`, `node_detached`, `node_reattached`, `node_claimed`, `node_relinked`, `node_repaired`, `node_archived`, `node_restored`, `node_force_removed`, `node_metadata_updated`, `endpoint_metadata_updated` und `fabric_mismatch_detected`. Die Einträge enthalten nur IDs, Aufzählungswerte und Kennzeichen, nie freien Text von Geräten oder Geheimnisse. Aktionen, die der Abgleich von selbst ausführt, werden dem Administrator zugerechnet, der zuletzt die Verbindungseinstellungen gespeichert hat. Telemetrie wird nie auditiert.
