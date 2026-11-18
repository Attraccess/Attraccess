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
* One reader, the lab secure reader ``DS_MAC``, got an approved one-time burn (ATT-1207):
  KEY3 as HMAC_DOWN_DIGITAL_SIGNATURE (read-protected) and RD_DIS write-protected. It is
  accepted in exactly two states, before and after that burn. The first time the janitor
  sees the burned state, only the burn's own bits may differ from the recorded baseline;
  the baseline is then recorded again (the old one stays as ``<mac>.pre-ds.json``) and
  from then on only the exact burned state passes: there is no way back.
"""

import json
import logging
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

# The lab secure reader that got the approved DS burn (see the module docstring).
DS_MAC = "dc:b4:d9:21:71:c8"
DS_PURPOSE = "HMAC_DOWN_DIGITAL_SIGNATURE"
DS_KEY_BLOCK = "BLOCK_KEY3"
RD_DIS_KEY3 = 1 << 3
# The WR_DIS bits the burn sets, and only those (espefuse's summary JSON does not carry the wr_dis
# index). ESP32-S3 eFuse table (esp-idf components/efuse/esp32s3/esp_efuse_table.c, also espefuse's
# efuse_defs/esp32s3.yaml): bit 0 write-protects RD_DIS (the firmware burns it after the key), bit 11
# KEY_PURPOSE_3 and bit 26 BLOCK_KEY3; esp_efuse_write_key() sets those two with the key
# (esp_efuse_set_keypurpose_dis_write, esp_efuse_set_key_dis_write).
WR_DIS_ADDED_BY_BURN = (1 << 0) | (1 << 11) | (1 << 26)
DS_STATE_MARKER = "ds"

log = logging.getLogger(__name__)

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


def chip_mac(summary):
    """The factory MAC of an espefuse summary as aa:bb:cc:dd:ee:ff (espefuse appends " (OK)")."""
    return str(summary.get("MAC", {}).get("value", "")).split(" ")[0].lower()


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
    mac = chip_mac(summary)
    if not re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac):
        problems.append(f"Unreadable chip MAC {mac!r}")
    ds_state = None
    if profile == SECURE_LAB and mac == DS_MAC and not problems:
        ds_state, ds_problems = ds_burn_state(summary)
        problems += ds_problems
    if baseline_dir is not None and not problems:
        _check_baseline(Path(baseline_dir) / f"{mac.replace(':', '')}.json", mac, blocks, summary, profile,
                        ds_state, problems)
    if problems:
        raise EfuseViolation("; ".join(problems))
    return mac


def _write_baseline(path, mac, blocks, ds_state):
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".partial")
    entry = {"mac": mac, "blocks": blocks}
    if ds_state == "post":
        entry[DS_STATE_MARKER] = "post"
    partial.write_text(json.dumps(entry, indent=2) + "\n")
    partial.replace(path)


def _check_baseline(path, mac, blocks, summary, profile, ds_state, problems):
    """Record the chip's first dump, or compare against it; appends to ``problems``."""
    if not path.exists():
        _write_baseline(path, mac, blocks, ds_state)
        return
    recorded = json.loads(path.read_text())
    pre_ds = path.with_suffix(".pre-ds.json")
    already_post = pre_ds.exists() or recorded.get(DS_STATE_MARKER) == "post"
    if ds_state == "pre" and already_post:
        problems.append("KEY3/RD_DIS went back to the state before the DS burn")
        return
    if ds_state == "post" and not already_post:
        # First sight of the burned state: only the burn's own bits may differ.
        changes = _changes(recorded["blocks"], blocks, summary, profile, ds_transition=True)
        problems += changes
        if not changes:
            path.replace(pre_ds)
            _write_baseline(path, mac, blocks, ds_state)
            log.warning("%s: recorded post-DS baseline; previous kept as %s", mac, pre_ds.name)
        return
    problems += _changes(recorded["blocks"], blocks, summary, profile)


def ds_burn_state(summary):
    """("pre" | "post", problems) for KEY3 and RD_DIS of the DS lab reader.

    pre: KEY3 unused and readable, RD_DIS writable. post: KEY3 is the DS key (HMAC_DOWN_DIGITAL_SIGNATURE),
    read-protected, and RD_DIS is write-protected. Anything else, e.g. an interrupted burn, is a problem.
    """
    purpose = summary.get("KEY_PURPOSE_3", {}).get("value")
    key = summary.get(DS_KEY_BLOCK, {})
    rd_dis = summary.get("RD_DIS", {})
    key3_read_protected = key.get("readable") is False
    rd_dis_locked = rd_dis.get("writeable") is False
    rd_dis_key3 = isinstance(rd_dis.get("value"), int) and bool(rd_dis["value"] & RD_DIS_KEY3)
    if purpose == "USER" and not key3_read_protected and not rd_dis_locked and not rd_dis_key3:
        return "pre", []
    if purpose == DS_PURPOSE and key3_read_protected and rd_dis_locked and rd_dis_key3:
        return "post", []
    return None, [f"KEY3/RD_DIS match neither the state before nor after the DS burn (KEY_PURPOSE_3 = {purpose!r}, "
                  f"KEY3 read-protected {key3_read_protected}, RD_DIS write-protected {rd_dis_locked})"]


def _field(summary, name, default=None):
    field = summary.get(name) or {}
    if "word" in field and "pos" in field and "bit_len" in field:
        return field["word"], field["pos"], field["bit_len"]
    if default is None:
        raise ValueError(f"{name} has no layout in the summary")
    return default


def _get(words, layout):
    word, pos, length = layout
    return (words[word] >> pos) & ((1 << length) - 1)


def _clear(words, layout):
    word, pos, length = layout
    cleared = list(words)
    cleared[word] &= ~(((1 << length) - 1) << pos) & 0xFFFFFFFF
    return cleared


def _burn_bits_only(before, now, summary):
    """Problems unless BLOCK0 differs only by the DS burn: purpose 3 set, RD_DIS gained KEY3, WR_DIS bits added."""
    problems = []
    purpose, rd_dis, wr_dis = (_field(summary, "KEY_PURPOSE_3"), _field(summary, "RD_DIS"),
                               _field(summary, "WR_DIS", (0, 0, 32)))
    if _get(now, rd_dis) != _get(before, rd_dis) | RD_DIS_KEY3:
        problems.append("RD_DIS changed by more than KEY3's read protection")
    if _get(before, purpose) != 0 or _get(now, purpose) == 0:
        problems.append("KEY_PURPOSE_3 was not unused before the burn")
    old_wr, new_wr = _get(before, wr_dis), _get(now, wr_dis)
    if old_wr & ~new_wr or new_wr & ~old_wr & ~WR_DIS_ADDED_BY_BURN:
        problems.append(f"WR_DIS changed by more than the DS burn's bits (0x{old_wr:08x} -> 0x{new_wr:08x})")
    for layout in (purpose, rd_dis, wr_dis):
        before, now = _clear(before, layout), _clear(now, layout)
    if before != now:
        problems.append("eFuse blocks changed since first seen: BLOCK0 (besides the DS burn's bits)")
    return problems


def _changes(recorded, blocks, summary, profile, ds_transition=False):
    """Differences from the chip's baseline blocks that make it unsafe to reuse.

    ``ds_transition``: the baseline is from before the DS burn; its bits (BLOCK0 purpose 3, RD_DIS, WR_DIS
    and BLOCK_KEY3) may differ, nothing else.
    """
    problems = []
    if profile == SECURE_LAB:
        try:
            before, before_version = _without_secure_version(recorded["BLOCK0"], summary)
            now, now_version = _without_secure_version(blocks["BLOCK0"], summary)
        except (KeyError, ValueError, IndexError) as error:
            return [f"Cannot compare BLOCK0 without SECURE_VERSION: {error}"]
        if now_version < before_version:
            problems.append(f"SECURE_VERSION went from {before_version} to {now_version}")
        if ds_transition:
            try:
                problems += _burn_bits_only(before, now, summary)
            except ValueError as error:
                problems.append(f"Cannot compare BLOCK0 for the DS burn: {error}")
        elif now != before:
            problems.append("eFuse blocks changed since first seen: BLOCK0 (besides SECURE_VERSION)")
        skipped = {"BLOCK0", DS_KEY_BLOCK} if ds_transition else {"BLOCK0"}
        recorded, blocks = ({k: v for k, v in b.items() if k not in skipped} for b in (recorded, blocks))
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
