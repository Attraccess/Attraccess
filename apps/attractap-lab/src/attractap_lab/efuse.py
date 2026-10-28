"""Refuse to reuse a reader whose eFuses were burned.

eFuses are one-time programmable: no erase undoes secure boot, flash
encryption, key blocks or a disabled download/USB path. Two checks run on the
output of ``ESPToolDriver.read_efuses()``:

* ESP32-S3 security fields must hold their factory values.
* Raw eFuse blocks must match the first dump recorded for the chip (by MAC),
  which also catches burns the summary cannot show, e.g. SPI_BOOT_CRYPT_CNT
  going from 0 to 3 still reads "Disable".
"""

import json
import re
from pathlib import Path

# Factory values as espefuse v5 reports them in `summary --format json`.
FACTORY_VALUES = {
    **{name: False for name in (
        "SECURE_BOOT_EN", "SECURE_BOOT_AGGRESSIVE_REVOKE",
        "SECURE_BOOT_KEY_REVOKE0", "SECURE_BOOT_KEY_REVOKE1", "SECURE_BOOT_KEY_REVOKE2",
        "DIS_DOWNLOAD_MODE", "ENABLE_SECURITY_DOWNLOAD", "DIS_FORCE_DOWNLOAD",
        "DIS_DOWNLOAD_MANUAL_ENCRYPT", "DIS_DIRECT_BOOT",
        "DIS_USB_SERIAL_JTAG", "DIS_USB_SERIAL_JTAG_DOWNLOAD_MODE", "DIS_USB_JTAG", "DIS_PAD_JTAG",
    )},
    **{f"KEY_PURPOSE_{index}": "USER" for index in range(6)},
    "SPI_BOOT_CRYPT_CNT": "Disable",
    "SOFT_DIS_JTAG": 0,
    "RD_DIS": 0,
}

_DUMP_LINE = re.compile(r"^(\S+)\s+\(.*?\)\s+\[\s*\d+\s*\]\s+dump:\s+([0-9a-fA-F ]+?)\s*$")


class EfuseViolation(RuntimeError):
    """The reader's eFuses changed or were never at factory security values."""


def parse(output):
    """Split espefuse `dump summary --format json` output into (summary, blocks)."""
    dump_start = output.find('=== Run "dump" command ===')
    summary_start = output.find('=== Run "summary" command ===')
    if dump_start < 0 or summary_start < dump_start:
        raise ValueError("espefuse output lacks the dump and summary sections")
    blocks = {}
    for line in output[dump_start:summary_start].splitlines():
        match = _DUMP_LINE.match(line.strip())
        if match:
            blocks[match.group(1)] = " ".join(match.group(2).lower().split())
    if not blocks:
        raise ValueError("espefuse dump contained no eFuse blocks")
    json_start = output.find("{", summary_start)
    if json_start < 0:
        raise ValueError("espefuse summary contained no JSON")
    summary, _ = json.JSONDecoder().raw_decode(output[json_start:])
    return summary, blocks


def check(output, baseline_dir=None):
    """Raise EfuseViolation unless the reader is safe to erase and reuse.

    Returns the chip MAC. The first check of a chip records its raw blocks in
    baseline_dir; later checks fail if any block differs.
    """
    summary, blocks = parse(output)
    problems = []
    for name, factory in FACTORY_VALUES.items():
        if name not in summary:
            problems.append(f"{name} missing from espefuse summary (not an ESP32-S3?)")
        elif summary[name].get("value") != factory:
            problems.append(f"{name} = {summary[name].get('value')!r} (factory {factory!r})")
    mac = str(summary.get("MAC", {}).get("value", "")).split(" ")[0].lower()
    if not re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac):
        problems.append(f"Unreadable chip MAC {mac!r}")
    if baseline_dir is not None and not problems:
        baseline = Path(baseline_dir) / f"{mac.replace(':', '')}.json"
        if baseline.exists():
            recorded = json.loads(baseline.read_text())["blocks"]
            changed = sorted(name for name in recorded.keys() | blocks.keys()
                             if recorded.get(name) != blocks.get(name))
            if changed:
                problems.append(f"eFuse blocks changed since first seen: {', '.join(changed)}")
        else:
            baseline.parent.mkdir(parents=True, exist_ok=True)
            partial = baseline.with_suffix(".partial")
            partial.write_text(json.dumps({"mac": mac, "blocks": blocks}, indent=2) + "\n")
            partial.replace(baseline)
    if problems:
        raise EfuseViolation("; ".join(problems))
    return mac
