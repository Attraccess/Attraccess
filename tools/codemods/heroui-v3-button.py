#!/usr/bin/env python3
# Codemod migrating HeroUI v2 Button props to v3 variants and isPending
# FEATURE: HeroUI v3 migration tooling for Button component refactor

import re
from pathlib import Path

from button_tag_parsing import COLOR_VARIANT_MAP, ISLOADING_RE, KNOWN_COLORS, OLD_VARIANTS, extract_static, get_line_number, has_dynamic, scan_button_tags, strip_static_attr

ROOT = Path(__file__).parents[2]
SEARCH_DIRS = [
    ROOT / "apps" / "frontend" / "src",
    ROOT / "libs",
]
EXCLUDE_DIRS = {"node_modules", ".nx", "dist", "__pycache__"}


def find_tsx_files(dirs):
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.tsx"):
            if not any(ex in p.parts for ex in EXCLUDE_DIRS):
                yield p


def process_file(path):
    original = path.read_text(encoding="utf-8")
    if "<Button" not in original:
        return 0, []

    tags = list(scan_button_tags(original))
    if not tags:
        return 0, []

    changes = 0
    dynamic_locs = []
    result_parts = []
    prev_end = 0

    for start, end, attrs_str, close in tags:
        before_tag = original[prev_end:start]
        new_attrs = attrs_str

        if ISLOADING_RE.search(new_attrs):
            new_attrs = ISLOADING_RE.sub('isPending=', new_attrs)

        color_dynamic = has_dynamic(new_attrs, "color")
        variant_dynamic = has_dynamic(new_attrs, "variant")

        if color_dynamic or variant_dynamic:
            line_no = get_line_number(original, start)
            dynamic_locs.append(line_no)
            rebuilt_tag = "<Button" + new_attrs + close
            if new_attrs != attrs_str:
                changes += 1
            result_parts.append(before_tag)
            result_parts.append(rebuilt_tag)
            prev_end = end
            continue

        result_parts.append(before_tag)

        static_color = extract_static(new_attrs, "color")
        static_variant = extract_static(new_attrs, "variant")

        if static_color and static_color not in KNOWN_COLORS:
            line_no = get_line_number(original, start)
            dynamic_locs.append(line_no)
            result_parts.append(original[start:end])
            prev_end = end
            continue

        lookup_variant = static_variant if static_variant in OLD_VARIANTS else None
        key = (static_color, lookup_variant)
        new_variant = COLOR_VARIANT_MAP.get(key)

        new_attrs = strip_static_attr(new_attrs, "color")
        new_attrs = strip_static_attr(new_attrs, "variant")

        if new_variant is not None:
            new_attrs = f' variant="{new_variant}"' + new_attrs

        rebuilt = "<Button" + new_attrs + close
        if rebuilt != original[start:end]:
            changes += 1
        result_parts.append(rebuilt)
        prev_end = end

    result_parts.append(original[prev_end:])
    new_content = "".join(result_parts)

    if new_content != original:
        path.write_text(new_content, encoding="utf-8")

    return changes, dynamic_locs


def main():
    total_changes = 0
    total_files = 0
    all_dynamic = []

    tsx_files = list(find_tsx_files(SEARCH_DIRS))
    print(f"Scanning {len(tsx_files)} TSX files...")

    for path in tsx_files:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        if "<Button" not in text:
            continue

        n_changes, dynamic_lines = process_file(path)
        if n_changes > 0:
            total_files += 1
            total_changes += n_changes
            rel = path.relative_to(ROOT)
            print(f"  CHANGED ({n_changes}): {rel}")
        for ln in dynamic_lines:
            rel = path.relative_to(ROOT)
            all_dynamic.append(f"{rel}:{ln}")

    print(f"\nSummary:")
    print(f"  Files changed:  {total_files}")
    print(f"  Replacements:   {total_changes}")
    print(f"  Dynamic cases:  {len(all_dynamic)}")
    if all_dynamic:
        print("\nDynamic cases (need manual review):")
        for loc in all_dynamic:
            print(f"  {loc}")


if __name__ == "__main__":
    main()
