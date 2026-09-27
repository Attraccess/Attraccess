#!/usr/bin/env python3
"""Inventory production display translation units and text-writing calls."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2] / "src" / "display"
SCREEN_ROOT = ROOT / "screens"
TEXT_CALL = re.compile(
    r"\b(?:lv_label_set_text(?:_fmt)?|lv_textarea_set_placeholder_text|"
    r"lv_dropdown_set_options|lv_tabview_add_tab|setLabelTextIfChanged|"
    r"FirmwareI18n::(?:set(?:Dynamic)?(?:Label|DropdownOptions)|translate))\s*\("
)


def main() -> None:
    screen_units = sorted(SCREEN_ROOT.rglob("*.cpp"))
    display_units = sorted(path for path in ROOT.rglob("*") if path.suffix in {".cpp", ".hpp"})
    print("Attractap production display localization source audit")
    print(f"Screen implementation units: {len(screen_units)}")
    print(f"All display source units including shared headers and overlays: {len(display_units)}")
    print("Every .cpp and .hpp unit below was inspected; text call lines are shown for direct review.")
    for source in display_units:
        relative = source.relative_to(ROOT)
        hits = [
            f"{number}: {line.strip()}"
            for number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1)
            if TEXT_CALL.search(line)
        ]
        print(f"\n[{relative}] text/localization calls: {len(hits)}")
        for hit in hits:
            print(f"  {hit}")
        if not hits:
            print("  (no text-writing or localization calls in this implementation unit)")


if __name__ == "__main__":
    main()
