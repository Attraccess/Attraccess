# WAGO

<!-- llms-description: Das Plugin WAGO verbindet WAGO-CC100-Controller über MQTT, um Ausgänge zu schalten, Eingänge und Modbus-Zähler zu lesen und Flows auszulösen; Überblick und Voraussetzungen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Das Plugin **WAGO** verbindet WAGO-CC100-SPS-Controller über einen MQTT-Server mit Attraccess. Sie nehmen einen Controller
im Browser in Betrieb, benennen seine Ein- und Ausgänge, lesen Modbus-Zähler und nutzen den Controller in Flows
(Ausgang schalten, auf einen Eingang oder ein Ereignis reagieren).

> [!WARNING]
> **Keine Sicherheitsfunktion.** Die WAGO-Integration steuert Ausgänge nur für betriebliche Zwecke. Sie ist nicht
> sicherheitsbewertet, kein Not-Halt und kein Personenschutz. Lesen Sie die [Sicherheitsgrenze](plugins/wago/safety-boundary.md),
> bevor Sie Anlagen anschließen. Der physische Einsatz ist bis
> [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) unqualifiziert.

## Voraussetzungen

- Eine bezahlte Attraccess-Lizenz, die das Lizenzmodul **`wago`** enthält. Das WAGO-Plugin ist ein kommerzielles Add-on:
  Der Schlüssel für gemeinnützige Nutzung schaltet es **nicht** frei, eine kostenlose Nutzung gibt es nicht. Ohne das
  Modul wird das Plugin nicht geladen und erscheint in **Einstellungen → Plugins** als **Lizenz fehlt**. Speichern Sie
  einen gültigen Lizenzschlüssel mit dem Modul, startet Attraccess neu und lädt das Plugin. Siehe
  [Plugins installieren](plugins/installing-plugins.md#lizenz-fehlt). Lizenzen:
  [contact@attraccess.org](mailto:contact@attraccess.org).
- Attraccess 1.11.0 oder neuer und das Plugin `wago`, installiert wie unter
  [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigungen `PLUGIN_STORAGE`,
  `ACCESS_MQTT_SERVERS`, `TRIGGER_FLOWS` und `MANAGE_SECRETS`.
- Ein in Attraccess eingerichteter [MQTT-Server](mqtt/server-setup.md), den der Controller erreichen kann.
- WAGO-CC100-Hardware (`751-9301`, Firmware 31) im selben privaten Netzwerk wie Attraccess. Die getestete Kompatibilität
  steht unter [Produktivbetrieb und Kompatibilität](plugins/wago/production-support.md).
- Optional: Modbus-Geräte an der RS-485-Schnittstelle des Controllers, zum Beispiel ein WAGO-879-3020-Zähler.

## Wo es erscheint

- **WAGO** in der Gruppe **Geräte** der Seitenleiste: Controller-Liste, Inbetriebnahme, Konfiguration, Live-Steuerung,
  Diagnose und Revisionsverlauf.
- WAGO-Knoten im [Flow-Editor](flows/node-types.md), einschließlich des WAGO-Ereignis-Triggers (siehe
  [Globale Flows](flows/global-flows.md)).

## Hier beginnen

| Seite                                                                     | Inhalt                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Geführte CC100-Inbetriebnahme](plugins/wago/cc100-commissioning.md)      | Einen Controller Schritt für Schritt in Betrieb nehmen              |
| [CC100-Docker-Laufzeit](plugins/wago/cc100-runtime.md)                    | Frontplatten-Konfiguration, Live-Steuerung, Laufzeit-Bereitstellung |
| [Produktivbetrieb und Kompatibilität](plugins/wago/production-support.md) | Getestete Kompatibilität, Broker-Einstellungen, Grenzwerte          |
| [Wiederherstellungs-Runbooks](plugins/wago/recovery-runbooks.md)          | Kompromittierte Zugangsdaten, Broker-Ausfall, Controller-Austausch  |
| [Bedrohungsmodell und Pen-Test-Briefing](plugins/wago/threat-model.md)    | Akteure, Vertrauensgrenzen, Angriffsflächen                         |
| [Sicherheitsgrenze](plugins/wago/safety-boundary.md)                      | Was die Integration nicht ist, mit Formulierungs-Checkliste         |

## Referenzseiten

- [Modbus RTU mit dem Zähler 879-3020](plugins/wago/879-3020-modbus-rtu.md)
- [Messwert-Vertrag](plugins/wago/measurement-contract.md)
- [Diagnose](plugins/wago/diagnostics.md)
- [Rotation der Zugangsdaten](plugins/wago/credential-rotation.md)
- [Audit-Integration](plugins/wago/audit-integration.md)
- [FW31-Unterstützungsgrenzen](plugins/wago/fw31-support.md)
- [Software der Inbetriebnahme-Plattform](plugins/wago/commissioning-platform.md)
- [Abnahmenachweise](plugins/wago/acceptance-evidence.md)
