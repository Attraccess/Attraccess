# Contributing to Attraccess

## Commit Messages

This repository enforces [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) on every commit (locally via the `commit-msg` Husky hook) and on every pull request title (in CI).

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

### Accepted types

- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting, whitespace, no logic change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `perf` — performance improvement
- `test` — adding or correcting tests
- `build` — build system, dependencies, tooling
- `ci` — CI configuration
- `chore` — anything else that doesn't fit above
- `revert` — reverts a previous commit

### Scope

Optional, free-form. Use whatever identifies the area of change clearly. Recent examples from this repo: `metrics`, `deps`, `api`, `security`, `ATT-261` (Linear issue ID).

### Length

The header (`<type>(scope): <description>` line) must be 120 characters or fewer. The body and footer have no length limit.

### Examples

```
feat: add Coolify-ready docker-compose
fix(metrics): apply WsMetricsInterceptor on Attractap gateway
chore(deps): bump @tanstack/react-query
fix(ATT-261): consistent thumbnail size in resource group cards
```

### Pull request titles

Because this repo allows squash merges, the PR title becomes the commit on `main` for squash-merged PRs. PR titles must also follow Conventional Commits. CI validates the PR title automatically.

### Validating locally before committing

```bash
echo "feat: my change" | pnpm exec commitlint
```

### Bypass (emergency only)

```bash
git commit --no-verify -m "anything"
```

This skips the local hook but **CI still validates** all commits in the PR range when you open or update the pull request.

## GitHub Secrets

### Companion App Code Signing

The `.github/workflows/companion.yml` workflow signs binaries on releases. The following secrets must be configured in the repository settings:

| Secret | Description |
| --- | --- |
| `WINDOWS_CERT_BASE64` | Base64-encoded PFX file for Authenticode EV signing (`base64 certificate.pfx`) |
| `WINDOWS_CERT_PASSWORD` | Password for the PFX file |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Apple Developer ID certificate (`base64 certificate.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_ID` | Apple ID used for notarization (e.g. `developer@example.com`) |
| `APPLE_ID_PASSWORD` | App-specific password for the Apple ID ([create one here](https://appleid.apple.com/account/manage)) |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10-character string, found in the Developer portal) |

PR builds skip code signing entirely — only release builds require these secrets. Without them, release builds will fail at the signing step.
