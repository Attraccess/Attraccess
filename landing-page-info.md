# Attraccess – Landing Page Information

## 1. Elevator Pitch

A modern, open-source **resource management & access-control platform** that bridges the physical and digital worlds. Attraccess tracks usage, automates processes, and integrates seamlessly with IoT devices – all while being fully extensible through a powerful plugin system.

## 2. Core Value Proposition

• **Centralise every resource in one place** – equipment, rooms, tools, IoT devices, and more.  
• **Real-time status monitoring** via Server-Sent Events & MQTT – no polling required.  
• **Visual flow automation** (if-this-then-that) to trigger actions like webhooks, MQTT messages, or timed waits.  
• **Extensible** frontend & backend plugin architecture – add features without touching the core.  
• **Docker-first deployment** with single-container or Compose/Nightly images.

## 3. Highlight Features

| Category            | Capabilities                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource Management | ‑ CRUD, images <br/>- Maintenance scheduling & reminders <br/>- Usage tracking with start/stop/take-over events                                                                                                                                 |
| Automation Flows    | ‑ Drag-drop node editor <br/>- Event triggers (usage started/stopped/take-over) <br/>- Actions: HTTP requests, MQTT publish, wait/sleep, more via plugins <br/>- Per-resource execution logs & SSE live viewer                                  |
| Access Control      | ‑ JWT auth, sessions, refresh tokens <br/>- permissions <br/>- Optional SSO providers (OAuth/OIDC)                                                                                                                                              |
| IoT Integration     | ‑ ESPHome component (`attraccess_resource`) <br/>- FabReader open-hardware firmware (ESP32/ESP8266) <br/>- MQTT broker support <br/>- Live dashboard & configuration UI                                                                         |
| Developer UX        | ‑ Swagger / OpenAPI (`/api`, `/api-json`) <br/>- Auto-generated TS clients (`@attraccess/api-client` & `@attraccess/react-query-client`) <br/>- Nx monorepo with pnpm, ESLint, Prettier, Vitest/Jest <br/>- Comprehensive docs & code-gen tools |
| Extensibility       | ‑ Module Federation React plugins (frontend) <br/>- Dynamic NestJS modules (backend) <br/>- Version-checked `plugin.json` manifest <br/>- Shared UI kit (`@attraccess/plugins-frontend-ui`)                                                     |
| Deployment          | ‑ Single Docker image (`fabaccess/attraccess`) <br/>- Tags: `latest`, `nightly-latest`, versioned & commit-pinned <br/>- Beginner-friendly install, Compose & Portainer guides                                                                  |

## 4. Tech Stack

**Backend**: NestJS · TypeORM (SQLite/MySQL/Postgres) · MQTT · EventEmitter · Swagger · Jest  
**Frontend**: React 18 · Vite · Tailwind CSS · Zustand · React Query · React Router · i18next  
**Infra**: Nx 21 monorepo · pnpm · Docker · GitHub Actions CI/CD  
**IoT**: ESPHome · C++/PlatformIO firmware (FabReader) · WebSockets/MQTT

## 5. Repository Layout (High Level)

```
apps/
  api/                # NestJS REST API (src/…)
  frontend/           # React SPA
  fabreader-config-ui/ # Web UI flashed onto FabReader devices
  fabreader-firmware/  # C++ firmware for NFC reader hardware
libs/
  database-entities/  # Shared TypeORM entities
  api-client/         # Auto-generated fetch client
  react-query-client/ # React Query wrappers
  plugins-*/          # SDKs & UI toolkit for plugin authors
```

## 6. Key Modules Worth Showcasing

- **Resource Flows** (`apps/api/src/resources/flows`) – Node-based engine with cron cleanup & SSE log streaming.
- **Plugin System** (`apps/api/src/plugin-system` & corresponding libs) – Hot-loads compiled plugins, checks version ranges.
- **MQTT Integration** (`apps/api/src/mqtt`) – Wrapper around async-mqtt with server registry & monitoring.
- **Users & Auth** – Local auth, JWT issuance, strategies layer ready for SSO.
- **Email Service** – MJML/Handlebars templates, SMTP configurable.

## 7. Deployment & Installation Hooks

1. `docker run -d -p 3000:3000 fabaccess/attraccess:latest` for an instant demo.
2. Compose & Portainer examples in `/docs/setup/*`.
3. Environment variables: `AUTH_JWT_SECRET`, SMTP settings, `VITE_ATTRACCESS_URL`, log levels.

## 8. Integrations & Ecosystem

- **ESPHome** external component for real-time sensor/binary-sensor updates (no polling).
- **FabReader** hardware: open-source NFC reader that locks/unlocks machines based on Attraccess permissions.
- GitHub Packages & Docker Hub images.

## 9. Call-to-Action Ideas for Landing Page

1. "Get Started in 5 minutes" – one-liner Docker command.
2. Live demo GIF of real-time flow logs & resource dashboard.
3. Hardware showcase (FabReader) with link to build guide.
4. Quote/testimonial from a makerspace or lab.
5. Badge strip: **Open Source** · MIT License · **Docker Ready** · Plugin Architecture · IoT Friendly.

## 10. Useful Links

- GitHub Repo: https://github.com/FabInfra/Attraccess
- Full Documentation: `/docs` (served via docsify)
- OpenAPI UI: `/api`
- ESPHome Components: https://github.com/FabInfra/Attraccess-esphome-components

---

_This file is auto-generated to aid the design of a future marketing/landing page._
