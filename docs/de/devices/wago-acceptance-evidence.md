# WAGO-Abnahmenachweise

**Freigabe blockiert, bis geprüfte physische und Teilnehmernachweise vorliegen.** Dieser Leitfaden unterstützt ATT-984 und ATT-985; er ist keine Ankündigung einer unterstützten Beta. Bestandene automatisierte Tests, verbundener Controller oder vollständiges Nachweisformular belegen die Betreiberreise nicht.

## Vor jeder Hardware-Sitzung

Verwenden Sie CC100 `751-9301`, Firmware `31`, sichere Niederspannungs-Fixtures und bei Bedarf qualifizierte Verkabelung. Halten Sie Not-Aus- und Personenschutzschaltungen unabhängig. Betriebsbedingungen, Trennungsrichtlinien und Bestätigungen sind keine sicherheitszertifizierten Funktionen.

Erfassen Sie Ausgangszustand des Controllers und explizite destruktive Installationsfreigabe. Seit 2026-09-06 kann Inbetriebnahme bestehende Anwendungen und Daten stoppen oder löschen; Attraccess erhält, sichert und restauriert keine vorherigen CODESYS- oder anderen Workloads. Backup vorheriger Workloads ist keine Inbetriebnahmeschranke. Prüfen Sie gestopptes und dauerhaft deaktiviertes CODESYS vor I/O und wiederholen Sie nach Neustart. Erhalten Sie bei Änderung bestehender Attraccess-Zugangsdaten den unterstützten Verwaltungszugang-Wiederherstellungsweg: Serverbackup allein enthält **keine** geräteseitigen MQTT-Zugangsdaten, SSH-Zugang oder Runtime-Zustand. Unverfügbare Hardware oder ungeklärte Zugangsdatenwiederherstellung bleibt Abnahmeblocker. Fügen Sie Tickets nie Zugangsdaten-Dateien, rohe Broker-Payloads, vollständige Konfigurationsdumps oder ungeprüfte Logs bei.

## Tatsächliche Reise beobachten

Ein nichttechnischer oder leicht technischer Teilnehmer außer dem Implementierer muss die Reise durchführen. Erfassen Sie Hindernisse, Fehlversuche und jede Entwicklerhilfe statt stiller Korrektur. Terminal, JSON-Editor, API-Client oder manuelles Geheimniskopieren ist ein Scheitern der geforderten Reise ohne Code, auch wenn ein Ingenieur die Hardware danach zum Laufen bringt.

Verwenden Sie nur Aktionen im exakt getesteten Build. Der bestehende [Inbetriebnahmeleitfaden](devices/wago-cc100-commissioning.md) dokumentiert seine Quellbasis; seine Grenzen müssen nach Integration von Inbetriebnahme, visueller Konfiguration, Diagnose und Hardwareänderungen abgeglichen werden. Verwenden Sie keine Screenshots oder Anweisungen für ungemergte oder fehlende Seiten als Abnahmenachweis.

Erfassen Sie je erforderlicher Prüfung beobachtetes Verhalten und verlinken Sie zeitgestempelte Aufnahme, Screenshot, Testbericht oder prüfergenehmigtes Artefakt. Nehmen Sie Desktop und Mobil auf. Erklären Sie unabhängige Beobachtung von gewähltem Eingang, Ausgang und physischer Modbus-Messung. Ausgangsbestätigung allein ist keine physische Rückmeldung.

## Erforderliche Nachweise

Die Offline-Vollständigkeitsprüfung exportiert die maßgebliche Liste als `requiredChecks` in `apps/plugins/wago/scripts/check-acceptance.mjs`. Sie enthält Inbetriebnahme/Härtung, permanente Registrierung/Widerruf, visuelles Digital-I/O und Modbus, Konfigurationsbereitschaft, ersten Flow mit Bestätigung, Packed-Bit-Unabhängigkeit und gleichzeitige Ausgänge, Neustart/Reboot, Ablehnung/Rollback, abgelaufene/doppelte Befehle, Betriebsrichtlinien/Bedingungen, unterbrochene Inbetriebnahme und Zugangsdatenwiederherstellung, Neuregistrierung, Modbus-Fehler und veraltetes Warten, Desktop/Mobil, gemeinsame Konformität und Audit-Redaktion.

Für aktuelle geführte Bereitstellung müssen Neustart-/Reboot- und unterbrochene Installationsnachweise die Host-Prüfung mit Docker-Neustartrichtlinie `no` ausüben: CODESYS-Deaktivierung, enge Rechte, Identitäts-/Ausgangsschreiberkonflikte, begrenzte Crash-Retries und Eindämmung fehlgeschlagener Beobachtungen. Fehlgeschlagene Container-Stopp-Prüfung muss Fehler und Wiederherstellungszuständigkeit erhalten. Erfassen Sie exakt getesteten Build; frühere Browser-/Softwareergebnisse prüfen spätere Sicherheitsänderungen oder physisches Verhalten nicht. Diese Details ergänzen bestehende Prüfungen, kein neues Nachweisschema.

Erhalten Sie einen JSON-Nachweisdatensatz außerhalb des Quellbaums mit diesen Feldern:

| Feld                    | Erforderlicher Inhalt                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`         | `1`                                                                                                                                                                                                                          |
| `environment`           | `physical`; reine Simulatornachweise werden abgelehnt                                                                                                                                                                        |
| `controller`            | `model: "751-9301"`, `firmware: "31"`, `hardwareId`, `startingState`, `wiringEvidence`                                                                                                                                       |
| `build`                 | Vollständige 40-stellige `pluginCommit` und `runtimeCommit`; `frontendDigest`, `backendDigest`, `runtimeDigest` in Form `sha256:<64 hex>`; `protocolVersion`, `bundleChecksumEvidence`, `visualArtifactProvisioningEvidence` |
| `modbus`                | Tatsächliche `model`, `transport`, `profileVersion`, `qualificationEvidence`; keine unqualifizierte Referenzbaugruppe einsetzen                                                                                              |
| `participant`           | Nicht geheime Teilnehmer-`id` und `experience` (`nontechnical` oder `lightly-technical`)                                                                                                                                     |
| `implementerId`         | Vom Teilnehmer verschieden                                                                                                                                                                                                   |
| `noCodeJourney`         | `true` nur bei gesamter Reise ohne Terminal/Code/JSON/API/manuelle Geheimnisse                                                                                                                                               |
| `developerIntervention` | `false` für Abnahme                                                                                                                                                                                                          |
| `safeFixtureConfirmed`  | `true` nach Prüfung von Fixture und Sicherheitsgrenze                                                                                                                                                                        |
| `obstacles`             | Array beobachteter Teilnehmerhindernisse, explizit leer falls keine                                                                                                                                                          |
| `blockers`              | Array; muss vor bestandener Vollständigkeit explizit leer sein                                                                                                                                                               |
| `checks`                | Ein Eintrag je exportierter Prüf-ID mit `id`, `result`, `observed`, `evidenceRef`, `recordedAt`                                                                                                                              |

`result` muss für jede erforderliche Prüfung `pass` sein. Verwenden Sie ehrlich `fail` oder `not-run` für unfertige Arbeit; die Prüfung beendet erfolglos. `evidenceRef` verweist auf prüfbaren Nachweis, keine Zugangsdaten oder rohe Payload. Referenzen werden von der Prüfung weder abgerufen noch authentifiziert. Die Datei soll klein bleiben und Zusammenfassungen statt Aufnahmen oder Telemetrie enthalten.

Release-Ingenieure, nicht Betreiberteilnehmer, können die Offline-Prüfung ausführen:

```sh
node --test apps/plugins/wago/scripts/check-acceptance.test.mjs
node apps/plugins/wago/scripts/check-acceptance.mjs /path/to/reviewed-evidence.json
```

Die Prüfung verbindet nie zu Hardware, ändert Linear nicht, signiert keine Artefakte und veröffentlicht nichts. Ihre Tests verwenden synthetische Fixtures und sind keine ATT-984-Hardwarenachweise. Erfolg bedeutet vorhandene Pflichtfelder, **nicht** wahre Beobachtungen oder autorisierte Freigabe. Ein menschlicher Prüfer muss jedes verlinkte Artefakt inspizieren, passende Builds prüfen und Teilnehmerhindernisse beheben, bevor er die Schranke genehmigt.

## Veröffentlichungsgrenze

ATT-985 bleibt durch physische/nichttechnische Abnahme und ATT-983-Auditabdeckung blockiert. Fügen Sie geprüfte Nachweise diesen Tickets bei. Veröffentlichen Sie nur tatsächlich qualifizierte Geräte-/Profil-/Transportkombinationen, kompatible Frontend-/Backend- und prüfsummengeprüfte ARMv7-Runtime-Artefakte sowie gegen getestete Seiten geprüfte Dokumentation. Normale Betreiberinstallation muss das Runtime-Bundle über Paketierung oder visuellen Import liefern, nicht Server-Umgebungsvariablen oder Shell-/Dateipfadanweisungen.

Breitere Vier-Baugruppen-Qualifikation, Abrechnung, Telemetriehistorie und Arbitration sind verschoben. Sie dürfen nicht als bewiesene Fähigkeiten dieses ersten Teilumfangs beworben werden.
