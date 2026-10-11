#!/usr/bin/env bash
# Bootstrap entry point, retained for worktree creation and documented setup commands.
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "$#" -gt 1 ]]; then echo "Usage: $0 [--workspace-only]" >&2; exit 1; fi

case "${1:-}" in
    "")
        . "$REPO_ROOT/scripts/setup-host-dependencies.sh"
        setup_host_dependencies
        ;;
    --workspace-only) ;;
    *) echo "Usage: $0 [--workspace-only]" >&2; exit 1 ;;
esac

"$REPO_ROOT/scripts/setup-workspace.sh"
if [[ "${INSTALL_ESP_IDF:-false}" == "true" ]]; then
    "$REPO_ROOT/apps/attractap/firmware/tools/setup-esp-idf.sh"
fi

echo "=== Setup complete ==="
echo "Start optional services: pnpm services"
echo "Start API + frontend: pnpm serve"
echo "Add --with-kiosk or --with-attractap to build and bundle optional assets."
echo "Install firmware tools: INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh --workspace-only"
