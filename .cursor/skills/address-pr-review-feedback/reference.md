# GitHub API Reference for PR Comment Replies

## Reply to a line-level review comment

Creates a reply in the same thread as the original comment.

```bash
gh api -X POST repos/{owner}/{repo}/pulls/comments \
  -f body="Fixed in abc1234. Added null check before redirect." \
  -f in_reply_to=COMMENT_ID
```

- `COMMENT_ID`: The `id` field from the review comment (numeric).
- `{owner}` and `{repo}`: Resolved from current directory by `gh`.

## Add a top-level PR comment

For overall review feedback (e.g. Sourcery summary):

```bash
gh pr comment PR_NUMBER --body "Addressed feedback in COMMIT_SHA:

**1. Extracted helper for redirectTo resolution**
- Added getRedirectToFromRequest() in oidc-state-store.ts

**2. Tightened type guard**
- Added isOIDCAppState() before passing to Passport
..."
```

## List comments

**Line-level review comments:**
```bash
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments
```

Returns array of `{ id, body, path, line, user: { login } }`.

**Top-level issue comments:**
```bash
gh api repos/{owner}/{repo}/issues/PR_NUMBER/comments
```

Returns array of `{ id, body, user: { login } }`.

## Reply to an issue comment (thread)

To reply to a specific issue comment (creates a nested reply in the conversation):

```bash
gh api -X POST repos/{owner}/{repo}/issues/comments \
  -f body="Addressed in COMMIT_SHA. [summary]" \
  -f in_reply_to=ISSUE_COMMENT_ID
```

Note: `in_reply_to` for issue comments may require the GraphQL API depending on GitHub's model. The simpler approach is `gh pr comment` which adds a new top-level comment; reviewers are still notified.
