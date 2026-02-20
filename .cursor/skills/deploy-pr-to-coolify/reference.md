# Deploy PR to Coolify — Reference

## coolify-cli Setup

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/coollabsio/coolify-cli/main/scripts/install.sh | bash

# Self-hosted: add context
coolify context add my-coolify https://coolify.yourdomain.com
# Enter API token when prompted (from Coolify: Security → API Tokens)

# Cloud: set token
coolify context set-token cloud <token>

# Verify
coolify context verify
```

## Relevant coolify-cli Commands

| Command | Purpose |
|---------|---------|
| `coolify app list` | List applications, find name/UUID |
| `coolify app get <uuid>` | Get app details (current image, etc.) |
| `coolify app update <uuid> --docker-tag <tag>` | Update image tag (**UUID required**, name returns 404) |
| `coolify app update <uuid> --docker-image <name>` | Update full image name |
| `coolify deploy name <name> --force` | Deploy by app name |
| `coolify deploy uuid <uuid> --force` | Deploy by UUID |

Use `--context <name>` when the default context is not your Coolify instance.

## GitHub PR Image Tags

From `.github/workflows/pull-requests.yml`:

- **Format**: `pr-{PR_NUMBER}-{SHORT_SHA}`
- **Registry**: `ghcr.io/attraccess/attraccess` (GHCR) and `attraccess/attraccess` (Docker Hub)
- **Latest build**: Head commit of the PR branch. Use `gh api repos/Attraccess/Attraccess/pulls/PR_NUMBER --jq '.head.sha'` for the full SHA.

## Attraccess Repo

- **Owner/repo**: `Attraccess/Attraccess` (GitHub vars may use different casing)
- **Resolve from current dir**: `gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'`
