# Technology Stack

## Build System & Monorepo

- **Nx**: Monorepo management and build orchestration
- **pnpm**: Package manager (required >= 8.0.0)
- **Node.js**: Runtime environment (required >= 20.10.0)

## Backend (API)

- **Framework**: NestJS with Express
- **Language**: TypeScript
- **Database**: TypeORM with SQLite (default) or PostgreSQL support
- **Authentication**: Passport.js with JWT, Local, and OpenID Connect strategies
- **Real-time**: WebSockets and MQTT (Eclipse Mosquitto)
- **Email**: Nodemailer with MJML templates
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest with Supertest

## Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router DOM
- **State Management**: Zustand + TanStack Query (React Query)
- **UI Components**: HeroUI (NextUI-based) + Tailwind CSS
- **Icons**: Lucide React
- **PWA**: Vite PWA plugin with Workbox
- **Testing**: Jest + React Testing Library

## Firmware (ESP32)

- **Platform**: PlatformIO with Arduino framework
- **Target**: ESP32-C3 and various ESP32 display boards
- **Connectivity**: WiFi and Ethernet support
- **Display**: SH1106 OLED, various TFT displays
- **NFC**: PN532 with NTAG424 support
- **File System**: LittleFS

## Shared Libraries

- **API Client**: Auto-generated from OpenAPI spec
- **Database Entities**: Shared TypeORM entities
- **Plugin SDKs**: Frontend and backend plugin development kits

## Development Tools

- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Git Hooks**: Husky
- **CI/CD**: GitHub Actions
- **Containerization**: Docker with Docker Compose

## Common Commands

### Development Setup
```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development services (MQTT, email, etc.)
pnpm nx run api:start-services

# Run database migrations
pnpm nx run api:migrations-run
```

### Development
```bash
# Start API and frontend in development mode
pnpm nx run-many -t serve --projects=api,frontend

# Start individual services
pnpm nx serve api        # API at http://localhost:3000
pnpm nx serve frontend   # Frontend at http://localhost:4200
```

### Building
```bash
# Build all projects
pnpm nx run-many -t build

# Build specific project
pnpm nx build api
pnpm nx build frontend
```

### Testing
```bash
# Run all tests
pnpm nx run-many -t test

# Run tests for specific project
pnpm nx test api
pnpm nx test frontend

# Run E2E tests
pnpm nx e2e api
```

### Database Operations
```bash
# Generate new migration
pnpm nx run api:migration-generate --name=MigrationName

# Run migrations
pnpm nx run api:migrations-run

# Revert last migration
pnpm nx run api:migration-revert
```

### Firmware Development
```bash
# Build firmware (requires PlatformIO)
pnpm nx build attractap-firmware
pnpm nx build attractap-touch-firmware
```

### Code Quality
```bash
# Lint all projects
pnpm nx run-many -t lint

# Lint with strict mode (no warnings)
pnpm lint:strict
```