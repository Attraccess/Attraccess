#!/usr/bin/env bash
set -euo pipefail

firmware_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="${1:-$firmware_dir/.cache/latin1-fonts}"
if [[ $# -gt 0 ]]; then shift; fi
if [[ $# -eq 0 ]]; then set -- 10 14 16 18 20 24 26 28 32 36; fi
mkdir -p "$output_dir"
cd "$output_dir"

# Source and converter match LVGL 9.3.0, used by the managed component.
font_url='https://raw.githubusercontent.com/lvgl/lvgl/c033a98afddd65aaafeebea625382a94020fe4a7/scripts/built_in_font/Montserrat-Medium.ttf'
font_file='Montserrat-Medium.ttf'
font_sha256='421f26b23e2be6b98373d32acd3cb2897b154d4bf0a77d26534ce476e4cbed53'

if [[ ! -f "$font_file" ]]; then
    curl --fail --location --retry 3 --output "$font_file.tmp" "$font_url"
    mv "$font_file.tmp" "$font_file"
fi
actual_sha256="$(cmake -E sha256sum "$font_file")"
if [[ "${actual_sha256%% *}" != "$font_sha256" ]]; then
    echo "Montserrat source checksum mismatch: $output_dir/$font_file" >&2
    exit 1
fi

# Resolve the pinned converter once for the whole set, reusing npm's cache across
# firmware variants. Resolving it separately for every size adds network waits.
npx --yes --prefer-offline --package=lv_font_conv@1.5.3 -- bash -c '
for size in "$@"; do
    lv_font_conv --size "$size" --bpp 4 --no-compress --format lvgl --lv-include lvgl.h \
        --font Montserrat-Medium.ttf -r 0x20-0x7E -r 0xA0-0xFF \
        --lv-font-name "attractap_font_montserrat_latin1_$size" \
        --output "attractap_font_montserrat_latin1_$size.c"
done
' generate-latin1-fonts "$@"
