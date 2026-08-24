# Seed Development Database

Use this skill when local work needs a login or repeatable database fixtures without completing the first-time setup flow.

## Prerequisites

1. Ensure dependencies are installed with `pnpm install`.
2. Create `.env` from `.env.example` if it is missing. Set `AUTH_SESSION_SECRET` and `LICENSE_KEY`. The non-profit `LICENSE_KEY` in `.env.example` is valid for local qualifying development.
3. Start the API with `pnpm serve --only=api`. Do not use `pnpm nx serve api`.
4. Read the API URL from `.dev-serve-ports.json`, set `ATTRACCESS_URL` in `.env` to that URL, then restart the API so generated links use this worktree's actual port.
5. Wait until migrations have created `storage/attraccess.sqlite`, then run `pnpm seed:dev`.

The seed command prints the credentials. Tell the user:

```text
Username: admin
Password: password
```

When the frontend is required, start it with `pnpm serve` and read `.dev-serve-ports.json` for the resolved frontend URL. Never assume port 4200.

## Safety

The seed command only accepts databases within this repository's `storage/` directory by default. Do not use `--allow-external-db` for shared, staging, or production databases. The fixed credentials are for local development only.

The command upserts its own records. It never clears existing data.

## Demo Data

Use `pnpm seed:dev -- --demo` to add:

- `Demo Workshop` resource group
- `Demo 3D Printer` machine
- `demo-resource-user` role, with `resources.read`

The seeded admin is always assigned the system `administrator` role. With `--demo`, it also receives `demo-resource-user`.

## Custom Fixtures

Use `pnpm seed:dev -- --fixture path/to/fixture.json`. Fixtures are JSON and may contain resource groups, resources, non-system roles, known permission keys, and user-role assignments:

```json
{
  "resourceGroups": [{ "name": "Woodshop", "description": "Shared tools" }],
  "resources": [
    { "name": "Table Saw", "type": "machine", "groups": ["Woodshop"] },
    { "name": "Shop Door", "type": "door", "groups": ["Woodshop"] }
  ],
  "roles": [
    {
      "key": "woodshop-manager",
      "name": "Woodshop Manager",
      "description": "Maintains woodshop resources",
      "permissions": ["resources.read", "resources.update", "resources.maintenance.manage"]
    }
  ],
  "userRoles": [{ "username": "admin", "roleKey": "woodshop-manager" }]
}
```

Fixture roles may reference permission keys seeded by migrations. Do not invent permission keys: the command rejects unknown ones. Reapply a fixture to update the resource group, resource, role labels, and add missing memberships or permission grants. It intentionally does not revoke memberships or permissions, protecting data created by a developer.
