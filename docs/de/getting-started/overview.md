# Überblick

## Was ist Attraccess?

Attraccess ist eine Plattform mit öffentlich einsehbarem Quellcode (source-available) für Maschinenzugang und Ressourcenverwaltung in Industrie, Forschung und Hochschulen. Sie verbindet Berechtigungen und Einweisungen mit Maschinenzugang, Nutzungsnachweisen und vorbeugender Wartung. Die Software läuft als Webanwendung auf Ihrer eigenen Infrastruktur und kann auf Desktops, Tablets und Smartphones genutzt werden.

## Hauptfunktionen

### Ressourcenverwaltung

Verwalten Sie Maschinen, Werkzeuge, Arbeitsplätze und Türen in Produktionsbereichen, Forschungslaboren und Hochschuleinrichtungen an einem zentralen Ort. Jede Ressource hat eine eigene Detailseite mit Bild, Beschreibung und Dokumentation.

### Qualifikationen & Einweisungen

Dokumentieren Sie Einweisungen und erteilen Sie Zugangsberechtigungen pro Maschine oder Ressourcengruppe. Autorisierte Einweiser erfassen und widerrufen Einweisungen; Aufsichtsmodi unterstützen Schulungen an der Maschine.

### Wartungsplanung

Planen Sie regelmäßige Wartungen für Ihre Ressourcen. Attraccess zeigt den aktuellen Wartungsstatus an und erinnert bei fälligen Wartungen.

### RFID-Zugangskontrolle

Mit dem **Attractap RFID-Leser** können Sie den physischen Zugang zu Maschinen über RFID-Karten steuern. Benutzer halten ihre Karte an den Leser, und Attraccess prüft die Berechtigung.

### Maschinenintegration & Automatisierung

Verbinden Sie Maschinen über das WAGO-SPS-Plugin oder erstellen Sie visuelle Automatisierungen mit dem Flow-Editor. Verknüpfen Sie Zugangsentscheidungen und Nutzungssitzungen über MQTT oder HTTP mit Gerätesteuerungen und Statussignalen.

### Projekte

Organisieren Sie Produktions-, Entwicklungs- und Forschungsarbeiten in Projekten. Laden Sie Teammitglieder ein, verwalten Sie projektbezogene Berechtigungen und ordnen Sie Maschinensitzungen Projekten zu.

### Nutzungsnachweise & Auswertungen

Erfassen Sie, wer welche Maschine wann und wie lange genutzt hat. Exportieren Sie Nutzungsdaten als CSV für betriebliche Auswertungen und Projektanalysen.

### IT & Betrieb

Binden Sie Ihren vorhandenen Identitätsanbieter über [OIDC oder SAML](user-management/sso-overview.md) an, ordnen Sie Gruppen Rollen zu, prüfen Sie [Audit-Protokolle](settings/audit-log.md) und überwachen Sie die Anwendung mit [Prometheus und Grafana](monitoring/overview.md).

### Abrechnung

Erstellen Sie nutzungsbasierte Abrechnungen für Ihre Ressourcen. Die integrierte Abrechnungsfunktion unterstützt verschiedene Preismodelle.

### Plugin-System

Erweitern Sie Attraccess mit Plugins. Das Plugin-System bietet SDKs für Frontend- und Backend-Erweiterungen.

## Technologie

Attraccess besteht aus:

- **Webanwendung** – React-Frontend mit NestJS-Backend
- **Datenbank** – SQLite (keine separate Datenbank nötig)
- **RFID-Hardware** – Attractap-Leser (ESP32-basiert, optional)
- **Bereitstellung** – Docker-Container

## Lizenzierung

Attraccess ist **source-available** unter der [modifizierten Prosperity Public License 3.0](https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md).

- **Kommerzielle Nutzung**, einschließlich interner Nutzung in Unternehmen, erfordert nach einer kostenlosen Testphase von bis zu **30 Tagen** eine kommerzielle Lizenz.
- **Nicht-kommerzielle Nutzung** durch Privatpersonen und gemeinnützige Organisationen ist im Rahmen der Lizenzbedingungen kostenlos.
- **Forks und weitergegebene Änderungen** unterliegen denselben Lizenzbedingungen. Separat lizenzierte Komponenten behalten ihre jeweilige Lizenz.

Für kommerzielle Lizenzen und Unterstützung bei der Integration wenden Sie sich an [contact@attraccess.org](mailto:contact@attraccess.org). Die vollständigen Bedingungen finden Sie in der verlinkten Lizenz.

### Aktivierung

Die Aktivierung lizenzierter Funktionen benötigt einen Lizenzschlüssel, auch bei kostenlosen Installationen. Tragen Sie ihn im Feld **Lizenzschlüssel** des [Einrichtungsassistenten](setup/first-time-setup.md) oder unter **Einstellungen → Anwendungseinstellungen** ein. Bei einer neuen Installation können Sie auch die [Umgebungsvariable](installation/environment-variables.md) `LICENSE_KEY` setzen, bevor die Datenbank initialisiert wird. Bestehende Installationen verwenden den gespeicherten Schlüssel; ändern Sie ihn in den Einstellungen statt über die Umgebungsvariable.

Für zulässige nicht-kommerzielle Nutzung kopieren Sie nach Prüfung der Lizenzbedingungen den folgenden speziellen Schlüssel exakt:

```text
I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md
```

Für eine kommerzielle Testphase oder kommerzielle Nutzung fordern Sie einen Lizenzschlüssel bei [contact@attraccess.org](mailto:contact@attraccess.org) an.

## Nächste Schritte

- [Systemanforderungen](getting-started/requirements.md) prüfen
- [Schnellstart](getting-started/quick-start.md) – Attraccess installieren und starten
