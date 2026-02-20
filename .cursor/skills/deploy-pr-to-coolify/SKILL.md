---
name: deploy-pr-to-coolify
description: Deploys a PR's Docker image to Coolify. Resolves PR (current branch or given ID), gets the latest image tag from GitHub Actions, updates the Attraccess application's Docker image in Coolify, and triggers deployment. Use when the user asks to deploy a PR to Coolify, deploy the current branch, or update the Coolify instance with a PR build.
---

# Deploy PR to Coolify

Deploys the latest Docker image from a GitHub PR to the Attraccess application on your Coolify instance.

## Workflow Overview

```
Resolve PR → Get latest image tag → Update Coolify app image → Deploy
```

## Prerequisites

1. **coolify-cli** installed and configured:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/coollabsio/coolify-cli/main/scripts/install.sh | bash
   coolify context add <name> <coolify-url>   # or set-token for Cloud
   ```

2. **gh** (GitHub CLI) installed and authenticated.

3. **Environment**: `COOLIFY_APP_NAME` or `COOLIFY_APP_UUID` for the Attraccess app (optional; can list and pick by name).

## Step 1: Resolve PR Number

- **Current branch**: `gh pr view --json number -q '.number'` (run from repo root)
- **User-provided ID**: Use the number directly

If no PR exists for the current branch, ask the user to provide a PR number or push/create a PR first.

## Step 2: Get Latest Image Tag

PR images use format `pr-{PR_NUMBER}-{SHORT_SHA}`. The "latest" build = head commit of the PR.

```bash
# Get head SHA (7 chars) - works for current branch or given PR_NUMBER
SHORT_SHA=$(gh pr view ${PR_NUMBER:-} --json headRefOid -q '.headRefOid' | cut -c1-7)
IMAGE_TAG="pr-${PR_NUMBER}-${SHORT_SHA}"
```

Default image name: `ghcr.io/attraccess/attraccess` (GHCR) or `attraccess/attraccess` (Docker Hub). Use the same registry as configured in Coolify.

**Note**: Ensure the PR workflow has completed and pushed the image. If you just pushed, wait for the "Pull Requests" workflow to finish.

## Step 3: Update Coolify Application

Use coolify-cli to update the Docker image tag. **Note**: `app update` requires the application UUID, not the name.

```bash
# Look up UUID by name if needed
APP_UUID=$(coolify app list --format=json | jq -r '.[] | select(.name=="attraccess") | .uuid')

# Update by UUID (name does not work)
coolify app update "$APP_UUID" --docker-tag "$IMAGE_TAG"
```

If the app uses a full image reference, update both name and tag as needed. The `--docker-tag` flag sets the tag; `--docker-image` sets the full image name if the registry differs.

## Step 4: Deploy

```bash
coolify deploy name attraccess --force
# Or: coolify deploy uuid $COOLIFY_APP_UUID --force
```

Use `--force` to skip confirmation when running non-interactively.

## Complete Example

```bash
# From repo root, current branch has PR (or pass PR number as $1)
PR=${1:-$(gh pr view --json number -q '.number')}
SHORT_SHA=$(gh pr view $PR --json headRefOid -q '.headRefOid' | cut -c1-7)
TAG="pr-${PR}-${SHORT_SHA}"

# app update requires UUID; deploy accepts name
APP_UUID=$(coolify app list --format=json | jq -r '.[] | select(.name=="attraccess") | .uuid')
coolify app update "$APP_UUID" --docker-tag "$TAG"
coolify deploy name attraccess --force
```

Add `--context <name>` to all coolify commands if not using the default context.

## Handoff Phrases

- "Deploy this PR to Coolify"
- "Deploy PR 123 to Coolify"
- "Update Coolify with the latest PR build"
- "Deploy the current branch to Coolify"

## Configuration

| Variable | Purpose |
|----------|---------|
| `COOLIFY_APP_NAME` | Application name in Coolify (default: `attraccess`) |
| `COOLIFY_APP_UUID` | Application UUID; use for `app update` (look up via `app list` if unknown) |
| `COOLIFY_CONTEXT` | coolify-cli context name; add `--context $COOLIFY_CONTEXT` to commands if not default |

## Additional Resources

- Coolify API and CLI details: [reference.md](reference.md)
- PR image format from `.github/workflows/pull-requests.yml`: `pr-{number}-{short_sha}`
- **GitHub workflow**: `.github/workflows/deploy-pr-to-coolify.yml` — manual trigger to deploy a PR from Actions
