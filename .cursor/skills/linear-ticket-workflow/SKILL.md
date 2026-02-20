---
name: linear-ticket-workflow
description: Executes an automatic ticket workflow when handed a Linear issue. Fetches ticket details, uses Linear's suggested branch name, updates status and comments progress, implements the solution, pushes to GitHub, and opens a PR with the ticket identifier in the title. Use when the user hands off a Linear ticket/issue to work on, assigns a ticket to the agent, or says to work on ATT-XXX.
---

# Linear Ticket Workflow

When the user hands off a Linear issue to work on, follow this workflow. Use Linear MCP tools and GitHub CLI (`gh`) throughout.

## Workflow Overview

```
Handoff → Fetch ticket → Branch → Status + Comment → Implement → Commit → Push → PR → Status + Comment
```

## Step 1: Fetch Ticket Details

Use `mcp_linear_get_issue` with the issue ID (e.g. `ATT-251` or the full UUID).

**Required fields from the response:**
- `identifier` – e.g. ATT-251 (use in PR title and comments)
- `title` – use in PR title
- `gitBranchName` – **always use this** for the branch; do not invent a branch name

## Step 2: Create Branch and Signal Start

1. Fetch and update main, then create branch from it:
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   git checkout -b <gitBranchName>
   ```

   **Always** branch from main. If the branch already exists, checkout it and rebase onto main before continuing:
   ```bash
   git checkout <gitBranchName>
   git fetch origin
   git rebase origin/main
   ```

2. Set Linear status to **In Progress** (if not already):
   - `mcp_linear_update_issue` with `state: "In Progress"`

3. Add a start comment:
   - `mcp_linear_create_comment` with body: `Starting work on this ticket. Branch: \`<gitBranchName>\``

## Step 3: Implement the Solution

Work on the ticket as usual. **Cover all changes with tests** (unit, integration, e2e, regression, smoke—as appropriate). **Never ignore** failed tests, lint warnings/errors, type errors, or other warnings; fix them before proceeding.

**Comment progress** at meaningful milestones:

- After completing a significant sub-task
- When blocked or waiting
- When making a key design decision

Example comment: `Completed [brief description]. Working on [next step].`

**If stuck:** Pause and add a comment to the ticket describing the blocker, what was tried, and what's needed. Do not proceed with broken tests or unresolved errors.

## Step 4: Commit and Push

1. Run precommit/validation (e.g. `pnpm precommit` or equivalent: lint, typecheck, build, test, e2e). All must pass.

2. Rebase onto latest main before pushing:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

3. Stage and commit with a descriptive message:
   ```bash
   git add -A
   git commit -m "feat: <short description>

   <optional longer description>
   Fixes <identifier>"
   ```

4. Push the branch:
   ```bash
   git push -u origin <gitBranchName>
   ```

## Step 5: Open PR and Update Ticket

1. Create the PR with `gh`:
   ```bash
   gh pr create --title "[<identifier>] <title>" --body "Fixes <identifier>

   ## Summary
   <brief description of changes>"
   ```

   **PR title format:** `[ATT-251] led support for attractap lite` (identifier + space + title)

2. Set Linear status to **In Review**:
   - `mcp_linear_update_issue` with `state: "In Review"`

3. Add a comment with the PR link:
   - Get the PR URL from `gh pr view --web` or the create output
   - `mcp_linear_create_comment` with body: `PR opened: <PR_URL>`

## Linear Status Flow

| Stage        | Status       |
|-------------|--------------|
| Work started| In Progress  |
| PR opened   | In Review    |
| Merged      | Done (manual)|

## PR Title Template

```
[<identifier>] <title>
```

Example: `[ATT-251] led support for attractap lite`

## Handoff Phrases

Treat these as triggers for this workflow:
- "Work on ATT-251"
- "Hand off ATT-251 to the agent"
- "Take this ticket: ATT-251"
- User pastes or references a Linear issue URL/ID

## Additional Resources

- For GitHub CLI and Linear tool reference, see [reference.md](reference.md)

## Notes

- **Always** use `gitBranchName` from the ticket; never derive a branch name.
- **Always** branch from main: fetch + pull main first, then create branch. Before pushing, rebase onto `origin/main` so the branch contains the latest changes.
- **Test coverage:** Add unit, integration, e2e, regression, or smoke tests as appropriate. Never leave changes untested.
- **No ignored failures:** Never ignore failed tests, lint/type errors, or warnings. Fix before committing or pushing.
- **When stuck:** Pause and comment on the ticket with the blocker; do not proceed with broken state.
- GitHub CLI (`gh`) must be installed and authenticated. Run `gh auth status` to verify.
- If the ticket is already In Progress, skip the status update but still add the start comment.
