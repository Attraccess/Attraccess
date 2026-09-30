# Security Findings Triage

CodeQL and the scheduled Semgrep workflow publish findings to GitHub's Security
tab. Repository maintainers review new findings and assign valid issues to the
owner of the affected code. The assignee owns remediation and links the pull
request that resolves the finding.

## Triage

Review new findings promptly and classify each as one of the following:

- Valid: create or link an issue, assign an owner, and set a remediation
  priority.
- False positive: dismiss the GitHub code-scanning alert with the reason and a
  short explanation of why the reported path is safe.
- Accepted risk: dismiss the alert with the reason, impact, mitigation, and a
  review date.

Do not suppress findings only in CI output. A repository-wide false positive
may be excluded only after its corresponding alert documents the rationale;
keep the exclusion as narrow as possible and reference that alert or issue in
the exclusion comment.

## Baseline And Blocking Rules

Scheduled Semgrep scans are intentionally non-blocking so existing findings can
be triaged without preventing unrelated work. ATT-945 will add the separate,
diff-aware pull-request gate. Promote a rule to that blocking gate only after
the scheduled baseline has been reviewed, false positives have been addressed,
and the rule has demonstrated actionable, high-confidence findings.
