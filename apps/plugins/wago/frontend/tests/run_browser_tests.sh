#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../../.."
export PYTHONDONTWRITEBYTECODE=1
test_python="${PYTHON:-python3}"
"$test_python" -c 'import playwright.sync_api'
pnpm exec vite build --config apps/plugins/wago/frontend/tests/harness/vite.config.mts
# Deliberately exclude legacy command tests that require a real host login/API.
"$test_python" -m unittest discover -s apps/plugins/wago/frontend/tests -p 'test_configuration_browser.py' -v "$@"
