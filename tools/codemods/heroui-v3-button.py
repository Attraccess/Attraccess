#!/usr/bin/env python3
# Codemod migrating HeroUI v2 Button props to v3 variants and isPending
# FEATURE: HeroUI v3 migration tooling for Button component refactor

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
SEARCH_DIRS = [
    ROOT / "apps" / "frontend" / "src",
    ROOT / "libs",
]
EXCLUDE_DIRS = {"node_modules", ".nx", "dist", "__pycache__"}

COLOR_VARIANT_MAP = {
    ("primary", "solid"): "primary",
    ("primary", "shadow"): "primary",
    ("primary", "faded"): "primary",
    ("primary", None): "primary",
    ("primary", "flat"): "secondary",
    ("primary", "light"): "ghost",
    ("primary", "ghost"): "ghost",
    ("primary", "bordered"): "outline",
    ("default", "solid"): "primary",
    ("default", "shadow"): "primary",
    ("default", "faded"): "primary",
    ("default", None): "primary",
    ("default", "flat"): "secondary",
    ("default", "light"): "ghost",
    ("default", "ghost"): "ghost",
    ("default", "bordered"): "outline",
    (None, "solid"): "primary",
    (None, None): None,
    (None, "flat"): "secondary",
    (None, "light"): "ghost",
    (None, "ghost"): "ghost",
    (None, "faded"): "ghost",
    (None, "bordered"): "outline",
    ("secondary", None): "secondary",
    ("secondary", "solid"): "secondary",
    ("secondary", "flat"): "secondary",
    ("secondary", "light"): "secondary",
    ("secondary", "ghost"): "secondary",
    ("secondary", "bordered"): "secondary",
    ("secondary", "faded"): "secondary",
    ("secondary", "shadow"): "secondary",
    ("danger", "solid"): "danger",
    ("danger", "shadow"): "danger",
    ("danger", None): "danger",
    ("danger", "flat"): "danger-soft",
    ("danger", "light"): "danger-soft",
    ("danger", "ghost"): "danger-soft",
    ("danger", "faded"): "danger-soft",
    ("danger", "bordered"): "outline",
    ("warning", None): "tertiary",
    ("warning", "solid"): "tertiary",
    ("warning", "flat"): "tertiary",
    ("warning", "light"): "tertiary",
    ("warning", "ghost"): "tertiary",
    ("warning", "bordered"): "tertiary",
    ("warning", "faded"): "tertiary",
    ("warning", "shadow"): "tertiary",
    ("success", None): "tertiary",
    ("success", "solid"): "tertiary",
    ("success", "flat"): "tertiary",
    ("success", "light"): "tertiary",
    ("success", "ghost"): "tertiary",
    ("success", "bordered"): "tertiary",
    ("success", "faded"): "tertiary",
    ("success", "shadow"): "tertiary",
}

OLD_VARIANTS = {"solid", "flat", "light", "bordered", "shadow", "faded", "ghost"}
KNOWN_COLORS = {"primary", "default", "secondary", "danger", "warning", "success"}
ISLOADING_RE = re.compile(r'\bisLoading=')


def find_tsx_files(dirs):
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.tsx"):
            if not any(ex in p.parts for ex in EXCLUDE_DIRS):
                yield p


def scan_button_tags(text):
    """Yield (start, end, attrs_str, close) for each <Button ...> opening tag."""
    search_re = re.compile(r'<Button\b')
    i = 0
    while True:
        m = search_re.search(text, i)
        if not m:
            break
        start = m.start()
        name_end = m.end()
        pos = name_end
        depth = 0
        in_dq = in_sq = False
        while pos < len(text):
            ch = text[pos]
            if in_dq:
                if ch == '\\':
                    pos += 1
                elif ch == '"':
                    in_dq = False
            elif in_sq:
                if ch == '\\':
                    pos += 1
                elif ch == "'":
                    in_sq = False
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            elif ch == '"':
                in_dq = True
            elif ch == "'":
                in_sq = True
            elif ch == '>' and depth == 0:
                end = pos + 1
                close = '/>' if text[pos - 1] == '/' else '>'
                attrs_start = name_end
                attrs_end = pos - (1 if close == '/>' else 0)
                attrs_str = text[attrs_start:attrs_end]
                yield start, end, attrs_str, close
                break
            pos += 1
        i = start + 1


def extract_static(attrs_str, attr_name):
    m = re.search(r'(?<!\w)' + attr_name + r'=["\']([^"\']*)["\']', attrs_str)
    return m.group(1) if m else None


def has_dynamic(attrs_str, attr_name):
    return bool(re.search(r'(?<!\w)' + attr_name + r'=\{', attrs_str))


def strip_static_attr(attrs_str, attr_name):
    return re.sub(r'\s+' + attr_name + r'=["\'][^"\']*["\']', '', attrs_str)


def get_line_number(text, pos):
    return text[:pos].count('\n') + 1


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
