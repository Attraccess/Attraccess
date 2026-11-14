# WAGO: Produktivbetrieb und Kompatibilität

<!-- llms-description: Nennt die getestete WAGO-CC100-Kompatibilität, Broker-Einstellungen, erzwungene und gemessene Grenzen, Runbooks und was nicht zugesagt wird. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

> **Der physische Einsatz ist unqualifiziert, bis [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) abgeschlossen ist.**
> Nichts auf dieser Seite ist eine Sicherheitsaussage oder eine Hardware-Qualifizierung. Lesen Sie zuerst die
> [Sicherheitsgrenze](plugins/wago/safety-boundary.md). Ein Penetrationstest und eine externe Prüfung der funktionalen Sicherheit (Safety-Review) wurden **nicht**
> durchgeführt ([Bedrohungsmodell](plugins/wago/threat-model.md)).

Diese Seite beschreibt, was getestet wurde, was zu konfigurieren ist, was gemessen wurde und was nicht zugesagt wird.

## Getestete Kompatibilität

| Element             | Wert                                                                                                                                                                                                                     | Status                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Controller          | WAGO CC100 `751-9301`                                                                                                                                                                                                    | Nur Software-Fixtures; die [Laborübungen](#laborübungen) wurden noch nicht ausgeführt; die Hardware-Abnahme ist ATT-984 |
| Firmware            | FW31 (BSP `2024.12.0` allein identifiziert sie nicht, siehe [FW31-Unterstützung](plugins/wago/fw31-support.md))                                                                                                          | Basis                                                                                                                    |
| Laufzeitversion     | `0.3.0` (`runtimeVersion` in `cc100-runtime/manifest.json`)                                                                                                                                                              | Aktuell                                                                                                                  |
| Protokoll           | `1.0.0`, Hauptversion 1                                                                                                                                                                                                  | Aktuell                                                                                                                  |
| Hardwareprofil      | `cc100-751-9301-fw31-digital-rtu-v1` (ältere `digital-v1`-Releases sind rein digital)                                                                                                                                    | Aktuell                                                                                                                  |
| Laufzeitfähigkeiten | `claim`, `claim-expiry-v1`, `heartbeat`, `configuration-v1`, `commands`, `state`, `measurement`, `fault`, `acknowledgement`, `credential-rotation-v1`, `front-panel-v1`, `runtime-update-gate-v1`, `bounded-messages-v1` | Aktuell; ein Test hält diese Liste gleich mit der der Laufzeit                                                           |
| Attraccess-Host     | Plugin-SDK `attraccessVersion.min` `1.11.0` (`plugin.json`); keine Obergrenze deklariert                                                                                                                                 | Aktuell                                                                                                                  |
| Broker              | RabbitMQ 4 mit dem MQTT-Plugin                                                                                                                                                                                           | Zuverlässigkeits-Harness und Flotten-Fixture                                                                             |

### Modbus-Profile

| Profil                                                                                                                                                          | Status                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WAGO 879-3020 (4PS) — Modbus RTU** (`wago-879-3020`)                                                                                                          | Nur lesende Messwerterfassung; vollständige lesbare Registerzuordnung; Verbindungseinstellungen unter [879-3020 über RS-485](plugins/wago/879-3020-modbus-rtu.md). Nicht hardware-qualifiziert |
| **WAGO 879-3000 — Modbus RTU** (`wago-879-3000`)                                                                                                                | Integriertes Legacy-Profil; nur lesende Messwerterfassung; bleibt ladbar. Nicht hardware-qualifiziert                                                                                          |
| **WAGO 879-3000 — UNQUALIFIED / map unverified** (`wago-879-3000-unverified`) und **WAGO 879-1300 — UNQUALIFIED / map unverified** (`wago-879-1300-unverified`) | Legacy-Referenzen mit nicht verifizierter Registerzuordnung, im Editor entsprechend benannt; bleiben ladbar                                                                                    |

### Gemischte Versionen

Eine ältere Laufzeit funktioniert weiter mit einem neueren Server und umgekehrt. Eine Laufzeit ohne
`bounded-messages-v1` zeigt keine Drop-Zähler (die Diagnose weist darauf hin), sendet keine `omittedErrors` und unterliegt
nicht den neuen Nachrichtenobergrenzen. Konfigurationsgrenzen gelten, wenn eine neue Revision oder ein Rollback
veröffentlicht wird und wenn eine Laufzeit, die sie kennt, eine solche empfängt; eine bereits laufende Konfiguration wird
deswegen nie abgelehnt.

Eine verwaltete Laufzeit aktualisiert sich nach einem Server-Update automatisch, wobei die Ausgänge ausgeschaltet bleiben,
bis der Server das laufende Image bestätigt. Eine nicht verwaltete Laufzeit (von Hand installiert oder vor den verwalteten
Updates eingerichtet) bleibt im Failsafe, bis sie von Hand aktualisiert wird
([Runbook 5](plugins/wago/recovery-runbooks.md#_5-laufzeit-upgrade-und-rollback)).

## Broker-Einstellungen

- **Ein Konto pro Controller**, mit der Topic-Richtlinie, die der Registrierungsablauf anfordert (Veröffentlichen unter dem
  eigenen `controllers/<hardwareId>/#`; Abonnieren nur der eigenen Sollkonfiguration, der Befehle und der Zugangsdaten-Rotation).
- **QoS 1** für Veröffentlichen und Abonnieren des Controllers; die Standardwerte des in Attraccess konfigurierten
  MQTT-Servereintrags dürfen bei QoS 0 bleiben.
- **Maximale Nachrichtengröße: 2 MiB** (empfohlen). Die größte legitime Nachricht ist eine 1-MiB-Sollkonfiguration.
  Setzen Sie bei RabbitMQ 4 das MQTT-Paketgrößenlimit für authentifizierte Clients (zum Beispiel
  `mqtt.max_packet_size_authenticated = 2097152`; prüfen Sie den Schlüsselnamen anhand der Dokumentation Ihrer
  RabbitMQ-Version). Der Attraccess-Host begrenzt die MQTT-Nachrichtengröße selbst nicht, daher ist dieses Limit der
  einzige hostseitige Schutz vor einer einzelnen übergroßen Veröffentlichung.
- Lassen Sie Retained Messages aktiviert: Controller veröffentlichen Status und Berichte als Retained Messages, und der
  Server veröffentlicht die Sollkonfigurationen als Retained Messages.

## Von der Integration erzwungene Grenzen

| Grenze                                                    | Wert                             | Was darüber hinaus geschieht                                         |
| --------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Nachrichten vom Controller zum Server                     | 64 KiB, 8 Verschachtelungsebenen | Vor dem Parsen ignoriert                                             |
| Befehle, Claims, Rotationsnachrichten an einen Controller | 64 KiB                           | Verworfen, gezählt, keine Antwort; der Absender läuft in ein Timeout |
| Sollkonfiguration an einen Controller                     | 1 MiB                            | Verworfen, gezählt, keine Antwort                                    |
| Gleichzeitig verarbeitete Nachrichten pro Abonnement      | 100, plus 100 wartende           | Weitere Nachrichten verworfen, gezählt, keine Antwort                |
| Ablehnungsbericht                                         | 50 Fehler, 64 KiB                | Gekürzt, mit der Anzahl ausgelassener Fehler                         |
| Bereitschaftsfehler in der Statusnachricht                | 8 KiB                            | Gekürzt, mit der Anzahl ausgelassener Fehler                         |
| Fehlertext                                                | 1 KiB                            | Gekürzt                                                              |
| Konfigurationsgröße                                       | 1 MiB (gesamte Sollnachricht)    | Beim Veröffentlichen, beim Rollback und auf dem Controller abgelehnt |
| Konfigurationsverschachtelung                             | 16 Ebenen                        | Abgelehnt                                                            |
| ID-Länge                                                  | 256 Zeichen, keine Steuerzeichen | Abgelehnt                                                            |
| Kanäle oder physische Punkte                              | je 2048, aktiviert oder nicht    | Abgelehnt                                                            |
| Aktivierte Kanäle                                         | 256                              | Abgelehnt                                                            |
| Statusbericht im ungünstigsten Fall                       | 64 KiB                           | Abgelehnt                                                            |

Ein verworfener Befehl erhält keine Antwort und läuft daher in ein Timeout wie ein Befehl an einen Offline-Controller. Die
Drop-Anzahl nach Grund (`oversized`, `overload`) wird in den Controller-Details und in der [Diagnose](plugins/wago/diagnostics.md)
angezeigt.

Die Laufzeit überspringt die Konfigurationsgrenzen nur, wenn eine eingehende Revision samt Hash ihrer gespeicherten
akzeptierten Konfiguration entspricht. Ein ersetzter oder zurückgesetzter Controller hat keine, daher wird eine
Retained-Revision, die vor diesen Grenzen veröffentlicht wurde und sie überschreitet, mit
`configuration_limit_exceeded` abgelehnt. Verkleinern Sie die Konfiguration und veröffentlichen Sie eine neue Revision
([Runbook 4](plugins/wago/recovery-runbooks.md#_4-einen-controller-ersetzen)).

Laufzeiten älter als `0.3.0` veröffentlichen Ablehnungsberichte beliebiger Größe. Der Server ignoriert jede
Controller-Nachricht über 64 KiB oder mit mehr als 8 Verschachtelungsebenen. Eine sehr große Ablehnung einer solchen
Laufzeit führt daher dazu, dass die Revision als veröffentlicht angezeigt wird, ohne dass eine Ablehnung erscheint.
Aktualisieren Sie zuerst die Laufzeit
([Runbook 5](plugins/wago/recovery-runbooks.md#_5-laufzeit-upgrade-und-rollback)).

Jedes auf der Seite **Ein- & Ausgänge** hinzugefügte integrierte 879-3020-Messgerät erzeugt 131 physische Punkte und 131
Kanäle, von denen 11 empfohlene Messwerte aktiviert sind ([Standard-Messwerte](plugins/wago/879-3020-modbus-rtu.md#standard-messwerte-und-weitere-aktivieren)).
Zehn solche Messgeräte an einem CC100 ergeben 1.310 Punkte und Kanäle, davon 110 aktiviert, und liegen damit innerhalb
beider Grenzen; eine Konfiguration mit allen 131 aktivierten Messwerten an zwei Messgeräten wird abgelehnt. Deaktivierte
Kanäle erfordern eine Laufzeit, die `channel-enabled-v1` meldet; der Server veröffentlicht keine Konfiguration mit
deaktivierten Kanälen an eine ältere Laufzeit.

Die Aussage zu zehn Messgeräten ist **nur berechnet und in automatisierten Tests geprüft, nicht auf Hardware**: Die Tests
zeigen, dass der Editor, der Server und die Laufzeit diese Konfiguration akzeptieren und dass die Laufzeit nur aktivierte
Kanäle liest. Die [berechnete Buszeit](plugins/wago/879-3020-modbus-rtu.md#buszeit-für-zehn-messgeräte) bei 9600 Baud beträgt
etwa 2 s pro Abfragerunde mit den empfohlenen Messwerten. Diese Zahl umfasst nur die Leitungszeit plus eine angenommene
Antwortverzögerung des Messgeräts von 25 ms pro Anfrage. Der größte Kostenfaktor ist nicht gemessen: Die Laufzeit startet
für jede RTU-Anfrage einen Python-Prozess und öffnet die serielle Schnittstelle, das sind bei zehn Messgeräten mit den
empfohlenen Messwerten 30 Prozessstarts pro Abfragerunde. Auf dem CC100 kann eine Runde dadurch länger dauern als das
Standard-Abfrageintervall von 5 s, sodass das Abfrageintervall möglicherweise erhöht werden muss. Nicht verifiziert: die
Prozessstartzeit auf dem CC100, die RS-485-Lasteinheiten (Unit Loads) von zehn Messgeräten an einem CC100-Segment, die Antwortverzögerung des
Messgeräts und welche Baudraten die RS-485-Schnittstelle des CC100 über die auf dem Entwicklungsgerät verwendeten 9600 Baud
hinaus unterstützt.

## Gemessene Grenzen

Jede Zahl unten ist eine **Simulatormessung**: das echte Server-Plugin auf den echten MQTT-Diensten des Hosts gegen einen
RabbitMQ-4-Container, mit simulierten Controllern in einem anderen Prozess. Sie sagt nichts über einen physischen CC100
aus, und jede Zahl gilt nur für den Commit, die Maschine, den Broker und die Dauer, die zusammen mit ihr festgehalten sind.

Das Harness führt den echten `WagoService` und `WagoFlowService` auf dem echten `MqttClientService` und
`PluginMqttService` des Hosts aus. Befehle gelangen über den echten Flow-Befehlsknoten des Plugins hinein. Durch Stubs
ersetzt sind: der in Attraccess konfigurierte MQTT-Servereintrag (QoS-0-Standardwerte), die Verschlüsselung, Metriken, der
Timer und die Teile des Plugin-Kontexts, die den Rest des Hosts benötigen: Audit-Einträge, Secret-Verschlüsselung, die
Bereitstellung von MQTT-Zugangsdaten (das Broker-Konto bleibt unverändert), der Flow-Trigger und die Abfrage gespeicherter
Flows (keine Flows). Die Flow-Engine selbst wird nicht geprüft.

Veröffentlichte Grenzen sind die **Hälfte des höchsten bestandenen Schritts** des Durchlaufs (1 bis 128 Controller bei
1 Befehl/s pro Controller, danach eine steigende Rate, fünf Minuten pro Schritt). Wiederherstellungsziele sind das
**Doppelte der langsamsten gemessenen Wiederherstellung**. Die Wiederherstellung wird ab dem Moment gemessen, in dem ein
eingespeister Fehler aufgehoben wird (zum Beispiel wenn der 30 s lange Broker-Ausfall endet); die Wiederherstellungszahlen
und -ziele enthalten den Ausfall selbst also nicht.
Starten Sie ihn mit `pnpm nx run plugin-wago:reliability:sweep`; eine schnelle Prüfung mit `reliability:short`.

> **Es sind noch keine Durchlaufergebnisse veröffentlicht.** Der Durchlauf dauert auf einer ruhigen Maschine etwa eine
> Stunde und wurde auf keiner ausgeführt. Bis dahin werden hier keine Grenze und kein Wiederherstellungsziel genannt. Der
> 8-Stunden-Dauerlauf ist dokumentiert, wurde aber nicht durchgeführt.

### Bestehenskriterien

| Modus                                                    | Schlägt fehl bei                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kurz (einige Minuten, 4 Controller, jeder Fehler einmal) | einem verlorenen Befehl (ein in einer gesunden Phase gesendeter Befehl, der nie beantwortet wird), verlorenem Status, einem Überlauf der Host-Warteschlange oder einer Wiederherstellung über 180 s nach Aufhebung des Fehlers. Ein Fehler, den das Harness gar nicht einspeisen konnte, lässt den Lauf als Harness-Fehler scheitern. Doppelt angewendete Befehle und die Einspeisungsprüfungen pro Fehler werden in der Zusammenfassung gemeldet, lassen den Lauf aber nicht scheitern |
| Durchlaufschritt                                         | einem verlorenen Befehl, verlorenem Status, einem Überlauf der Host-Warteschlange, einem doppelt angewendeten Befehl, einem Controller-Drop oder einer Bestätigung im 95. Perzentil über 2 s                                                                                                                                                                                                                                                                                            |

### Eingespeiste Fehler

Broker-Ausfall (30 s), Verbindungsverlust, Neustart der Laufzeit, Neustart des Servers mit gespeichertem Status, doppelte
Befehle, Status in falscher Reihenfolge, übergroße Nachrichten, abgelehnte Konfigurationen und Zugangsdaten-Rotation unter
Last. Die Zugangsdaten-Rotation lässt das Broker-Konto unverändert, prüft also die Übergabe, die Persistenz und den
Wiederaufbau der Verbindung, nicht eine Änderung des Broker-Passworts.

## Runbooks

[Wiederherstellungs-Runbooks](plugins/wago/recovery-runbooks.md): Wiederherstellung von Konfiguration und Laufzeit,
kompromittierte Zugangsdaten, Broker-Ausfall, Controller-Austausch, Laufzeit-Upgrade und Rollback, Disaster Recovery.
Die Inbetriebnahme ist destruktiv, und es gibt keine Sicherungskopie und keine Wiederherstellung der Workloads.

## Laborübungen

Die Wiederherstellungs-Runbooks sowie die Übungen zu Upgrade und Rollback, Broker-Ausfall, Zugangsdaten-Rotation und
Controller-Austausch (einschließlich einer destruktiven Inbetriebnahme) werden auf einem echten CC100 `751-9301` mit FW31
und im Beisein einer Person ausgeführt.

> **Noch nicht durchgeführt.** Sie benötigen einen vorbereiteten CC100 und eine Person, die sie ausführt. Die Ergebnisse
> werden dieser Tabelle hinzugefügt, und die Nachweise werden anhand des [Nachweisleitfadens](plugins/wago/acceptance-evidence.md)
> festgehalten, bevor die Integration als produktionsreif beschrieben wird.

**Voraussetzungen.** Ein CC100, der gelöscht werden darf, ohne angeschlossene Geräte (oder nur mit sicheren
SELV/PELV-Kleinspannungs-Aufbauten), eine erreichbare private IPv4-Adresse, der Werks- oder bekannte SSH-Zugang und ein RabbitMQ-4-Broker
mit einem Administratorkonto. Halten Sie den Commit, die Laufzeitversion, die Firmware, die Broker-Version und die
ausführende Person fest.

| #   | Übung                                        | Schritte                                                                                         | Bestanden, wenn                                                                                                        | Ergebnis         | Nachweis |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| L1  | Destruktive Inbetriebnahme                   | Führen Sie den [geführten Ablauf](plugins/wago/cc100-commissioning.md) auf dem Gerät aus         | Frischer Heartbeat, Konfiguration angewendet, Registrierung widerrufen; CODESYS gestoppt und deaktiviert               | nicht ausgeführt |          |
| L2  | Laufzeit-Upgrade                             | Die vorherige Laufzeit installieren, dann das verwaltete Update die aktuelle installieren lassen | Ausgänge aus, bis bestätigt; danach im selben Boot-Vorgang bereit                                                      | nicht ausgeführt |          |
| L3  | Laufzeit-Rollback                            | Ein fehlschlagendes Kandidaten-Image erzwingen                                                   | Vorheriges Image wiederhergestellt; Status zeigt den klassifizierten Grund                                             | nicht ausgeführt |          |
| L4  | Nicht verwaltete Laufzeit nach Server-Update | Ein nicht verwaltetes Gerät auf der alten Laufzeit belassen                                      | Ausgänge aus, Befehle abgelehnt, bis es von Hand aktualisiert wird                                                     | nicht ausgeführt |          |
| L5  | Broker-Ausfall                               | Den Broker für 30 s, dann für 5 min stoppen                                                      | Trennungsrichtlinie angewendet; Wiederherstellung innerhalb von 180 s nach Rückkehr des Brokers; Status stimmt überein | nicht ausgeführt |          |
| L6  | Zugangsdaten-Rotation                        | Unter Befehlslast rotieren                                                                       | Abgeschlossen; Befehle werden weiterhin bestätigt                                                                      | nicht ausgeführt |          |
| L7  | Controller-Austausch                         | Das Gerät ersetzen, die Konfiguration kopieren, erneut veröffentlichen                           | Neues Gerät bereit; alte Registrierung entfernt                                                                        | nicht ausgeführt |          |
| L8  | Übergroße und überzählige Nachrichten        | Einen 70-KiB-Befehl und 150 Befehle gleichzeitig veröffentlichen                                 | Zähler steigen in der Diagnose; das Gerät bleibt bereit                                                                | nicht ausgeführt |          |

Nachweisvorlage für jede Zeile: Datum, ausführende Person, Commit, Laufzeitversion, Firmware, Broker-Version,
durchgeführte Schritte, beobachtetes Ergebnis, Screenshots oder Log-Auszüge (ohne Secrets) und alles, was vom Runbook
abwich.

## Support-Grenzen

- Dies ist eine Beta-Integration. Es gibt **keine festen Reaktionszeiten, Verfügbarkeitsziele oder Wartungsfenster**.
- Unterstützt bedeutet: die unter getestete Kompatibilität aufgeführte Kombination, installiert über den geführten
  Inbetriebnahme-Ablauf, mit Sicherheitsschaltkreisen, die unabhängig von Attraccess sind.
- Nicht unterstützt: andere CC100-Modelle oder Firmware, die manuelle Docker-Installation als Produktivpfad, die
  Bereitstellung ohne den geführten Ablauf, die Verwendung der Integration als Sicherheitsfunktion und die
  Wiederherstellung der vorherigen Workload eines Controllers.
- Zurückgestellt und nicht beworben: die Qualifizierung aller vier Paketbaugruppen, Abrechnung, Telemetrie-Verlauf und
  Arbitrierung.
- Offen: der Penetrationstest, die externe Prüfung der funktionalen Sicherheit (Safety-Review), der 8-Stunden-Lauf und die Hardware-Abnahme (ATT-984).
