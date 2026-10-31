"""Unit tests for tools/secure_lab_reader.py. Every device and espefuse/esptool
call is mocked: nothing here talks to a port or burns anything."""

import argparse
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import secure_lab_reader as r  # noqa: E402

DIGESTS = ("aa" * 32, "bb" * 32)
MAC = "dc:b4:d9:21:71:c8"
EMPTY_BLOCK = " ".join(["00"] * 32)


def spaced(hex_digest):
    return " ".join(hex_digest[i:i + 2] for i in range(0, len(hex_digest), 2))


def efuses(secure_boot=False, crypt_raw="0x0", crypt_writeable=True, digests_burned=False, used_keys=(),
           manual_encrypt_disabled=False, chip_mac=MAC):
    """An `espefuse summary --format json` shaped dict (only the fields the tool reads)."""
    fuses = {
        "MAC": {"value": f"{chip_mac} (OK)", "raw_value": "0x0"},
        "SECURE_BOOT_EN": {"value": secure_boot},
        "SPI_BOOT_CRYPT_CNT": {"value": "Enable" if crypt_raw in ("0x1", "0x7") else "Disable",
                               "raw_value": crypt_raw, "writeable": crypt_writeable},
        "DIS_DOWNLOAD_MANUAL_ENCRYPT": {"value": manual_encrypt_disabled},
        "ENABLE_SECURITY_DOWNLOAD": {"value": False},
        "SECURE_VERSION": {"value": 0},
        "RD_DIS": {"value": 0},
    }
    for i in range(6):
        fuses[f"KEY_PURPOSE_{i}"] = {"value": "USER"}
        fuses[f"BLOCK_KEY{i}"] = {"value": EMPTY_BLOCK}
    if digests_burned:
        for i, purpose in enumerate(("SECURE_BOOT_DIGEST0", "SECURE_BOOT_DIGEST1")):
            fuses[f"KEY_PURPOSE_{i}"] = {"value": purpose}
            fuses[f"BLOCK_KEY{i}"] = {"value": spaced(DIGESTS[i])}
    for i in used_keys:
        fuses[f"KEY_PURPOSE_{i}"] = {"value": "XTS_AES_128_KEY"}
        fuses[f"BLOCK_KEY{i}"] = {"value": spaced("11" * 32)}
    return fuses


def write_build(root, lab=True):
    os.makedirs(os.path.join(root, "config"))
    os.makedirs(os.path.join(root, "bootloader"))
    os.makedirs(os.path.join(root, "partition_table"))
    config = {"SECURE_BOOT_V2_ENABLED": True, "SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT": lab,
              "SECURE_FLASH_ENCRYPTION_MODE_RELEASE": not lab}
    with open(os.path.join(root, "config", "sdkconfig.json"), "w") as f:
        json.dump(config, f)
    with open(os.path.join(root, "flasher_args.json"), "w") as f:
        json.dump({
            "partition-table": {"offset": "0x8000", "file": "partition_table/partition-table.bin", "encrypted": "true"},
            "otadata": {"offset": "0xe000", "file": "ota_data_initial.bin", "encrypted": "true"},
            "app": {"offset": "0x10000", "file": "attractap.bin", "encrypted": "true"},
        }, f)
    for rel in ("bootloader/bootloader.bin", "partition_table/partition-table.bin", "ota_data_initial.bin",
                "attractap.bin"):
        open(os.path.join(root, rel), "wb").close()


class Helpers(unittest.TestCase):
    def test_crypt_cnt_uses_the_raw_count(self):
        for raw, expected in (("0x0", 0), ("0x1", 1), ("0x3", 3), ("0x7", 7)):
            self.assertEqual(r.crypt_cnt(efuses(crypt_raw=raw)), expected)

    def test_mac_is_normalised(self):
        self.assertEqual(r.mac(efuses(chip_mac="DC:B4:D9:21:71:C8")), MAC)

    def test_lab_digests_burned(self):
        self.assertTrue(r.lab_digests_burned(efuses(digests_burned=True), DIGESTS))
        self.assertFalse(r.lab_digests_burned(efuses(), DIGESTS))

    def test_flash_layout_accepts_a_lab_build(self):
        with tempfile.TemporaryDirectory() as build:
            write_build(build)
            images = r.flash_layout(build)
        self.assertEqual([(o, sign) for o, _, _, sign in images],
                         [("0x0", True), ("0x8000", False), ("0xe000", False), ("0x10000", True)])

    def test_flash_layout_refuses_a_release_build(self):
        with tempfile.TemporaryDirectory() as build:
            write_build(build, lab=False)
            with self.assertRaisesRegex(r.LabReaderError, "not a lab secure build"):
                r.flash_layout(build)

    def test_flash_layout_reports_missing_build_cleanly(self):
        with self.assertRaisesRegex(r.LabReaderError, "cannot read"):
            r.flash_layout("/nonexistent/build")

    def test_missing_tool_is_a_clean_error(self):
        with mock.patch.object(r.subprocess, "run", side_effect=FileNotFoundError()), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(r.LabReaderError, "ESP-IDF environment"):
                r.run(["espefuse", "summary"])


class Provision(unittest.TestCase):
    def provision(self, fuses, burn=True, expect_mac=MAC, after_burn=None):
        commands = []
        reads = iter([fuses, after_burn or efuses(digests_burned=True)])
        args = argparse.Namespace(port="/dev/fake", build_dir=self.build, burn_efuses=burn, expect_mac=expect_mac)
        with mock.patch.object(r, "read_efuses", side_effect=lambda port: next(reads)), \
                mock.patch.object(r, "key_digest", side_effect=lambda path: DIGESTS[path == r.RECOVERY_KEY]), \
                mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd)), \
                contextlib.redirect_stdout(io.StringIO()):
            r.cmd_provision(args)
        return commands

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.build = tmp.name
        write_build(self.build)

    def burns(self, commands):
        return [c for c in commands if "burn-key-digest" in c]

    def test_fresh_reader_burns_both_digests_then_writes(self):
        commands = self.provision(efuses())
        (burn,) = self.burns(commands)
        self.assertEqual(burn[burn.index("burn-key-digest") + 1:],
                         ["BLOCK_KEY0", r.SIGNING_KEY, "SECURE_BOOT_DIGEST0",
                          "BLOCK_KEY1", r.RECOVERY_KEY, "SECURE_BOOT_DIGEST1"])
        self.assertIn("erase-flash", commands[1])
        self.assertIn("write-flash", commands[2])

    def test_wrong_mac_burns_nothing(self):
        with self.assertRaisesRegex(r.LabReaderError, "refusing to provision"):
            self.provision(efuses(), expect_mac="00:11:22:33:44:55")

    def test_without_burn_flag_burns_nothing(self):
        with self.assertRaisesRegex(r.LabReaderError, "--burn-efuses"):
            self.provision(efuses(), burn=False)

    def test_secure_boot_already_on_is_refused(self):
        with self.assertRaisesRegex(r.LabReaderError, "already on"):
            self.provision(efuses(secure_boot=True))

    def test_flash_encryption_count_3_is_refused(self):
        # espefuse shows raw 3 as "Disable"; the raw count must still block provisioning.
        with self.assertRaisesRegex(r.LabReaderError, "already on"):
            self.provision(efuses(crypt_raw="0x3"))

    def test_used_key_block_is_refused(self):
        with self.assertRaisesRegex(r.LabReaderError, "KEY2 is already in use"):
            self.provision(efuses(used_keys=(2,)))

    def test_failed_read_back_stops_before_writing(self):
        with self.assertRaisesRegex(r.LabReaderError, "did not read back"):
            self.provision(efuses(), after_burn=efuses())

    def test_already_burned_digests_skip_the_burn(self):
        commands = self.provision(efuses(digests_burned=True), burn=False)
        self.assertEqual(self.burns(commands), [])


class Flash(unittest.TestCase):
    def flash(self, fuses):
        commands = []
        with tempfile.TemporaryDirectory() as build:
            write_build(build)
            args = argparse.Namespace(port="/dev/fake", build_dir=build, erase_all=False)
            with mock.patch.object(r, "read_efuses", return_value=fuses), \
                    mock.patch.object(r, "key_digest", side_effect=lambda path: DIGESTS[path == r.RECOVERY_KEY]), \
                    mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                    mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd)), \
                    contextlib.redirect_stdout(io.StringIO()):
                r.cmd_flash(args)
        return commands

    def test_development_mode_lab_reader_is_flashed_encrypted(self):
        (cmd,) = self.flash(efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True))
        self.assertIn("--encrypt", cmd)
        self.assertIn("--force", cmd)

    def test_re_enabled_development_mode_count_7_is_flashed(self):
        (cmd,) = self.flash(efuses(secure_boot=True, crypt_raw="0x7", digests_burned=True))
        self.assertIn("--encrypt", cmd)

    def test_release_mode_reader_is_refused(self):
        for fuses in (efuses(secure_boot=True, crypt_raw="0x7", manual_encrypt_disabled=True, digests_burned=True),
                      efuses(secure_boot=True, crypt_raw="0x7", crypt_writeable=False, digests_burned=True),
                      efuses(secure_boot=True, crypt_raw="0x3", digests_burned=True),
                      efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, manual_encrypt_disabled=True)):
            with self.assertRaisesRegex(r.LabReaderError, "not in development mode"):
                self.flash(fuses)

    def test_non_lab_reader_is_refused(self):
        with self.assertRaisesRegex(r.LabReaderError, "Not a provisioned lab reader"):
            self.flash(efuses(secure_boot=True, crypt_raw="0x1"))


if __name__ == "__main__":
    unittest.main()
