#!/usr/bin/env python3
# Codemod ensuring AlertContent/AlertTitle/AlertDescription are imported from heroui
# FEATURE: HeroUI v3 migration tooling for Alert compound import fixer

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
SEARCH_DIRS = [
    ROOT / "apps" / "frontend" / "src",
    ROOT / "libs",
]
EXCLUDE_DIRS = {"node_modules", ".nx", "dist", "__pycache__"}

NEEDED = {"AlertContent", "AlertTitle", "AlertDescription"}
HEROUI_PKG = "@heroui/react"


def find_tsx_files(dirs):
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.tsx"):
            if not any(ex in p.parts for ex in EXCLUDE_DIRS):
                yield p


def needed_names(text):
    used = set()
    for name in NEEDED:
        if f'<{name}' in text or f'{name}>' in text:
            used.add(name)
    return used


def get_imported_from_heroui(text):
    m = re.search(
        r"import\s*\{([^}]*)\}\s*from\s*['\"]" + re.escape(HEROUI_PKG) + r"['\"]",
        text,
    )
    if not m:
        return set(), None, None
    names = {n.strip() for n in m.group(1).split(',') if n.strip()}
    return names, m.start(), m.end()


def process_file(path):
    original = path.read_text(encoding='utf-8')
    used = needed_names(original)
    if not used:
        return False

    imported, imp_start, imp_end = get_imported_from_heroui(original)
    missing = used - imported

    if not missing:
        return False

    if imp_start is not None:
        m = re.search(
            r"import\s*\{([^}]*)\}\s*from\s*['\"]" + re.escape(HEROUI_PKG) + r"['\"]",
            original,
        )
        all_names = sorted(imported | missing)
        new_import = f"import {{ {', '.join(all_names)} }} from '{HEROUI_PKG}'"
        new_content = original[:imp_start] + new_import + original[imp_end:]
    else:
        first_import = re.search(r'^import\b', original, re.MULTILINE)
        if first_import:
            ins = first_import.start()
        else:
            ins = 0
        new_import_line = f"import {{ {', '.join(sorted(missing))} }} from '{HEROUI_PKG}';\n"
        new_content = original[:ins] + new_import_line + original[ins:]

    if new_content != original:
        path.write_text(new_content, encoding='utf-8')
        return True
    return False


def main():
    total_files = 0
    tsx_files = list(find_tsx_files(SEARCH_DIRS))
    print(f'Scanning {len(tsx_files)} TSX files for missing Alert compound imports...')

    for path in tsx_files:
        try:
            text = path.read_text(encoding='utf-8')
        except Exception:
            continue
        if not any(f'<{n}' in text for n in NEEDED):
            continue

        changed = process_file(path)
        if changed:
            total_files += 1
            print(f'  IMPORTS FIXED: {path.relative_to(ROOT)}')

    print(f'\nSummary:')
    print(f'  Files with imports fixed: {total_files}')


if __name__ == '__main__':
    main()
