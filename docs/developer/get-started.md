# Developer Get Started Guide

## Introduction

Attraccess is a comprehensive resource management system for tracking and managing access to shared resources. This guide will help you get started with developing and enhancing the project.

> [!NOTE]
> This guide is intended for developers who want to contribute to or extend the Attraccess platform. If you're looking for user documentation, please refer to the [User Guides](../user/) section.

## Technology Stack

### Frontend

- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS with HeroUI components
- **Data Fetching**: TanStack React Query
- **Routing**: React Router DOM
- **Testing**: Jest, Testing Library, Vitest

### Backend

- **Framework**: NestJS (Node.js)
- **Database**: TypeORM with SQLite support
- **API Documentation**: Swagger/OpenAPI
- **Authentication**: JWT, Passport.js
- **Testing**: Jest
- **WebSockets**: ws for real-time communication
- **MQTT**: Support for IoT device communication
- **Email**: Handlebars templates with MJML for responsive emails

### Development Infrastructure

- **Monorepo Management**: Nx
- **Package Manager**: pnpm
- **Linting**: ESLint
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions
- **Containerization**: Docker

## Project Structure

Attraccess follows an Nx monorepo structure, organized into apps and libs:

### Apps

- **frontend**: React application for the user interface
- **api**: NestJS application for the backend API

### Libraries

- **database-entities**: Shared TypeORM entities
- **api-client**: Generated API client for frontend consumption
- **react-query-client**: React Query hooks for data fetching
- **plugins-frontend-ui**: UI components for plugins
- **plugins-frontend-sdk**: SDK for developing frontend plugins
- **plugins-backend-sdk**: SDK for developing backend plugins
- **plugin-attractap**: Plugin that adds NFC reader functionalities to control machines
- **env**: Environment configuration

## Getting Started

### Prerequisites

- Node.js (20.10.0 or higher)
- pnpm (8.0.0 or higher)
- Docker and Docker Compose (for development with containerized services)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/Attraccess.git
   cd Attraccess
   ```

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
   nx run api:run-migrations
   ```

### Development

Start the development server:

```bash
# Start the backend API
nx serve api

# Start the frontend
nx serve frontend

# Alternatively, start both API and frontend together
nx run-many -t serve --projects=api,frontend
```

The API will be available at `http://localhost:3000` and the frontend at `http://localhost:4200`.

### Building for Production

```bash
# Build everything
nx run-many -t build

# Build specific projects
nx build api
nx build frontend
```

## Development Workflow

### Creating New Features

1. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Implement your changes following the project structure and conventions

3. Add tests for your changes:

   ```bash
   nx test <project-name>
   ```

   > [!WARNING]
   > Pull requests without adequate test coverage may be rejected. Aim for at least 80% coverage for new code.

4. Submit a pull request

### Plugin Development

Attraccess supports a plugin system for both frontend and backend extensions. For detailed information on plugin development, please refer to the [Plugin Development Guide](/developer/plugins.md).

> [!NOTE]
> Plugins are a powerful way to extend Attraccess functionality without modifying the core codebase. They can be developed and distributed independently.

## Useful Commands

```bash
# Run tests
nx test <project-name>

# Run e2e tests
nx e2e <project-name>-e2e

# Lint code
nx lint <project-name>

# View dependency graph
nx graph
```

## Documentation

For detailed information about the API and OpenAPI documentation, please refer to the [OpenAPI Documentation Guide](/developer/openapi.md).

The full Attraccess documentation is also accessible directly from your running instance at:

```
<your-attraccess-url>/docs
```

## Need Help?

If you encounter issues or have questions, please:

1. Check the existing documentation and codebase
2. Create an issue in the repository for bugs or feature requests
3. Reach out to the project maintainers for further assistance

Happy coding!
