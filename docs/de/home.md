# Attraccess Dokumentation

Willkommen zur offiziellen Dokumentation von **Attraccess** – Maschinenzugang und Ressourcenverwaltung für Industrie, Forschung und Hochschulen.

## Was ist Attraccess?

Attraccess hilft Ihnen, Maschinen, Werkzeuge, Arbeitsplätze und Türen in Produktionsbetrieben, Forschungslaboren und Hochschulwerkstätten zu verwalten. Steuern Sie den Zugang anhand von Berechtigungen und dokumentierten Einweisungen, verbinden Sie Geräte über SPS-Steuerungen und Automatisierungsabläufe und erfassen Sie, wer welche Ressource wann und für welches Projekt genutzt hat.

Betreiben Sie Attraccess auf Ihrer eigenen Infrastruktur, binden Sie Ihren Identitätsanbieter an und unterstützen Sie den Betriebsalltag mit Nutzungsnachweisen, Wartungsplänen und Audit-Protokollen.

Attraccess ist **source-available** unter der [modifizierten Prosperity Public License 3.0](https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md). Kommerzielle Nutzung erfordert nach einer 30-tägigen Testphase eine Lizenz; nicht-kommerzielle Nutzung ist im Rahmen der Lizenzbedingungen kostenlos. Auch kostenlose Installationen benötigen einen Lizenzschlüssel. Weitere Informationen finden Sie unter [Lizenzierung und Aktivierung](getting-started/overview.md#lizenzierung).

## Für wen ist diese Dokumentation?

| Zielgruppe | Empfohlene Abschnitte |
|------------|----------------------|
| **Bedienpersonal, Forschende & Studierende** | [Endbenutzer-Anleitung](end-user/overview.md), [Leser benutzen](attractap/using-the-reader.md) |
| **Produktions- & Laborleitung, Sicherheitsbeauftragte** | [Ressourcen](resources/overview.md), [Einweisungen](resources/introductions.md), [Nutzung exportieren](resources/csv-export.md) |
| **Wartungs- & Automatisierungsteams** | [Wartung](resources/maintenance.md), [Flows](flows/overview.md), [Formulare](forms/overview.md) |
| **Administratoren** | [Ersteinrichtung](setup/first-time-setup.md), [Benutzerverwaltung](user-management/overview.md), [Einstellungen](settings/overview.md) |
| **IT-Administratoren** | [Installation](installation/docker-compose.md), [SSO](user-management/sso-overview.md), [Monitoring](monitoring/overview.md), [Audit-Protokoll](settings/audit-log.md) |
| **Entwickler** | [Entwickler-Dokumentation](developer/overview.md), [API-Referenz](developer/api-reference.md) |

## Schnelleinstieg

1. **[Systemanforderungen](getting-started/requirements.md)** prüfen
2. **[Schnellstart](getting-started/quick-start.md)** – Attraccess in wenigen Minuten starten
3. **[Ersteinrichtung](setup/first-time-setup.md)** – Grundkonfiguration vornehmen

## Funktionsübersicht

- **Ressourcenverwaltung** – Maschinen, Werkzeuge und Geräte verwalten
- **Qualifikationen & Zugangssteuerung** – Dokumentierte Einweisungen und Berechtigungen pro Ressource oder Ressourcengruppe
- **Ausweiszugang** – Physischer Zugang über Attractap RFID-Leser
- **Wartungsplanung** – Vorbeugende Wartung nach Zeit, Nutzungsstunden oder Sitzungsanzahl planen
- **Maschinen- & SPS-Integration** – WAGO-Steuerungen anbinden und Geräte über MQTT oder HTTP automatisieren
- **Projekte & Nutzungsnachweise** – Sitzungen Projekten zuordnen und Nutzungsdaten als CSV exportieren
- **SSO-Integration** – Anmeldung über OIDC oder SAML mit Zuordnung von Gruppen zu Rollen
- **Audit-Protokoll & Monitoring** – Sensible Änderungen nachverfolgen und den Betrieb mit Prometheus und Grafana überwachen
- **Abrechnung** – Nutzungsbasierte Abrechnung
- **Plugin-System** – Funktionen durch Plugins erweitern
- **Progressive Web App** – Auch auf Mobilgeräten nutzbar
