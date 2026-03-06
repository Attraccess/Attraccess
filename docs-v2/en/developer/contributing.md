# Contributing

Attraccess is an open-source project and welcomes contributions from the community. This guide explains how to get involved.

## Source Code

The source code is hosted on GitHub:

**[github.com/attraccess/Attraccess](https://github.com/attraccess/Attraccess)**

## How to Contribute

### 1. Fork the Repository

Create a fork of the Attraccess repository on GitHub.

### 2. Clone Your Fork

```bash
git clone https://github.com/your-username/Attraccess.git
cd Attraccess
pnpm install
```

### 3. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 4. Make Your Changes

Develop your feature or fix. Follow the code style guidelines below.

### 5. Run Tests

```bash
pnpm nx test api
pnpm nx test frontend
```

### 6. Submit a Pull Request

Push your branch and create a pull request against the `main` branch on the original repository. Describe your changes clearly in the pull request description.

## Code Style

- **Language:** TypeScript for all frontend and backend code
- **Linting:** ESLint is configured for the project. Run linting before submitting:
  ```bash
  pnpm nx lint api
  pnpm nx lint frontend
  ```
- Follow existing code patterns and conventions in the codebase

## Testing

- **Framework:** Jest is used for unit tests
- Place test files next to the source files they test (e.g., `my-service.spec.ts`)
- Write tests for new features and bug fixes

## Issue Tracking

Issues are tracked on GitHub:

**[github.com/attraccess/Attraccess/issues](https://github.com/attraccess/Attraccess/issues)**

Before starting work on a feature, check if there is an existing issue. If not, create one to discuss the change before implementing it.

## Reporting Bugs

When reporting a bug, include:

- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Attraccess version and deployment method (Docker, etc.)
- Browser and operating system (for frontend issues)

## Feature Requests

Feature requests are welcome. Open a GitHub issue with the label "feature request" and describe:

- The problem you are trying to solve
- Your proposed solution
- Any alternatives you have considered

## See Also

- [Developer Overview](developer/overview.md) – Getting started with development
- [Architecture](developer/architecture.md) – Project structure
- [API Reference](developer/api-reference.md) – REST API documentation
