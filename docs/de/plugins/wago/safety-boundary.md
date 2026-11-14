# WAGO-Sicherheitsgrenze und Formulierungs-Checkliste
<!-- llms-description: Legt fest, dass die WAGO-Integration der betrieblichen Steuerung und keiner Sicherheitsfunktion dient, mit einer Formulierungs-Checkliste für Prüfer. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Die WAGO-Integration steuert Ausgänge für **betriebliche** Zwecke. Sie ist keine Sicherheitsfunktion, und kein Teil
davon wurde auf physischer Hardware qualifiziert. Diese Seite ist die einzige Referenz für diese Grenze. Prüfer
verwenden die folgende Checkliste, um zu bestätigen, dass jede Stelle, die die Grenze nennt, dasselbe aussagt, auf
Englisch und auf Deutsch.

## Die Grenze

1. **Nicht sicherheitsbewertet.** Die CC100-Laufzeit, das Plugin, die Freigabebedingungen, die Rückmeldungsprüfungen
   und die Trennungsrichtlinien sind kein Not-Halt, kein Personenschutz und kein Ersatz für zertifizierte
   Sicherheitsschaltungen.
2. **Sicherheitsschaltungen bleiben unabhängig.** Offizielle Not-Halt- und Sicherheitsschaltungen müssen ohne
   Attraccess verdrahtet bleiben und funktionieren.
3. **Nur betriebliche Steuerung.** Freigabebedingungen, Freigabeanforderungen, Rückmeldungs-Zeitlimits und
   Trennungsrichtlinien (`hold`, `immediate`, `watchdog`) verringern betriebliche Fehler. Sie machen einen Ausgang
   nicht sicher.
4. **Der physische Einsatz ist bis ATT-984 unqualifiziert.** Die Aussage zur unterstützten Hardware, ein CC100
   `751-9301` mit Firmware 31, beruht allein auf Software-Fixtures. Die Laborübungen wurden noch nicht durchgeführt.
   Die Hardware-Abnahme ist
   [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
5. **Ein Simulator ist keine Hardware.** Ergebnisse von Simulator, Fixtures und Zuverlässigkeits-Testumgebung sind als
   solche gekennzeichnet und sind nie ein Nachweis für einen physischen Controller.
6. **Bereit ist nicht qualifiziert.** Containerstart, ein aktueller Heartbeat und eine übereinstimmende Konfiguration
   belegen den Softwarezustand. Die physische Qualifizierung ist ein eigener, menschlicher Schritt.
7. **Modbus-Profile sind unqualifiziert.** Die eingebauten Profile sind Referenzen, bis isolierte Hardware-Nachweise
   vorliegen.
8. **Die Installation ist destruktiv.** Die Inbetriebnahme ersetzt die Controller-Software und deaktiviert CODESYS
   dauerhaft. Attraccess erstellt keine Sicherungskopie dessen, was vorher auf dem Controller war, bewahrt es nicht und stellt
   es nicht wieder her.
9. **Keine Zusicherung der Produktionsreife.** Ein Penetrationstest und eine externe Sicherheitsprüfung wurden nicht
   durchgeführt. Siehe [Bedrohungsmodell und Pen-Test-Briefing](plugins/wago/threat-model.md).
10. **Zurückgestellte Funktionen werden nicht beworben.** Die Qualifizierung aller vier Paket-Zusammenstellungen,
    Abrechnung, Telemetrie-Verlauf und Arbitrierung sind zurückgestellt und dürfen nicht als verfügbar beschrieben
    werden.

## Prüfer-Checkliste

Bestätigen Sie für jede Aussage, dass die Formulierung an jeder Stelle weiterhin der obigen Grenze entspricht und dass
der deutsche Text dieselbe Bedeutung hat (keine abgeschwächte). Die Einträge für `EN` und `DE` liegen in
`apps/plugins/wago/frontend/src/`.

| #   | Aussage                                                                  | Wo sie vorkommt                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nicht sicherheitsbewertet, kein Not-Halt und kein Personenschutz         | [Inbetriebnahme](plugins/wago/cc100-commissioning.md#sicherheitsgrenze), [Laufzeit](plugins/wago/cc100-runtime.md#sicherheitsgrenze), `HARDWARE.md`, `cc100-runtime/manifest.json` (`safetyRated: false`), `package.json`-Beschreibung, `channels.en.json` / `channels.de.json` (`safetyHint`)          |
| 2   | Sicherheitsschaltungen bleiben unabhängig                                | [Abnahmenachweis](plugins/wago/acceptance-evidence.md), [Laufzeit](plugins/wago/cc100-runtime.md#checkliste-zur-physischen-verifizierung)                                                                                                                                                              |
| 3   | Freigabebedingungen, Freigabeanforderungen und Trennungsrichtlinien sind nur betrieblich | [Laufzeit](plugins/wago/cc100-runtime.md#brokerverlust), `channels.*.json` (`guardHint`, `safetyHint`), `presets.*.json` (`guarded-enable-request`)                                                                                                                                       |
| 4   | Physischer Einsatz bis ATT-984 unqualifiziert                            | [Inbetriebnahme](plugins/wago/cc100-commissioning.md), [Laufzeit](plugins/wago/cc100-runtime.md), [Produktionsunterstützung](plugins/wago/production-support.md), `HARDWARE.md`, `manifest.json` (`releaseRequirement`), `commissioning.*.json` (`physicalQualification`), `managed-runtime.*.json` (`physical`) |
| 5   | Ein Simulator ist keine Hardware                                         | `README.simulator.md`, [Bedrohungsmodell](plugins/wago/threat-model.md), [Produktionsunterstützung](plugins/wago/production-support.md)                                                                                                                                                         |
| 6   | Bereit ist nicht qualifiziert                                            | [Inbetriebnahme](plugins/wago/cc100-commissioning.md), [FW31-Unterstützung](plugins/wago/fw31-support.md), [Rotation der Zugangsdaten](plugins/wago/credential-rotation.md), [Audit-Integration](plugins/wago/audit-integration.md)                                                              |
| 7   | Modbus-Profile sind unqualifiziert                                       | `HARDWARE.md`, [Messvertrag](plugins/wago/measurement-contract.md), `modbus.*.json` (`readonly`)                                                                                                                                                                                                |
| 8   | Die Installation ist destruktiv; keine Sicherung und keine Wiederherstellung | [Inbetriebnahme](plugins/wago/cc100-commissioning.md), `commissioning.*.json` (`destructiveDescription`, `approveInstall`), `security.*.json` (`codesysActive`)                                                                                                                              |
| 9   | Noch kein Pen-Test und keine externe Prüfung                             | [Bedrohungsmodell](plugins/wago/threat-model.md), [Produktionsunterstützung](plugins/wago/production-support.md)                                                                                                                                                                                |
| 10  | Zurückgestellte Funktionen werden nicht beworben                         | [Abnahmenachweis](plugins/wago/acceptance-evidence.md), [Produktionsunterstützung](plugins/wago/production-support.md)                                                                                                                                                                          |

### Audit-Protokoll

Das Audit ATT-988 umfasste `docs/en/plugins/wago/*.md`, `HARDWARE.md`, `README.simulator.md`, die englischen und
deutschen Frontend-Texte, `package.json`, `plugin.json` und `manifest.json`. Es hat Folgendes geändert:

- **Formulierung zur Sicherung (EN und DE).** `destructiveDescription` und Schritt 4 der
  [Inbetriebnahme-Anleitung](plugins/wago/cc100-commissioning.md#controller-in-betrieb-nehmen) forderten die Betreiber auf,
  „vorhandene Anwendungen zu sichern“ („back up existing applications"), was so klingt, als würde Attraccess das
  unterstützen. Beide Texte sagen jetzt, dass Attraccess sie weder sichert noch wiederherstellt und dass die Betreiber
  alles, was sie brauchen, selbst speichern müssen. Der deutsche Text verwendet das Verb „sichern“ nicht mehr, weil es
  sowohl „back up“ als auch „secure“ bedeutet und „sichert … nicht“ daher als „does not secure“ gelesen werden könnte.
  Er sagt jetzt „erstellt keine Sicherungskopie … und stellt sie nicht wieder her" („makes no backup copy … and does
  not restore them") und bittet die Betreiber, „alles, was du noch brauchst" („anything they still need") zu speichern,
  passend zum Englischen.
- **Privilegierter Modus.** Die Laufzeit-Seite beschrieb `privileged: true`. Das Manifest deklariert
  `privileged: false`; die Seite sagt jetzt, dass die manuellen `--privileged`-Befehle die historische Ausgangsbasis
  sind und nicht der unterstützte Weg.
- **Name des Hardwareprofils.** `HARDWARE.md` und die Seite zur Inbetriebnahme-Plattform nannten `...-digital-v1`; das
  Manifest nennt `...-digital-rtu-v1`. Beide stimmen jetzt überein.
- **Paketbeschreibung.** `package.json` nannte das Plugin „Official ... integration" ohne Grenze; sie nennt jetzt
  ausdrücklich nur betriebliche Steuerung und noch nicht für den physischen Einsatz qualifiziert.

`plugin.json` enthält keine beschreibenden Aussagen und musste nicht geändert werden. `manifest.json` nennt bereits
`safetyRated: false` und die ATT-984-Freigabeanforderung.
