#!/usr/bin/env python3
# Codemod migrating HeroUI v2 Alert props to v3 compound AlertContent/Title/Description
# FEATURE: HeroUI v3 migration tooling for Alert component refactor

import re
from pathlib import Path

from alert_tag_parsing import extract_attr_value, scan_alert_tags
from alert_compound_rendering import build_compound, get_indent, has_compound_children

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
    original = path.read_text(encoding='utf-8')
    if '<Alert' not in original:
        return 0, 0

    tags = list(scan_alert_tags(original))
    if not tags:
        return 0, 0

    rewrites = 0
    skipped = 0
    result_parts = []
    prev_end = 0

    for start, end, attrs_str, self_close, body in tags:
        result_parts.append(original[prev_end:start])

        if not self_close and has_compound_children(body):
            result_parts.append(original[start:end])
            skipped += 1
            prev_end = end
            continue

        color_val = extract_attr_value(attrs_str, 'color')
        status_val = extract_attr_value(attrs_str, 'status')
        title_val = extract_attr_value(attrs_str, 'title')
        description_val = extract_attr_value(attrs_str, 'description')

        needs_rewrite = (
            color_val is not None
            or title_val is not None
            or description_val is not None
        )
        if not needs_rewrite:
            result_parts.append(original[start:end])
            prev_end = end
            continue

        indent = get_indent(original, start)
        rebuilt = build_compound(attrs_str, self_close, body, indent)
        if rebuilt is None:
            result_parts.append(original[start:end])
            prev_end = end
            continue

        result_parts.append(rebuilt)
        rewrites += 1
        prev_end = end

    result_parts.append(original[prev_end:])
    new_content = ''.join(result_parts)

    if new_content != original:
        path.write_text(new_content, encoding='utf-8')

    return rewrites, skipped


def main():
    total_rewrites = 0
    total_skipped = 0
    total_files = 0

    tsx_files = list(find_tsx_files(SEARCH_DIRS))
    print(f'Scanning {len(tsx_files)} TSX files...')

    for path in tsx_files:
        try:
            text = path.read_text(encoding='utf-8')
        except Exception:
            continue
        if '<Alert' not in text:
            continue

        n_rewrites, n_skipped = process_file(path)
        total_skipped += n_skipped
        if n_rewrites > 0:
            total_files += 1
            total_rewrites += n_rewrites
            rel = path.relative_to(ROOT)
            print(f'  CHANGED ({n_rewrites}): {rel}')

    print(f'\nSummary:')
    print(f'  Files changed:   {total_files}')
    print(f'  Alerts rewritten: {total_rewrites}')
    print(f'  Alerts skipped (already compound): {total_skipped}')


if __name__ == '__main__':
    main()
