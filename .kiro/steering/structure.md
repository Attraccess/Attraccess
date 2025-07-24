# Project Structure

## Monorepo Organization

This is an Nx monorepo with a clear separation between applications and shared libraries.

```
├── apps/                    # Applications
│   ├── api/                 # NestJS backend API
│   ├── frontend/            # React frontend application
│   ├── attractap-config-ui/ # Configuration UI for Attractap devices
│   ├── attractap-firmware/  # ESP32 firmware for basic displays
│   └── attractap-touch-firmware/ # ESP32 firmware for touch displays
├── libs/                    # Shared libraries
│   ├── api-client/          # Auto-generated API client
│   ├── database-entities/   # Shared TypeORM entities
│   ├── env/                 # Environment configuration
│   ├── plugins-backend-sdk/ # Backend plugin development SDK
│   ├── plugins-frontend-sdk/# Frontend plugin development SDK
│   ├── plugins-frontend-ui/ # Shared UI components for plugins
│   └── react-query-client/  # React Query client setup
├── tools/                   # Development tools and generators
├── docs/                    # Documentation (hosted at docs.attraccess.org)
└── config/                  # Configuration files for services
```

## Application Structure

### Backend API (`apps/api/`)

```
src/
├── analytics/           # Analytics and reporting features
├── app/                 # Main application module
├── attractap/           # Hardware device management
├── common/              # Shared utilities and services
├── config/              # Configuration modules
├── database/            # Database setup and migrations
├── email/               # Email service and templates
├── email-template/      # MJML email template management
├── exceptions/          # Custom exception classes
├── mqtt/                # MQTT client and monitoring
├── plugin-system/       # Plugin management system
├── resources/           # Core resource management
├── types/               # TypeScript type definitions
└── users-and-auth/      # Authentication and user management
```

### Frontend (`apps/frontend/`)

```
src/
├── api/                 # API client and React Query setup
├── app/                 # Main application and routing
├── assets/              # Static assets
├── components/          # Reusable UI components
├── hooks/               # Custom React hooks
├── service-worker/      # PWA service worker
├── stores/              # Zustand state management
└── test-utils/          # Testing utilities
```

### Firmware (`apps/attractap-*-firmware/`)

```
src/
├── main.cpp             # Main application entry point
├── api.cpp/hpp          # API communication
├── display.cpp/hpp      # Display management
├── network*.cpp/hpp     # Network connectivity (WiFi/Ethernet)
├── nfc.cpp/hpp          # NFC/RFID functionality
└── web_server.cpp/hpp   # Configuration web server
```

## Shared Libraries Structure

### Database Entities (`libs/database-entities/`)
- Contains all TypeORM entity definitions
- Shared between API and any tools that need database access
- Includes validation decorators and Swagger documentation

### API Client (`libs/api-client/`)
- Auto-generated from OpenAPI specification
- Provides type-safe API client for frontend and external tools
- Regenerated automatically when API changes

### Plugin SDKs (`libs/plugins-*-sdk/`)
- Provide interfaces and utilities for plugin development
- Backend SDK: NestJS module interfaces, decorators
- Frontend SDK: React hooks, context providers
- UI Library: Shared components for consistent plugin UX

## Configuration Files

### Root Level
- `nx.json`: Nx workspace configuration
- `tsconfig.base.json`: Base TypeScript configuration
- `package.json`: Root package dependencies and scripts
- `eslint.config.cjs`: ESLint configuration for entire workspace

### Environment & Docker
- `.env.example`: Template for environment variables
- `docker-compose.dev.yml`: Development services (MQTT, email, etc.)
- `Dockerfile`: Production container configuration

## Naming Conventions

### Files and Directories
- Use kebab-case for directories and files
- Use PascalCase for React components
- Use camelCase for TypeScript files and functions
- Use UPPER_CASE for constants and environment variables

### Code Organization
- Group related functionality in modules/directories
- Separate concerns: controllers, services, DTOs, entities
- Use barrel exports (`index.ts`) for clean imports
- Keep test files adjacent to source files with `.spec.ts` suffix

### Database
- Entity names use PascalCase (e.g., `ResourceEntity`)
- Table names use snake_case (auto-generated from entities)
- Migration files follow timestamp pattern

## Import Paths

Use TypeScript path mapping for clean imports:
- `@attraccess/api-client` - API client library
- `@attraccess/database-entities` - Database entities
- `@attraccess/plugins-*-sdk` - Plugin SDKs
- Relative imports for files within the same application