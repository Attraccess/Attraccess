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
