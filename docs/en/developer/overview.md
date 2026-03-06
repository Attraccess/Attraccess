# Developer Overview

This guide helps you get started with Attraccess development. Attraccess is an open-source makerspace access management system built as a modern web application.

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

### 3. Start the Backend

```bash
pnpm nx serve api
```

The API server starts on `http://localhost:3000` by default. Swagger documentation is available at `http://localhost:3000/api`.

### 4. Start the Frontend

In a separate terminal:

```bash
pnpm nx serve frontend
```

The frontend development server starts on `http://localhost:4200`. It automatically proxies API requests to the backend.

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
| `pnpm nx serve api` | Start the backend in development mode |
| `pnpm nx serve frontend` | Start the frontend in development mode |
| `pnpm nx test api` | Run backend tests |
| `pnpm nx test frontend` | Run frontend tests |
| `pnpm nx build api` | Build the backend for production |
| `pnpm nx build frontend` | Build the frontend for production |

## See Also

- [Architecture](developer/architecture.md) – Project structure and modules
- [API Reference](developer/api-reference.md) – REST API documentation
- [Contributing](developer/contributing.md) – How to contribute
