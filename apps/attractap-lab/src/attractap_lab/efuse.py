"""Refuse to reuse a reader whose eFuses were burned.

eFuses are one-time programmable: no erase undoes secure boot, flash
encryption, key blocks or a disabled download/USB path. Two checks run on the
output of ``ESPToolDriver.read_efuses()``:

* ESP32-S3 security fields must hold the values of the place's reader profile:
  factory values for ``plain`` readers; for ``secure-lab`` readers (ATT-1166)
  Secure Boot with the lab key digests in KEY0/KEY1, the unused digest slot
  revoked, JTAG off and flash encryption still in development mode, so the
  reader stays re-flashable over USB and boots the lab-signed parking image.
* Raw eFuse blocks must match the first dump recorded for the chip (by MAC),
  which also catches burns the summary cannot show, e.g. SPI_BOOT_CRYPT_CNT
  going from 0 to 3 still reads "Disable", or from 1 to 7 still "Enable". A
  secure-lab reader's firmware burns SECURE_VERSION when it boots an image with
  a higher anti-rollback version, so for it those BLOCK0 bits are masked out of
  the comparison and may only grow.
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

PLAIN = "plain"
SECURE_LAB = "secure-lab"
PROFILES = (PLAIN, SECURE_LAB)

# Development-mode lab secure reader (apps/attractap/firmware/lab/secure-boot).
# Its first secure boot also burns the XTS and NVS HMAC keys; the baseline pins
# them and every other bit.
SECURE_LAB_VALUES = {
    "SECURE_BOOT_EN": True,
    "KEY_PURPOSE_0": "SECURE_BOOT_DIGEST0",
    "KEY_PURPOSE_1": "SECURE_BOOT_DIGEST1",
    "SECURE_BOOT_KEY_REVOKE0": False,
    "SECURE_BOOT_KEY_REVOKE1": False,
    # Only the two lab keys may sign: the third digest slot is revoked.
    "SECURE_BOOT_KEY_REVOKE2": True,
    "DIS_PAD_JTAG": True,
    "DIS_USB_JTAG": True,
    "SPI_BOOT_CRYPT_CNT": "Enable",
    # Release-mode flash encryption burns this: only signed OTA updates remain.
    "DIS_DOWNLOAD_MANUAL_ENCRYPT": False,
    **{name: False for name in (
        "DIS_DOWNLOAD_MODE", "ENABLE_SECURITY_DOWNLOAD", "DIS_FORCE_DOWNLOAD",
        "DIS_USB_SERIAL_JTAG", "DIS_USB_SERIAL_JTAG_DOWNLOAD_MODE",
    )},
}
EXPECTED_VALUES = {PLAIN: FACTORY_VALUES, SECURE_LAB: SECURE_LAB_VALUES}
# SHA-256 digests of the public lab keys (`espsecure digest-sbv2-public-key` of
# lab-signing-key.pem and lab-recovery-key.pem), as espefuse prints the blocks.
# A reader with other keys would reject the lab-signed parking image.
LAB_KEY_DIGESTS = {
    "BLOCK_KEY0": "fd0e62812a67e20c36a85321733343e8ebd420e2d7940bbfd49ac9e1c502b29d",
    "BLOCK_KEY1": "65c97f279aa20b82d134fd6cc0eeb39d51e42a50d9c3d771f25b42e6487fafd9",
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


def check(output, baseline_dir=None, profile=PLAIN):
    """Raise EfuseViolation unless the reader is safe to erase and reuse.

    Returns the chip MAC. The first check of a chip records its raw blocks and
    summary fields in baseline_dir; later checks fail if they changed (see the
    module docstring for secure-lab readers).
    """
    if profile not in PROFILES:
        raise ValueError(f"Unknown reader profile {profile!r}; expected one of {', '.join(PROFILES)}")
    summary, blocks = parse(output)
    problems = []
    for name, expected in EXPECTED_VALUES[profile].items():
        if name not in summary:
            problems.append(f"{name} missing from espefuse summary (not an ESP32-S3?)")
        elif summary[name].get("value") != expected:
            problems.append(f"{name} = {summary[name].get('value')!r} ({profile} reader needs {expected!r})")
    if profile == SECURE_LAB:
        for name, digest in LAB_KEY_DIGESTS.items():
            fused = "".join(str(summary.get(name, {}).get("value", "")).split()).lower()
            if fused != digest:
                problems.append(f"{name} does not hold the lab key digest")
    mac = str(summary.get("MAC", {}).get("value", "")).split(" ")[0].lower()
    if not re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac):
        problems.append(f"Unreadable chip MAC {mac!r}")
    if baseline_dir is not None and not problems:
        baseline = Path(baseline_dir) / f"{mac.replace(':', '')}.json"
        if baseline.exists():
            problems += _changes(json.loads(baseline.read_text())["blocks"], blocks, summary, profile)
        else:
            baseline.parent.mkdir(parents=True, exist_ok=True)
            partial = baseline.with_suffix(".partial")
            partial.write_text(json.dumps({"mac": mac, "blocks": blocks}, indent=2) + "\n")
            partial.replace(baseline)
    if problems:
        raise EfuseViolation("; ".join(problems))
    return mac


def _changes(recorded, blocks, summary, profile):
    """Differences from the chip's baseline blocks that make it unsafe to reuse."""
    problems = []
    if profile == SECURE_LAB:
        try:
            before, before_version = _without_secure_version(recorded["BLOCK0"], summary)
            now, now_version = _without_secure_version(blocks["BLOCK0"], summary)
        except (KeyError, ValueError, IndexError) as error:
            return [f"Cannot compare BLOCK0 without SECURE_VERSION: {error}"]
        if now_version < before_version:
            problems.append(f"SECURE_VERSION went from {before_version} to {now_version}")
        if now != before:
            problems.append("eFuse blocks changed since first seen: BLOCK0 (besides SECURE_VERSION)")
        recorded, blocks = ({k: v for k, v in b.items() if k != "BLOCK0"} for b in (recorded, blocks))
    changed = sorted(name for name in recorded.keys() | blocks.keys() if recorded.get(name) != blocks.get(name))
    if changed:
        problems.append(f"eFuse blocks changed since first seen: {', '.join(changed)}")
    return problems


def _without_secure_version(block0, summary):
    """BLOCK0 words with the SECURE_VERSION bits cleared, and SECURE_VERSION."""
    field = summary["SECURE_VERSION"]
    word, pos, length = field["word"], field["pos"], field["bit_len"]
    if field.get("block") not in (0, None) or pos + length > 32:
        raise ValueError(f"unexpected SECURE_VERSION layout {field}")
    words = [int(value, 16) for value in block0.split()]
    mask = ((1 << length) - 1) << pos
    version = (words[word] & mask) >> pos
    words[word] &= ~mask & 0xFFFFFFFF
    return words, version
