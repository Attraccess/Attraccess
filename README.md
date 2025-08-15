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

## Licensing & Activation

Attraccess includes license verification. Set your license key via the `LICENSE_KEY` environment variable.

- Commercial users: Use the license key you received after purchasing a license.
- Non-profit organizations: You can use Attraccess for free by setting `LICENSE_KEY` to the following special key:

```
I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md
```

### How to set `LICENSE_KEY`

- Shell / local `.env` file

```bash
export LICENSE_KEY="I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md"
```

- Docker Compose

```yaml
services:
  attraccess:
    image: attraccess/attraccess:latest
    environment:
      LICENSE_KEY: 'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md'
```

- Docker CLI

```bash
docker run -e LICENSE_KEY="I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md" attraccess/attraccess:latest
```

If `LICENSE_KEY` is not provided at startup, the application will fail fast with an error. The error message includes guidance for non-profits on how to set the special key to use Attraccess for free.

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
