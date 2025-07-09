---
name: Attraccess Repository Guidelines
description: Provides general information and guidelines for working with the Attraccess monorepo.
---

# Attraccess Repository Guidelines

## 1. Project Overview

- **What is Attraccess?** Attraccess is a comprehensive management application designed for makerspaces, FabLabs, and other shared workspaces. It allows administrators to define and manage 'resources,' which can represent physical machines (like 3D printers or laser cutters), tools, access points (like doors), or any other shared asset. The system controls user access to these resources. Users can initiate and terminate usage sessions, which can trigger IoT integrations (via MQTT, webhooks, etc.) to physically unlock, start, or open the corresponding resource. All usage is logged, providing administrators with data for usage analysis, billing (with a dedicated payment module planned for the future), and a future maintenance module that will manage resource availability based on maintenance schedules.
- **Main Purpose/Goal:** To provide a centralized and automated system for managing access to shared resources in collaborative workspaces, improving operational efficiency, ensuring fair usage, and enabling data-driven insights for administration and future planning (e.g., billing, maintenance).
- **Key Features:**
  - Web application (React frontend, NestJS backend)
  - Hardware component (Attractap NFC card reader/writer/terminal located in `apps/attractap-firmware`)
  - Monorepo structure managed by NX
  - Plugin architecture (see `libs/plugins-*`)

## 2. Tech Stack

- **Monorepo Management:** NX
- **Package Manager:** pnpm
- **Frontend:** React, TypeScript
- **Backend (API):** NestJS, TypeScript
- **Hardware (Attractap Firmware):** C++, PlatformIO
- **Database:** TypeORM, supporting SQLite (default) and PostgreSQL. Configuration in `apps/api/src/database/datasource.ts`. Entities in `libs/database-entities`.
- **Other Key Libraries/Frameworks:**
  - React Query (client-side data fetching and caching, see `libs/react-query-client`)
  - HeroUI (primary frontend component library, aiming for minimal custom styling for a unified UX)
  - i18next (frontend internationalization/translations)
  - Passport.js (authentication middleware for NestJS backend)
  - Zustand (client-side state management, often used with React Query)

## 3. Common Commands

You can discover all available commands (targets) for a specific NX-managed project by running:
`pnpm nx show project <project-name> --json`
(e.g., `pnpm nx show project api --json`)

Common commands are run via `pnpm nx <target> <project-name> [options]` or `pnpm nx run <project-name>:<target> [options]`.

- **Running Development Servers:**
  - API (NestJS): `pnpm nx serve api`
  - Frontend (React/Vite): `pnpm nx serve frontend`
  - both together: `pnpm nx run-many -t serve --projects=api,frontend`
- **Building for Production:**
  - API: `pnpm nx build api`
  - Frontend: `pnpm nx build frontend`
  - Build all changed projects: `pnpm nx run-many --target=build`
- **Running Tests:**
  - API (unit tests): `pnpm nx test api`
  - API (e2e tests): `pnpm nx e2e api`
  - Frontend: `pnpm nx test frontend`
  - Run tests for all projects: `pnpm nx run-many --target=test`
- **Linting:**
  - API: `pnpm nx lint api`
  - Frontend: `pnpm nx lint frontend`
  - Lint all projects: `pnpm nx run-many --target=lint`
- **Database Migrations (API project, TypeORM):**
  - Generate a new migration: `pnpm nx migration-generate api --name <path to the migration>` (Note: you should run the pending migrations first, also this only picks up changes to entities, so you should modify them to your needs before running this.)
  - Run pending migrations: `pnpm nx migrations-run api`
- **Frontend React-Query-Client:**
  - regenerate from current api openapi spec: `pnpm nx build react-query-client --skipNxCache`
- **Viewing Project Graph:**
  - `pnpm nx graph`

For Attractap firmware commands (PlatformIO), see section 8. These are not run via NX.

## 4. Directory Structure Overview (Monorepo)

- `apps/`: Contains the applications.
- `libs/`: Contains shared libraries used by applications (e.g., `api-client`, `database-entities`, `plugins-*`, `react-query-client`).
- `tools/`: Contains workspace-specific tooling, scripts.
- `nx.json`: NX workspace configuration.
- `package.json`: Root package configuration, including pnpm version.

## 5. Coding Conventions/Style Guide

- **Commit Messages:** Follow Conventional Commits format. The scope of the commit should be the issue identifier (e.g., `feat(PROJ-123): <summary>`, `fix(GH-45): <summary>`).

## 6. Deployment

- Deployment is automated via GitHub Actions. Pushing to any Pull Request branch will trigger actions that build and push Docker images for relevant applications (e.g., `api`, `frontend`). The success of these actions indicates a successful deployment/build of the pushed changes.

## 7. Attractap Hardware Component

- **Location:** `apps/attractap-firmware`
- **Build System:** PlatformIO (config: `apps/attractap-firmware/platformio.ini`)
- **Key tasks** (run from `/workspace/Attraccess/apps/attractap-firmware/`):
  - Building firmware: `platformio run`
  - Uploading firmware: `platformio run --target upload`
  - Monitoring serial output: `platformio device monitor`
