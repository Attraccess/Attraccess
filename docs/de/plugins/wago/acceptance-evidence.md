# WAGO-Abnahmenachweise

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

**Das Release bleibt blockiert, bis geprüfte physische Nachweise und Nachweise von Testteilnehmern vorliegen.** Dieser Leitfaden unterstützt ATT-984 und ATT-985; er ist keine Ankündigung einer unterstützten Beta. Bestandene automatisierte Tests, ein verbundener Controller oder ein vollständiges Nachweisformular belegen den Ablauf für Bediener nicht.

## Vor jeder Hardware-Sitzung

Verwenden Sie einen CC100 `751-9301`, Firmware `31`, sichere Niederspannungs-Aufbauten und, wo erforderlich, qualifizierte Verdrahtung. Halten Sie Not-Halt- und Personenschutz-Schaltkreise unabhängig. Betriebliche Schutzfunktionen, Trennungsrichtlinien und Bestätigungen sind nicht sicherheitsbewertete Funktionen.

Halten Sie den Ausgangszustand des Controllers und die ausdrückliche Freigabe der destruktiven Installation fest. Stand 2026-09-06 kann die Inbetriebnahme vorhandene Anwendungen und Daten stoppen oder löschen; Attraccess erhält bereits vorhandenes CODESYS oder andere Workloads nicht, erstellt keine Sicherungskopie davon und stellt sie nicht wieder her. Ein Backup der vorherigen Workload ist keine Voraussetzung für die Inbetriebnahme. Prüfen Sie vor jeglicher E/A, dass CODESYS gestoppt und dauerhaft deaktiviert ist, und wiederholen Sie diese Prüfung nach einem Neustart. Behalten Sie bei Änderungen an bestehenden Attraccess-Zugangsdaten den unterstützten Wiederherstellungsweg für den Verwaltungszugang bei: Ein Server-Backup allein enthält **nicht** die geräteseitigen MQTT-Zugangsdaten, den SSH-Zugang oder den Laufzeitzustand. Nicht verfügbare Hardware oder eine ungeklärte Wiederherstellung der Zugangsdaten bleibt ein Abnahmehindernis. Hängen Sie niemals Zugangsdaten-Dateien, rohe Broker-Payloads, vollständige Konfigurationsdumps oder ungeprüfte Logs an Tickets an.

## Den tatsächlichen Ablauf beobachten

Eine nicht technische oder wenig technische Person, die nicht der Implementierer ist, muss den Ablauf durchführen. Halten Sie Hindernisse, fehlgeschlagene Versuche und jeden Eingriff der Entwickler fest, statt sie stillschweigend zu korrigieren. Ein Terminal, JSON-Editor, API-Client oder manueller Schritt zum Kopieren von Geheimnissen ist ein Scheitern des geforderten Ablaufs ohne Code, selbst wenn ein Techniker die Hardware danach zum Laufen bringen kann.

Verwenden Sie nur Bedienelemente, die im genau getesteten Build vorhanden sind. Die vorhandene [Inbetriebnahme-Anleitung](plugins/wago/cc100-commissioning.md) dokumentiert ihre Quellbasis; ihre Einschränkungen müssen nach der Integration von Inbetriebnahme, visueller Konfiguration, Diagnose und Hardware-Änderungen abgeglichen werden. Verwenden Sie keine Screenshots oder Anleitungen für nicht gemergte oder nicht vorhandene Ansichten als Abnahmenachweis.

Halten Sie für jede erforderliche Prüfung das beobachtete Verhalten fest und verlinken Sie eine mit Zeitstempel versehene Aufnahme, einen Screenshot, einen Testbericht oder ein vom Reviewer freigegebenes Artefakt. Berücksichtigen Sie sowohl Desktop als auch Mobilgerät. Erläutern Sie, wie der ausgewählte Eingang, Ausgang und die physische Modbus-Messung unabhängig beobachtet wurden. Eine Ausgangsbestätigung allein ist keine physische Rückmeldung.

## Erforderliche Nachweise

Der Offline-Vollständigkeitsprüfer exportiert die maßgebliche Liste als `requiredChecks` in `apps/plugins/wago/scripts/check-acceptance.mjs`. Sie umfasst Inbetriebnahme/Härtung, dauerhafte Registrierung/Widerruf, visuelle digitale E/A und Modbus, Konfigurationsbereitschaft, den ersten Flow mit Bestätigung, Unabhängigkeit gepackter Bits und gleichzeitige Ausgänge, Neustart/Reboot, Ablehnung/Rollback, abgelaufene/doppelte Befehle, betriebliche Richtlinien/Schutzfunktionen, unterbrochene Inbetriebnahme und Wiederherstellung der Zugangsdaten, erneute Registrierung, Modbus-Fehler und veraltete Wartezeiten, Desktop/Mobil, gemeinsame Konformität und Audit-Schwärzung.

Für die aktuelle geführte Bereitstellung müssen die Nachweise zu Neustart/Reboot und unterbrochener Installation
das Host-Gate mit der Docker-Neustartrichtlinie `no` abdecken: Deaktivierung von CODESYS, enge Berechtigungen,
Konflikte bei Identität und Ausgangsschreiber, begrenzte Absturzwiederholungen und Eindämmung fehlgeschlagener Beobachtung.
Eine fehlgeschlagene Prüfung des Container-Stopps muss den Fehler und die Zuständigkeit für die Wiederherstellung
behalten. Halten Sie den genau getesteten Build fest;
frühere Browser- oder Software-Ergebnisse belegen weder spätere Sicherheitsänderungen noch physisches
Verhalten. Diese Angaben ergänzen die bestehenden Prüfungen, sie sind kein neues Nachweisschema.

Bewahren Sie einen JSON-Nachweisdatensatz außerhalb des Quellbaums mit diesen Feldern auf:

| Feld | Erforderlicher Inhalt |
| --- | --- |
| `schemaVersion` | `1` |
| `environment` | `physical`; reine Simulator-Nachweise werden abgelehnt |
| `controller` | `model: "751-9301"`, `firmware: "31"`, `hardwareId`, `startingState`, `wiringEvidence` |
| `build` | Vollständige 40-stellige `pluginCommit` und `runtimeCommit`; `frontendDigest`, `backendDigest`, `runtimeDigest` in der Form `sha256:<64 hex>`; `protocolVersion`, `bundleChecksumEvidence`, `visualArtifactProvisioningEvidence` |
| `modbus` | Tatsächliches `model`, `transport`, `profileVersion`, `qualificationEvidence`; ersetzen Sie sie nicht durch eine unqualifizierte Referenzbaugruppe |
| `participant` | Nicht geheime Teilnehmer-`id` und `experience` (`nontechnical` oder `lightly-technical`) |
| `implementerId` | Verschieden vom Teilnehmer |
| `noCodeJourney` | `true` nur, wenn der gesamte geforderte Ablauf kein Terminal, keinen Code, kein JSON, keine API und keine manuellen Geheimnisse brauchte |
| `developerIntervention` | `false` für die Abnahme |
| `safeFixtureConfirmed` | `true`, nachdem der Aufbau und die Sicherheitsgrenze verifiziert wurden |
| `obstacles` | Array beobachteter Hindernisse der Teilnehmer, ausdrücklich ein leeres Array, wenn es keine gab |
| `blockers` | Array; muss ausdrücklich leer sein, bevor die Vollständigkeitsprüfung besteht |
| `checks` | Ein Eintrag je exportierter Check-ID mit `id`, `result`, `observed`, `evidenceRef`, `recordedAt` |

`result` muss für jede erforderliche Prüfung `pass` sein. Verwenden Sie für unfertige Arbeit ehrlich `fail` oder `not-run`; der Prüfer endet dann mit einem Fehler. `evidenceRef` ist ein Verweis auf prüfbare Nachweise, keine Zugangsdaten und keine rohe Payload. Verweise werden vom Prüfer weder abgerufen noch authentifiziert. Die Datei sollte klein bleiben und Zusammenfassungen enthalten, keine Aufnahmen oder Telemetrie.

Release-Ingenieure, nicht die teilnehmende Bedienperson, können die Offline-Prüfung ausführen:

```sh
node --test apps/plugins/wago/scripts/check-acceptance.test.mjs
node apps/plugins/wago/scripts/check-acceptance.mjs /path/to/reviewed-evidence.json
```

Der Prüfer verbindet sich nie mit Hardware, ändert nichts in Linear, signiert keine Artefakte und veröffentlicht nichts. Seine Tests verwenden synthetische Fixtures und sind kein Hardware-Nachweis für ATT-984. Ein erfolgreiches Ergebnis bedeutet, dass die erforderlichen Felder vorhanden sind, **nicht**, dass die Beobachtungen stimmen oder das Release freigegeben ist. Ein menschlicher Reviewer muss jedes verlinkte Artefakt prüfen, übereinstimmende Builds verifizieren und Hindernisse der Teilnehmer klären, bevor er das Gate freigibt.

## Veröffentlichungsgrenze

ATT-985 bleibt durch die physische/nicht technische Abnahme und die Audit-Abdeckung ATT-983 blockiert. Hängen Sie die geprüften Nachweise an diese Tickets an. Veröffentlichen Sie nur die tatsächlich qualifizierten Kombinationen aus Gerät/Profil/Transport, kompatibles Frontend/Backend und per Prüfsumme verifizierte ARMv7-Laufzeitartefakte sowie Dokumentation, die gegen die getesteten Ansichten geprüft wurde. Die normale Installation durch Bediener muss das Laufzeit-Bundle über Paketierung oder visuellen Import bereitstellen, nicht über Server-Umgebungsvariablen oder Shell- bzw. Dateipfad-Anweisungen.

Eine breitere Qualifizierung mit vier Baugruppen, Abrechnung, Telemetrie-Historie und Arbitrierung sind zurückgestellt. Sie dürfen nicht als bewiesene Fähigkeiten dieses ersten Schnitts beworben werden.
