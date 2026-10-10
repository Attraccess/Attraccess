#!/usr/bin/env python3
"""Enforce explicit localization ownership, alongside the source inventory.

Typed setters reject accidental string-based UI messages at compile time. This
check adds English fallback/catalog checks and a reviewed allowlist for every
literal data path, so a new unclassified visible write fails the host tests.
"""

import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2] / "src" / "display"
CLASSIFICATIONS = Path(__file__).with_name("localization_literals.json")
RAW_WRITE = re.compile(
    r"\b(?:lv_label_set_text(?:_fmt|_static)?|lv_textarea_set_placeholder_text|"
    r"lv_dropdown_(?:set_options|add_option|set_text)|lv_roller_set_options|"
    r"lv_tabview_(?:add_tab|rename_tab)|lv_(?:buttonmatrix|keyboard)_set_map)\s*\("
)
LITERAL = re.compile(r"\b(?:FirmwareI18n::(?:setDynamic(?:Label|DropdownOptions|Placeholder)|Text::literal)|setDynamicLabelTextIfChanged)\s*\(")
MESSAGE = re.compile(r"FirmwareI18n::Message::(\w+)")


def calls(source: str, pattern: re.Pattern):
    # Ignore comments, retaining source strings (data and text arguments).
    source = re.sub(r'"(?:[^"\\]|\\.)*"|//[^\n]*|/\*[\s\S]*?\*/',
                    lambda m: m[0] if m[0].startswith('"') else " " * len(m[0]), source)
    for match in pattern.finditer(source):
        depth, pos, quoted, escaped = 1, match.end(), False, False
        while depth and pos < len(source):
            char = source[pos]
            if quoted:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    quoted = False
            elif char == '"':
                quoted = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            pos += 1
        yield " ".join(source[match.start():pos].split())


def literal_inventory():
    result = {}
    for source in sorted(ROOT.rglob("*")):
        if source.suffix not in {".cpp", ".hpp"} or source.name in {"i18n.hpp", "messages.hpp"}:
            continue
        writes = sorted(set(calls(source.read_text(), LITERAL)))
        if writes:
            result[str(source.relative_to(ROOT))] = writes
    return result


def main() -> int:
    errors = []
    catalog = (ROOT / "messages.hpp").read_text()
    entries = re.findall(r'\{Message::(\w+), ("(?:[^"\\]|\\.)*"), ("(?:[^"\\]|\\.)*")\}', catalog)
    ids = [entry[0] for entry in entries]
    enum = re.search(r"enum class Message\s*\{([^}]+)\}", catalog)[1]
    declared = re.findall(r"\b(\w+)\s*(?:,|$)", enum.strip())[:-1]
    if ids != declared or len(set(ids)) != len(ids):
        errors.append("Catalog identifiers must be unique and in enum order")
    for identifier, german, english in entries:
        if not json.loads(english):
            errors.append(f"{identifier}: missing English fallback")
        if sorted(re.findall(r"\{\d\}", json.loads(german))) != sorted(re.findall(r"\{\d\}", json.loads(english))) and json.loads(german):
            errors.append(f"{identifier}: formatting arguments differ between languages")
    units = sorted(p for p in ROOT.rglob("*") if p.suffix in {".cpp", ".hpp"})
    for source in units:
        if source.name in {"i18n.hpp", "messages.hpp"}:
            continue
        content = source.read_text()
        for write in calls(content, RAW_WRITE):
            errors.append(f"{source.relative_to(ROOT)}: raw text write needs an explicit ownership setter: {write}")
        for identifier in MESSAGE.findall(content):
            if identifier not in ids:
                errors.append(f"{source.relative_to(ROOT)}: unknown message {identifier}")
    reviewed = json.loads(CLASSIFICATIONS.read_text())
    actual = literal_inventory()
    for source in sorted(set(actual) | set(reviewed)):
        expected = reviewed.get(source, {})
        for write in set(actual.get(source, [])) | set(expected):
            if write not in actual.get(source, []) or not expected.get(write):
                errors.append(f"{source}: unreviewed or obsolete literal classification: {write}")
    print(f"Inspected {len(units)} display units, {len(entries)} messages, {sum(map(len, actual.values()))} explicitly classified literal paths")
    for source, writes in actual.items():
        print(f"{source}: {len(writes)} reviewed data/neutral paths")
    for error in errors:
        print(error, file=sys.stderr)
    return bool(errors)


if __name__ == "__main__":
    sys.exit(main())
