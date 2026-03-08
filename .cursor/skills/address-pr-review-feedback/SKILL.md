---
name: address-pr-review-feedback
description: Addresses PR review comments and feedback by fixing issues in code and replying to the corresponding comment threads so reviewers know what was done. Use when the user asks to address PR feedback, fix review comments, respond to Sourcery/CodeRabbit/other AI reviewers, or implement changes from a code review.
---

# Address PR Review Feedback

When the user asks to address PR comments or review feedback, follow this workflow: fetch feedback → fix issues → reply to threads → commit and push.

## Workflow Overview

```
Fetch PR + comments → Parse feedback → Implement fixes → Reply to each comment/thread → Commit → Push
```

## Step 1: Fetch PR and Review Feedback

1. Identify the PR (from user context, `gh pr view`, or branch).
2. Fetch review comments and issue comments:

```bash
# List PR review comments (line-level)
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments

# List issue comments (top-level, e.g. Sourcery summary)
gh api repos/{owner}/{repo}/issues/PR_NUMBER/comments
```

3. Parse the feedback into actionable items. Note:
   - **Overall comments** (e.g. Sourcery's "Review" comment): often in a single issue comment with embedded suggestions.
   - **Line-level comments**: each has `id`, `body`, `path`, `line`, `user.login`.

## Step 2: Implement or Reject Feedback

For each feedback item:

1. Evaluate the suggestion. You may have more context or domain knowledge than the reviewer—**reject or defer** a comment if it is incorrect, harmful, or not applicable.
2. If implementing: locate the relevant file and code, apply the fix. Never ignore failed tests, lint, or type errors.
3. If rejecting: reply to the thread explaining why (e.g. "Declined: X would break Y because…" or "Out of scope for this PR").
4. Run precommit/validation before committing: `pnpm precommit` (or project equivalent).

## Step 3: Reply to Comment Threads

**Critical:** Reply directly to the comment or thread so the author knows the fix was applied.

### For line-level review comments (diff comments)

Reply in the thread using the comment's `id`:

```bash
gh api -X POST repos/{owner}/{repo}/pulls/comments \
  -f body="Fixed in COMMIT_SHA. [Brief description of change]." \
  -f in_reply_to=COMMENT_ID
```

Use `gh api` with `{owner}` and `{repo}` placeholders; `gh` resolves them from the current repo.

### For top-level issue comments (e.g. Sourcery, CodeRabbit)

Add a PR comment that references the review and summarizes fixes:

```bash
gh pr comment PR_NUMBER --body "Addressed feedback in COMMIT_SHA:

**1. [Feedback item 1]**
- [What was done]

**2. [Feedback item 2]**
- [What was done]
..."
```

If the review bot posted a single comment with multiple suggestions, reply to that comment. For issue comments, use the GraphQL API or add a new comment that clearly ties to the review (e.g. "Re: Sourcery review above").

### Reply content guidelines

- Be concise. State what was fixed and where.
- Include the commit SHA so reviewers can verify.
- For line-level: one reply per comment, directly addressing that suggestion.
- For overall reviews: one summary comment mapping each feedback item to its fix.

## Step 4: Commit and Push

1. Stage and commit with a descriptive message.
2. Rebase onto latest main if needed.
3. Push the branch.

## Comment Types Reference

| Type | Location | Reply method |
|------|----------|--------------|
| Line-level (review comment) | On a diff line | `gh api` POST with `in_reply_to` |
| Top-level (issue comment) | PR conversation | `gh pr comment` or `gh api` issues/comments |

## Handoff Phrases

- "Address the Sourcery feedback"
- "Fix the PR review comments"
- "Respond to the code review"
- "Implement the changes from the review"
- User pastes PR URL or review feedback

## Additional Resources

- For GitHub API details (reply endpoints, listing comments), see [reference.md](reference.md).

## Notes

- **Always reply to threads** so reviewers see that feedback was addressed or declined.
- Run validation (lint, typecheck, build, test) before committing.
- **Reject when warranted**: You may have more context than the reviewer. Push back with a clear explanation rather than implementing incorrect or harmful suggestions.
