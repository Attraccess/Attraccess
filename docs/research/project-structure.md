# Attraccess Project Structure Research

## Tech Stack
- **Frontend:** React 18+ (TypeScript), Vite, HeroUI (NextUI v2), TanStack Query, Tailwind CSS v4, Zustand, XyFlow, PWA
- **Backend:** NestJS, TypeORM, SQLite, WebSockets, MQTT.js, Passport.js
- **Firmware:** PlatformIO, ESP32, C/C++ Arduino
- **Monorepo:** NX + pnpm

## Branding
- Primary color: `#006FEE` (blue)
- Secondary color: `#7828c8` (purple)
- Logo: `/apps/frontend/public/logo.png`
- Login wallpaper: `/apps/frontend/public/login-wallpaper-blue.jpg`
- Favicon: `/apps/frontend/public/favicon.ico`

## Theme Colors
| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Primary | `#006FEE` | `#006FEE` |
| Secondary | `#7828c8` | `#9353d3` |
| Background | `#FFFFFF` | `#000000` |
| Text | `#11181C` | `#ECEDEE` |
| Success | `#17c964` | `#17c964` |
| Warning | `#f5a524` | `#f5a524` |
| Danger | `#f31260` | `#f31260` |

## Key Features
1. **Authentication:** Local login, SSO (OIDC/SAML), 2FA, email verification
2. **Resources:** CRUD, images, groups, maintenance, usage tracking, CSV export
3. **Flows:** Visual flow editor (xyflow) with HTTP, MQTT, Wait, Button, If, Error nodes
4. **Forms:** Dynamic form builder and responses
5. **Projects:** Multi-tenant, team members, invitations
6. **Attractap NFC:** Card management, reader devices, firmware OTA updates
7. **Billing:** License keys, SumUp payments, transactions
8. **MQTT:** Server configuration, IoT integration
9. **Plugins:** Upload/manage, frontend + backend SDKs
10. **Email:** Template editor, SMTP config
11. **Settings:** System configuration, cookie security
12. **User Management:** Admin user CRUD, roles

## Frontend Routes
- `/` → redirects to `/resources`
- `/resources` → Resource overview
- `/resources/:id` → Resource details (tabs: documentation, flows, forms)
- `/projects` → Project list
- `/projects/:id` → Project details
- `/messages` → Messages
- `/attractap/nfc-cards` → NFC cards
- `/attractap/readers` → Attractap readers
- `/devices/mqtt/servers` → MQTT servers
- `/devices/companion` → Companion app
- `/balena` → Balena fleets
- `/users` → User management
- `/billing` → Billing dashboard
- `/csv-export` → CSV export

Everything an admin configures lives behind the `/settings` shell, whose section
rail is driven by `apps/frontend/src/app/settings/layout/settingsSections.ts`:

- `/settings` → section index (phone list; on desktop it redirects to the first permitted section)
- `/settings/general` → base URLs and license
- `/settings/email` → SMTP transport (+ `/templates`, `/templates/:type`, `/layout`)
- `/settings/messaging` → message rate limits and push notifications
- `/settings/about` → version, updates and system information
- `/settings/security` → sign-in throttling, password policy, 2FA, signup domains
- `/settings/roles` → roles and permission sets
- `/settings/sso` → SSO providers (+ `/providers/new`, `/providers/:providerId`)
- `/settings/monitoring` → metrics endpoint and instrumentation
- `/settings/plugins` → plugin management

## API Modules
- resources, projects, users-and-auth, attractap, billing, mqtt, settings, email-template, plugin-system, analytics, license, encryption

## Database Entities (34 total)
Users, Sessions, Resources, Resource Groups, Resource Maintenance, Resource Usage, Resource Introductions, Resource Flow Nodes/Edges/Logs, Projects, Project Members, Project Invitations, Forms, NFC Cards, Attractap Devices, MQTT Servers, SSO Providers (OIDC/SAML), Email Templates, Settings, Billing Transactions, Resource Billing Configuration

## Firmware Variants
- attractap_lite_ethernet
- attractap_lite_ethernet_ota
- attractap_touch_wifi
- attractap_touch_wifi_ota
- attractap_touch_ethernet
- attractap_touch_ethernet_ota
