#!/usr/bin/env bash
set -euo pipefail
prototype_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cmake -S "$prototype_root" -B "$prototype_root/build" -DCMAKE_BUILD_TYPE=Debug
cmake --build "$prototype_root/build" --target att880-prototype --parallel 6
"$prototype_root/build/att880-prototype" "$prototype_root/output"
node "$prototype_root/render.mjs"
printf '\nOpen %s\n' "$prototype_root/output/ATT-880-prototype.html"
