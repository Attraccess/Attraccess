# Attraccess

A comprehensive resource management system for tracking and managing access to shared resources.

## Features

- Resource Management
  - Track resource status, usage, and maintenance
  - Image support for resources with automatic resizing and caching
  - Role-based access control
  - Maintenance scheduling
  - Usage tracking and reporting

## Everything below is meant for developers

If you are looking for user documentation, take a look at https://docs.attraccess.org

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
4. Run database migrations:
   ```bash
   pnpm nx run api:migrations-run
   ```

## Development

Start the api and frontend in development mode (HMR):

```bash
pnpm nx run-many -t serve --projects=api,frontend
```

The API will be available at `http://localhost:3000`
and the Frontend at `http://localhost:4200`

## API Documentation

Swagger documentation is available at `/api` when the server is running.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Lizenz

Dieses Projekt ist **source-available** und steht unter einer modifizierten Version der [Prosperity Public License v3.0](./LICENSE.md).

### ✅ Erlaubt:
- Nutzung, Veränderung und Weitergabe für **Privatpersonen** und **gemeinnützige Organisationen**
- 30-tägige Testnutzung für **kommerzielle Nutzer**

### ❌ Nicht erlaubt:
- Kommerzielle Nutzung über 30 Tage hinaus **ohne kommerzielle Lizenz**
- Verwendung oder Verbreitung von Forks für kommerzielle Zwecke ohne Genehmigung
- Umlizensierung oder Änderung der Lizenzbedingungen

### 🛡️ Schutz vor Fork-Missbrauch
Alle Forks und abgeleiteten Projekte unterliegen denselben Lizenzbedingungen. Kommerzielle Nutzung ist auch in Forks **nicht erlaubt**, es sei denn, es liegt eine gültige Lizenz des ursprünglichen Autors vor.

### 🔍 MIT-lizenzierte Bestandteile
Dieses Projekt basiert teilweise auf einem MIT-lizenzierten Projekt. Diese Komponenten bleiben unter der MIT-Lizenz verfügbar. Details siehe [LICENSE-fabinfra.md](./LICENSE-fabinfra.md).

---

**Für kommerzielle Nutzung oder Lizenzanfragen:**  
Bitte kontaktiere [contact@attraccess.org](mailto:contact@attraccess.org).

this was written by openhands
