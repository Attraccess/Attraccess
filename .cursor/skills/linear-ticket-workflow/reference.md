# Linear Ticket Workflow – Reference

## Branching Rules

- New branch: `git fetch` → `git checkout main` → `git pull origin main` → `git checkout -b <branch>`
- Existing branch: `git checkout <branch>` → `git fetch` → `git rebase origin/main`
- Before push: always `git fetch` + `git rebase origin/main` first

## GitHub CLI Commands

```bash
# Verify auth
gh auth status

# Create PR (interactive if no flags)
gh pr create --title "[ATT-251] Title" --body "Fixes ATT-251\n\n## Summary\n..."

# View PR URL after create
gh pr view --web

# List PRs for current branch
gh pr list --head <branch-name>
```

## Linear MCP Tools Used

| Tool | Purpose |
|------|---------|
| `mcp_linear_get_issue` | Fetch ticket by ID (ATT-251 or UUID); returns `gitBranchName`, `identifier`, `title` |
| `mcp_linear_update_issue` | Change status via `state: "In Progress"` or `state: "In Review"` |
| `mcp_linear_create_comment` | Add progress comments; `issueId` is the UUID |

## Linear Status Names

- `In Progress` – work started
- `In Review` – PR opened
- `Done` – merged (update manually or via automation)

## Quality Gates

- Add tests for all changes (unit, integration, e2e, regression, smoke)
- Never ignore: failed tests, lint errors, type errors, warnings
- Run precommit before push (`pnpm precommit` or equivalent)
- If stuck: comment on ticket with blocker details; do not proceed with broken state

## Commit Message Convention

```
<type>: <short description>

<optional body>
Fixes ATT-251
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, etc.
