# Glossar

Dieses Glossar erklärt wichtige Begriffe, die in der Attraccess-Dokumentation verwendet werden.

## Allgemeine Begriffe

| Begriff | Beschreibung |
|---------|-------------|
| **Ressource** | Eine Maschine, ein Werkzeug, ein Gerät oder eine Tür, die in Attraccess verwaltet wird. Ressourcen können gebucht, nachverfolgt und zugangsgesteuert werden. |
| **Einweisung** | Eine Sicherheitsunterweisung, die einem Benutzer die Erlaubnis zur Nutzung einer bestimmten Ressource erteilt. Einweisungen werden typischerweise persönlich an der Maschine durchgeführt. |
| **Einweiser** | Eine Person, die berechtigt ist, Einweisungen für eine Ressource zu erteilen. Einweiser bestätigen, dass ein Benutzer eine Sicherheitsunterweisung erhalten hat und die Maschine sicher bedienen kann. |
| **Nutzungssitzung** | Ein aufgezeichneter Zeitraum, in dem ein Benutzer eine Ressource aktiv nutzt. Sitzungen haben eine Start- und Endzeit. |
| **Flow** | Ein visueller Automatisierungsablauf, der im Flow-Editor erstellt wird. Flows verbinden Auslöser, Aktionen und Bedingungen, um Aufgaben zu automatisieren. |
| **Projekt** | Eine Möglichkeit, Arbeit und Teamzusammenarbeit zu organisieren. Nutzungssitzungen können zur Nachverfolgung mit Projekten verknüpft werden. |

## Hardware

| Begriff | Beschreibung |
|---------|-------------|
| **Attractap** | Die NFC-Kartenleser-Hardware, die mit Attraccess verwendet wird. Sie basiert auf dem ESP32-Mikrocontroller und liest NFC-Karten, um Benutzer an Maschinen zu identifizieren. |
| **NFC** | Near Field Communication (Nahfeldkommunikation) – eine drahtlose Kurzstreckentechnologie für kontaktlose Identifikation, z. B. das Halten einer Karte an einen Leser. |

## Protokolle & Standards

| Begriff | Beschreibung |
|---------|-------------|
| **MQTT** | Message Queuing Telemetry Transport – ein leichtgewichtiges Nachrichtenprotokoll, das häufig für IoT-Geräte (Internet der Dinge) verwendet wird. Attraccess nutzt MQTT zur Kommunikation mit Hardware und Automatisierungssystemen. |
| **SSO** | Single Sign-On (Einmalanmeldung) – ein Mechanismus, der es Benutzern ermöglicht, sich einmalig bei einem zentralen Identitätsanbieter anzumelden und auf mehrere Anwendungen zuzugreifen, ohne sich erneut anmelden zu müssen. |
| **OIDC** | OpenID Connect – ein Authentifizierungsprotokoll, das auf OAuth 2.0 aufbaut. Es ist eine der von Attraccess unterstützten SSO-Methoden. |
| **SAML** | Security Assertion Markup Language – ein XML-basierter Standard zum Austausch von Authentifizierungsdaten zwischen einem Identitätsanbieter und einem Dienstanbieter. Es ist eine der von Attraccess unterstützten SSO-Methoden. |
| **TOTP** | Time-based One-Time Password (zeitbasiertes Einmalpasswort) – ein Algorithmus, der einen temporären Code (typischerweise sechs Ziffern) erzeugt, der sich alle 30 Sekunden ändert. Wird für Zwei-Faktor-Authentifizierung (2FA) mit Authenticator-Apps verwendet. |
| **REST-API** | Representational State Transfer Application Programming Interface – die Webschnittstelle, über die Attraccess seine Funktionalität für den programmatischen Zugriff bereitstellt. |
| **OpenAPI** | Ein Spezifikationsformat zur Beschreibung von REST-APIs. Attraccess verwendet OpenAPI (Swagger) zur Dokumentation seiner API-Endpunkte. |

## Web & Mobil

| Begriff | Beschreibung |
|---------|-------------|
| **PWA** | Progressive Web App – eine Webanwendung, die auf dem Startbildschirm eines Geräts installiert und wie eine native App genutzt werden kann. Attraccess ist eine PWA. |

## Siehe auch

- [Häufige Probleme](faq/common-issues.md) – Fehlerbehebung
- [Überblick](getting-started/overview.md) – Was ist Attraccess?
