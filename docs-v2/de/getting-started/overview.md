# Überblick

## Was ist Attraccess?

Attraccess ist eine Open-Source-Plattform zur Verwaltung von Ressourcen und Zugängen in Makerspaces, Werkstätten und FabLabs. Die Software läuft als Webanwendung auf Ihrem eigenen Server und kann von jedem Gerät mit einem Webbrowser genutzt werden.

## Hauptfunktionen

### Ressourcenverwaltung

Verwalten Sie alle Maschinen, Werkzeuge und Geräte in Ihrer Werkstatt an einem zentralen Ort. Jede Ressource hat eine eigene Detailseite mit Bild, Beschreibung und Dokumentation.

### Einweisungssystem

Legen Sie fest, dass Benutzer eine Einweisung erhalten müssen, bevor sie eine Ressource nutzen dürfen. Einweiser können anderen Benutzern den Zugang freischalten. Alle Einweisungen werden dokumentiert.

### Wartungsplanung

Planen Sie regelmäßige Wartungen für Ihre Ressourcen. Attraccess zeigt den aktuellen Wartungsstatus an und erinnert bei fälligen Wartungen.

### NFC-Zugangskontrolle

Mit dem **Attractap NFC-Leser** können Sie den physischen Zugang zu Maschinen über NFC-Karten steuern. Benutzer halten ihre Karte an den Leser, und Attraccess prüft die Berechtigung.

### Flows & Automatisierung

Erstellen Sie visuelle Automatisierungen mit dem Flow-Editor. Verbinden Sie Aktionen wie HTTP-Anfragen, MQTT-Nachrichten und Bedingungen zu automatischen Abläufen.

### Projekte

Organisieren Sie Ihre Arbeit in Projekten. Laden Sie Teammitglieder ein und verwalten Sie projektbezogene Berechtigungen.

### Abrechnung

Erstellen Sie nutzungsbasierte Abrechnungen für Ihre Ressourcen. Die integrierte Abrechnungsfunktion unterstützt verschiedene Preismodelle.

### Plugin-System

Erweitern Sie Attraccess mit Plugins. Das Plugin-System bietet SDKs für Frontend- und Backend-Erweiterungen.

## Technologie

Attraccess besteht aus:

- **Webanwendung** – React-Frontend mit NestJS-Backend
- **Datenbank** – SQLite (keine separate Datenbank nötig)
- **NFC-Hardware** – Attractap-Leser (ESP32-basiert, optional)
- **Bereitstellung** – Docker-Container

## Nächste Schritte

- [Systemanforderungen](getting-started/requirements.md) prüfen
- [Schnellstart](getting-started/quick-start.md) – Attraccess installieren und starten
