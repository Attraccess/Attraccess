# PR Quality Gates and AI-Generated-Code Risk Controls

> **Scope:** Repository inventory and a proposed CI/branch-policy rollout. No CI settings were queried, so GitHub-hosted branch/ruleset and security-feature enablement are explicitly unverified.

## Current State

| Area | Present controls | Evidence |
| --- | --- | --- |
| Fast code quality | Local Husky `pre-commit` runs affected lint, typecheck, build, test, and e2e; lint has zero warnings. The PR workflow runs affected lint/typecheck and test/e2e, then `precommit-check` fails unless all listed jobs succeed. | `.husky/pre-commit:1`; `package.json:7-10`; `nx.json:93-143`; `.github/workflows/pull-requests.yml:34-85,115-141` |
| CI speed and correctness | PR and merge-queue runs use `nx affected` with a base SHA, a fetched full history, five-way parallelism, cached targets, and a read-only remote-cache token. This follows Nx's model: it identifies the changed projects and dependents; CI should explicitly set its base/head. [Nx affected](https://nx.dev/docs/features/ci-features/affected) | `.github/workflows/pull-requests.yml:3-26,115-141`; `nx.json:84-159` |
| Merge-queue coverage | The PR workflow accepts `merge_group`; GitHub requires this trigger for required checks when merge queue is enabled. [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group) | `.github/workflows/pull-requests.yml:3-7` |
| Commit quality | Conventional Commit messages are checked locally and PR titles in CI. | `.husky/commit-msg:1`; `CONTRIBUTING.md:3-64`; `.github/workflows/pull-requests.yml:87-101` |
| Domain-specific gates | Plugin packaging, companion binaries, Docker image build, firmware-version validation, Balena compose, Fail2ban, Grafana provisioning, and hardware DRC/ERC/build/export/render checks run in PR workflows. | `.github/workflows/pull-requests.yml:103-337`; `.github/workflows/hardware.yml:3-62`; `.github/workflows/companion.yml:3-18` |
| Generated-code controls | Project instructions prohibit committing generated React Query client code and editing `CHANGELOG.md`; the API client and companion WS client mark generated outputs as do-not-edit. Hardware generated documentation has a synchronization check. There is no general CI enforcement for the API/React Query generated outputs. | `AGENTS.md:1-4`; `libs/api-client/project.json:39`; `libs/companion-ws-client/tools/generate.ts:148,218`; `.github/workflows/hardware.yml:46-55` |
| Supply chain | pnpm is pinned, CI uses `--frozen-lockfile`, pnpm v10 allowlists dependency build scripts, Dependabot updates npm dependencies weekly, Renovate updates container images, and a main/release workflow produces and uploads a CycloneDX SBOM to Dependency-Track. pnpm documents frozen-lockfile behavior in CI and recommends explicit trusted build dependencies. [pnpm CI](https://pnpm.io/continuous-integration) [pnpm supply-chain security](https://pnpm.io/supply-chain-security) | `package.json:253,290-307`; `.github/actions/setup/action.yml:13-25`; `.github/dependabot.yml:6-19`; `renovate.json:1-26`; `.github/workflows/dependency-track.yml:1-53` |
| Ownership and workflow security | A default owner is requested for all files. Workflows avoid `pull_request_target`; PR cache access is read-only by design. Several third-party actions are SHA-pinned, but others use movable major tags (for example `actions/checkout@v7`, artifact actions, Docker Buildx, sticky comments, and Dependency-Track). GitHub recommends full commit-SHA pins as the immutable option and least-privilege tokens. [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) | `CODEOWNERS:1-4`; `.github/workflows/pull-requests.yml:14-26,92,182,224,324`; `.github/workflows/dependency-track.yml:22-25,46` |
| Missing committed scanners | No committed CodeQL workflow/configuration, Semgrep configuration, dependency-review workflow, secret-scanning configuration, or AI-specific review policy was found. This does not prove that GitHub Security features are disabled. CodeQL supports this repository's TypeScript, C/C++, and GitHub Actions workflow/action YAML; Semgrep supports CI diff-aware scans. [CodeQL support](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/) [Semgrep CI](https://semgrep.dev/docs/semgrep-ci/overview) | Repository file inventory; `.github/workflows/`; `.github/`; `.semgrep*` absent |

## Recommended Required PR Gates

1. **Keep `Pull Requests / precommit-check` as the aggregate required check and require it, `commitlint`, and `containerize` in the `main` ruleset.** Require one non-author approval, dismiss stale approvals, require Code Owner review, and prevent bypass. GitHub branch protection can require reviews, code-owner approval, conversation resolution, and successful checks; checks must have unique names. [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) This turns the existing gates into an enforceable boundary; the worktree alone cannot confirm it is configured.

2. **Add a small dependency-review job to `.github/workflows/pull-requests.yml` and make it required.** Run the official `actions/dependency-review-action` only for PR/merge-group dependency changes, with a severity threshold agreed by maintainers (initially `high`). It fails by default when a PR introduces vulnerable packages and can enforce license policy. [Dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review) It directly addresses fast-moving AI-authored dependency changes without duplicating the existing SBOM workflow.

3. **Add a fast Semgrep diff gate for changed application/workflow files, initially with vetted TypeScript/JavaScript, secrets, and GitHub Actions rules.** Run it under `pull_request` only, no repository write token or secrets, and fail only on newly introduced high-confidence findings after baseline triage. Semgrep describes PR scans as diff-aware and recommends regular full scans of the default branch. [Semgrep CI](https://semgrep.dev/docs/semgrep-ci/overview) This catches common insecure patterns that lint/typecheck cannot, while keeping feedback proportional to the diff.

4. **Codify generated-code and automation-sensitive review.** Extend `CODEOWNERS` with dedicated entries for `.github/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `nx.json`, generator sources, and generated-output directories. Add a lightweight PR job that rejects direct edits to known generated outputs unless the corresponding generator/spec changes in the same PR; begin with `libs/api-client/src/generated/**`, the React Query generated output locations, `libs/companion-ws-client` generated files, and `CHANGELOG.md`. This enforces the existing instruction rather than trying to identify whether code was AI-written. GitHub specifically recommends CODEOWNERS for workflow changes. [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)

5. **Enable GitHub secret scanning and push protection; add project-specific patterns if relevant.** Push protection blocks detected credentials before they enter history, and repository protection supports custom patterns and delegated bypass. [GitHub push protection](https://docs.github.com/en/code-security/secret-scanning/protecting-pushes-with-secret-scanning) This is the highest-value AI-code control because generated patches can inadvertently paste credentials; do not put a secret-scanning CLI with credentials into fork PR jobs.

## Async or Deeper Checks

1. **Enable CodeQL with JavaScript/TypeScript, C/C++, and GitHub Actions analysis.** Start on `push` to `main`, a nightly schedule, and manual dispatch; surface alerts for triage rather than making first adoption merge-blocking. CodeQL supports TypeScript through 7.0, the repository's workflow/action YAML, and C/C++; its JS/TS models cover NestJS, Express, React, Electron, axios, sqlite3, and other repository technologies. [CodeQL supported languages/frameworks](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/) Promote only stable, low-noise rules to required status after a baseline is resolved.

2. **Run a full Semgrep scan nightly/default-branch and upload or triage results.** Keep this distinct from the diff gate so historical findings do not block unrelated PRs. Semgrep recommends full scans on the default branch regularly. [Semgrep CI scan scope](https://semgrep.dev/docs/semgrep-ci/overview#scan-scope)

3. **Harden the action supply chain.** Pin every third-party `uses:` reference to a verified full commit SHA, set default `GITHUB_TOKEN` permissions to `contents: read`, grant scoped job permissions only where needed, and add Dependabot `github-actions` updates. GitHub calls full SHA pins the immutable option and documents Dependabot support for updating action references. [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) [Dependabot version updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-version-updates)

4. **Continue SBOM upload and add an alert SLA for Dependency-Track/Dependabot findings.** The existing post-merge/release SBOM is correctly non-blocking; dependency review prevents newly introduced known-vulnerable dependencies earlier. Do not replace either with `pnpm audit` as a required PR gate.

5. **Harden package resolution deliberately.** Retain pnpm's build-script allowlist and frozen lockfile; evaluate `blockExoticSubdeps: true` and a release-age policy in `pnpm-workspace.yaml` after confirming all required dependencies are registry-hosted. pnpm documents both controls as supply-chain mitigations. [pnpm supply-chain security](https://pnpm.io/supply-chain-security)

## Implementation Path

1. In GitHub settings, verify/enable the `main` ruleset requirements above, secret scanning/push protection, Dependabot alerts/security updates, and dependency graph. Record the required check names before changing workflow job names.
2. Add the dependency-review and Semgrep diff jobs to `pull-requests.yml`; include `merge_group` only where the action supports the merge reference, use read-only permissions, and place a successful result in `precommit-check.needs` if that aggregate is the single quality gate.
3. Add specific `CODEOWNERS` patterns and a generator-output consistency job. Define the exact React Query output path by inspecting its generator configuration before enforcing it; do not infer it from library names.
4. Add a separate `code-security.yml` for scheduled/default-branch CodeQL and full Semgrep. Baseline and triage alerts before raising enforcement.
5. SHA-pin actions and add the Dependabot `github-actions` ecosystem. Verify each SHA belongs to the upstream action repository, then preserve a release-version comment for update tooling.

## Sources

- [GitHub: protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub: workflow events and merge queues](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
- [GitHub: secure use of Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub: dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review)
- [GitHub: secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning)
- [GitHub: push protection](https://docs.github.com/en/code-security/secret-scanning/protecting-pushes-with-secret-scanning)
- [GitHub: Dependabot version updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-version-updates)
- [CodeQL: supported languages and frameworks](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/)
- [Semgrep: add Semgrep to CI](https://semgrep.dev/docs/semgrep-ci/overview)
- [Nx: affected CI tasks](https://nx.dev/docs/features/ci-features/affected)
- [pnpm: continuous integration](https://pnpm.io/continuous-integration)
- [pnpm: supply-chain security](https://pnpm.io/supply-chain-security)
