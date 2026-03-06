# Mitwirken

Attraccess ist ein Open-Source-Projekt und freut sich über Beiträge aus der Community. Diese Anleitung erklärt, wie Sie sich beteiligen können.

## Quellcode

Der Quellcode wird auf GitHub gehostet:

**[github.com/attraccess/Attraccess](https://github.com/attraccess/Attraccess)**

## So können Sie beitragen

### 1. Repository forken

Erstellen Sie einen Fork des Attraccess-Repositorys auf GitHub.

### 2. Fork klonen

```bash
git clone https://github.com/ihr-benutzername/Attraccess.git
cd Attraccess
pnpm install
```

### 3. Feature-Branch erstellen

```bash
git checkout -b feature/ihr-feature-name
```

### 4. Änderungen vornehmen

Entwickeln Sie Ihr Feature oder Ihren Fix. Beachten Sie die unten aufgeführten Code-Style-Richtlinien.

### 5. Tests ausführen

```bash
pnpm nx test api
pnpm nx test frontend
```

### 6. Pull Request erstellen

Pushen Sie Ihren Branch und erstellen Sie einen Pull Request gegen den `main`-Branch des Original-Repositorys. Beschreiben Sie Ihre Änderungen klar in der Pull-Request-Beschreibung.

## Code-Style

- **Sprache:** TypeScript für den gesamten Frontend- und Backend-Code
- **Linting:** ESLint ist für das Projekt konfiguriert. Führen Sie Linting vor dem Einreichen aus:
  ```bash
  pnpm nx lint api
  pnpm nx lint frontend
  ```
- Folgen Sie den bestehenden Codemustern und Konventionen in der Codebasis

## Tests

- **Framework:** Jest wird für Unit-Tests verwendet
- Platzieren Sie Testdateien neben den Quelldateien, die sie testen (z. B. `my-service.spec.ts`)
- Schreiben Sie Tests für neue Features und Bugfixes

## Issue-Tracking

Issues werden auf GitHub verfolgt:

**[github.com/attraccess/Attraccess/issues](https://github.com/attraccess/Attraccess/issues)**

Prüfen Sie vor Beginn der Arbeit an einem Feature, ob bereits ein Issue existiert. Falls nicht, erstellen Sie eines, um die Änderung vor der Implementierung zu besprechen.

## Fehler melden

Wenn Sie einen Fehler melden, geben Sie bitte Folgendes an:

- Schritte zur Reproduktion des Problems
- Erwartetes Verhalten
- Tatsächliches Verhalten
- Attraccess-Version und Bereitstellungsmethode (Docker usw.)
- Browser und Betriebssystem (bei Frontend-Problemen)

## Feature-Anfragen

Feature-Anfragen sind willkommen. Erstellen Sie ein GitHub-Issue mit dem Label "feature request" und beschreiben Sie:

- Das Problem, das Sie lösen möchten
- Ihre vorgeschlagene Lösung
- Mögliche Alternativen, die Sie in Betracht gezogen haben

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte in der Entwicklung
- [Architektur](developer/architecture.md) – Projektstruktur
- [API-Referenz](developer/api-reference.md) – REST-API-Dokumentation
