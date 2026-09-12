#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Source and converter match LVGL 9.3.0, used by the managed component.
font_url='https://raw.githubusercontent.com/lvgl/lvgl/v9.3.0/scripts/built_in_font/Montserrat-Medium.ttf'
font_file='tools/.Montserrat-Medium.ttf'
trap 'rm -f "$font_file"' EXIT

curl --fail --location --output "$font_file" "$font_url"

for size in 10 14 18 24 36; do
    npx --yes lv_font_conv --size "$size" --bpp 4 --no-compress --format lvgl --lv-include lvgl.h \
        --font "$font_file" -r 0x20-0x7E -r 0xA0-0xFF \
        --lv-font-name "attractap_font_montserrat_latin1_$size" \
        --output "src/display/fonts/attractap_font_montserrat_latin1_$size.c"
done

perl -0pi -e 's/\n+\z/\n/' src/display/fonts/attractap_font_montserrat_latin1_*.c
