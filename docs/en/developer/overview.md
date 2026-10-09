# Developer Overview

This guide helps you get started with Attraccess development. Attraccess is a source-available web application for machine access control and resource management in industry, R&D and universities.

Development, redistribution and commercial use are subject to the [modified Prosperity Public License 3.0](https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md). See [Licensing](getting-started/overview.md#licensing) for an English summary of the German license terms.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, TypeScript, HeroUI, TanStack Query, React Router |
| **Backend** | NestJS (Node.js), TypeScript |
| **Database** | SQLite with TypeORM |
| **Monorepo** | NX workspace |
| **Package Manager** | pnpm |
| **Containerization** | Docker |

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 24 or later | JavaScript runtime |
| **pnpm** | Latest | Package manager |
| **Git** | Latest | Version control |

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/attraccess/Attraccess.git
cd Attraccess
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Running dev servers

Use the port-resolving launcher:

```bash
pnpm serve
```

The launcher probes free ports starting from defaults (API 3000, Frontend 4200, Preview 4300) and prints them at startup. Run multiple instances concurrently without manual port juggling.

Flags:

- `--only=api` / `--only=frontend` / `--only=both` (default `both`)
- `PORT=<n>` to pin API; `VITE_PORT=<n>` to pin frontend (strict — fails if busy)

The Vite dev proxy is wired to whichever API port the launcher resolved.

The resolved ports are written to `.dev-serve-ports.json` at the repo root (gitignored, removed on exit). Read it to find the current ports without parsing the startup banner — e.g. `cat .dev-serve-ports.json | jq -r '.frontend.url'`.

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run tests with `pnpm nx test <project>`
4. Submit a pull request

## Project Structure

The repository is organized as an NX monorepo. See [Architecture](developer/architecture.md) for a detailed breakdown of all applications and libraries.

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm serve` | Start backend and frontend with the port-resolving launcher |
| `pnpm serve --only=api` | Start only the backend |
| `pnpm serve --only=frontend` | Start only the frontend |
| `pnpm nx test api` | Run backend tests |
| `pnpm nx test frontend` | Run frontend tests |
| `pnpm nx build api` | Build the backend for production |
| `pnpm nx build frontend` | Build the frontend for production |

## See Also

- [Architecture](developer/architecture.md) – Project structure and modules
- [API Reference](developer/api-reference.md) – REST API documentation
- [Contributing](developer/contributing.md) – How to contribute
