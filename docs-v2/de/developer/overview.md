# Entwickler-Überblick

Diese Anleitung hilft Ihnen beim Einstieg in die Attraccess-Entwicklung. Attraccess ist ein Open-Source-System zur Zugangsverwaltung in Makerspaces, das als moderne Webanwendung aufgebaut ist.

## Technologie-Stack

| Ebene | Technologie |
|-------|------------|
| **Frontend** | React, TypeScript, HeroUI, TanStack Query, React Router |
| **Backend** | NestJS (Node.js), TypeScript |
| **Datenbank** | SQLite mit TypeORM |
| **Monorepo** | NX Workspace |
| **Paketmanager** | pnpm |
| **Containerisierung** | Docker |

## Voraussetzungen

Stellen Sie sicher, dass folgende Software installiert ist:

| Tool | Version | Zweck |
|------|---------|-------|
| **Node.js** | 24 oder neuer | JavaScript-Laufzeitumgebung |
| **pnpm** | Aktuellste Version | Paketmanager |
| **Git** | Aktuellste Version | Versionskontrolle |

## Erste Schritte

### 1. Repository klonen

```bash
git clone https://github.com/attraccess/Attraccess.git
cd Attraccess
```

### 2. Abhängigkeiten installieren

```bash
pnpm install
```

### 3. Backend starten

```bash
pnpm nx serve api
```

Der API-Server startet standardmäßig unter `http://localhost:3000`. Die Swagger-Dokumentation ist unter `http://localhost:3000/api` verfügbar.

### 4. Frontend starten

In einem separaten Terminal:

```bash
pnpm nx serve frontend
```

Der Frontend-Entwicklungsserver startet unter `http://localhost:4200`. API-Anfragen werden automatisch an das Backend weitergeleitet.

## Entwicklungsablauf

1. Erstellen Sie einen Feature-Branch von `main`
2. Nehmen Sie Ihre Änderungen vor
3. Führen Sie Tests aus mit `pnpm nx test <projekt>`
4. Erstellen Sie einen Pull Request

## Projektstruktur

Das Repository ist als NX-Monorepo organisiert. Siehe [Architektur](developer/architecture.md) für eine detaillierte Beschreibung aller Anwendungen und Bibliotheken.

## Nützliche Befehle

| Befehl | Beschreibung |
|--------|-------------|
| `pnpm nx serve api` | Backend im Entwicklungsmodus starten |
| `pnpm nx serve frontend` | Frontend im Entwicklungsmodus starten |
| `pnpm nx test api` | Backend-Tests ausführen |
| `pnpm nx test frontend` | Frontend-Tests ausführen |
| `pnpm nx build api` | Backend für Produktion erstellen |
| `pnpm nx build frontend` | Frontend für Produktion erstellen |

## Siehe auch

- [Architektur](developer/architecture.md) – Projektstruktur und Module
- [API-Referenz](developer/api-reference.md) – REST-API-Dokumentation
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
