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

### 3. Entwicklungsserver starten

Den port-auflösenden Launcher verwenden:

```bash
pnpm serve
```

Der Launcher sucht freie Ports beginnend bei den Standardwerten (API 3000, Frontend 4200, Preview 4300) und gibt sie beim Start aus. Mehrere Instanzen können gleichzeitig laufen, ohne dass Ports manuell konfiguriert werden müssen.

Flags:

- `--only=api` / `--only=frontend` / `--only=both` (Standard `both`)
- `PORT=<n>` fixiert den API-Port; `VITE_PORT=<n>` fixiert das Frontend (strikt — bricht ab, falls belegt)

Der Vite-Dev-Proxy wird automatisch auf den vom Launcher gewählten API-Port konfiguriert.

Die ermittelten Ports werden außerdem in `.dev-serve-ports.json` im Repo-Stammverzeichnis geschrieben (gitignored, beim Beenden entfernt). Lies diese Datei, um die aktuellen Ports zu finden, ohne das Start-Banner zu parsen — z. B. `cat .dev-serve-ports.json | jq -r '.frontend.url'`.

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
| `pnpm serve` | Backend und Frontend mit dem Port-auflösenden Launcher starten |
| `pnpm serve --only=api` | Nur das Backend starten |
| `pnpm serve --only=frontend` | Nur das Frontend starten |
| `pnpm nx test api` | Backend-Tests ausführen |
| `pnpm nx test frontend` | Frontend-Tests ausführen |
| `pnpm nx build api` | Backend für Produktion erstellen |
| `pnpm nx build frontend` | Frontend für Produktion erstellen |

## Siehe auch

- [Architektur](developer/architecture.md) – Projektstruktur und Module
- [API-Referenz](developer/api-reference.md) – REST-API-Dokumentation
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
