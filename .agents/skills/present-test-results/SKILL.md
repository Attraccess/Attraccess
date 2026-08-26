# Present Test Results

Use this skill when handing a locally testable implementation to the user.

## Start The Application

The frontend requires the API. Never start or present the frontend by itself.

1. Ensure `.env` exists and contains `AUTH_SESSION_SECRET` and `LICENSE_KEY`. For local development, use the non-profit `LICENSE_KEY` from `.env.example` when applicable.
2. Start both services with `pnpm serve` whenever the user needs to test the UI.
3. Start only the API with `pnpm serve --only=api` only when the work is API-only or the user does not need the UI.
4. Never use `pnpm nx serve api` or assume ports 3000 and 4200.
5. Read `.dev-serve-ports.json` after the launcher starts. Use `frontend.url` for the UI and `api.url` for API or Swagger links.

Keep the dev-server process running while the user tests. If `ATTRACCESS_URL` is used for generated links, set it to the resolved API URL and restart the API.

## Seed A Login

Before presenting an authenticated UI, use the `seed-dev-db` skill or run:

```bash
pnpm seed:dev
```

The API must have started and completed migrations first. Tell the user the fixed local-development credentials:

```text
Username: admin
Password: password
```

Use `pnpm seed:dev -- --demo` only when the change benefits from a demo resource and RBAC fixture. Do not seed external, shared, staging, or production databases.

## Handoff Format

Report only information the user needs to test:

```text
Test URL: <resolved frontend URL>
Login: admin / password
What to verify:
1. <primary user-visible behavior>
2. <important edge case>
```

For API-only work, replace the test URL with the resolved Swagger URL: `<resolved API URL>/api`.

State any unavailable dependency or failed verification plainly. Do not claim the frontend is testable unless both frontend and API are running.
