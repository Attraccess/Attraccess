import os
import struct
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_secure_profile as c  # noqa: E402

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = open(os.path.join(FIRMWARE_DIR, "sdkconfig.secure")).read()
CSV = open(os.path.join(FIRMWARE_DIR, "partitions.csv")).read()

# What ATT-1166 requires of the secure profile. Kept separate from sdkconfig.secure so
# deleting or flipping a line there fails this test instead of silently leaving the gate.
REQUIRED = {
    "SECURE_BOOT": "y",
    "SECURE_BOOT_V2_ENABLED": "y",
    "SECURE_BOOT_V2_RSA_ENABLED": "y",
    "SECURE_BOOT_BUILD_SIGNED_BINARIES": "n",
    "SECURE_BOOT_ALLOW_JTAG": "n",
    "SECURE_BOOT_INSECURE": "n",
    "SECURE_BOOT_ENABLE_AGGRESSIVE_KEY_REVOKE": "n",
    "SECURE_FLASH_ENC_ENABLED": "y",
    "SECURE_FLASH_ENCRYPTION_MODE_RELEASE": "y",
    "SECURE_FLASH_ENCRYPTION_AES128": "y",
    "EFUSE_VIRTUAL": "n",
    "SECURE_ENABLE_SECURE_ROM_DL_MODE": "y",
    "NVS_ENCRYPTION": "y",
    "NVS_SEC_KEY_PROTECT_USING_HMAC": "y",
    "BOOTLOADER_APP_ROLLBACK_ENABLE": "y",
    "BOOTLOADER_APP_ANTI_ROLLBACK": "y",
    "BOOTLOADER_EFUSE_SECURE_VERSION_EMULATE": "n",
    "ESP_CONSOLE_NONE": "y",
    "ESP_CONSOLE_SECONDARY_NONE": "y",
    "ESP_CONSOLE_USB_SERIAL_JTAG_ENABLED": "n",
    "ESP_SYSTEM_PANIC_GDBSTUB": "n",
    "ESP_SYSTEM_GDBSTUB_RUNTIME": "n",
    "ESP_COREDUMP_ENABLE_TO_NONE": "y",
    "BOOTLOADER_LOG_LEVEL_NONE": "y",
    "PARTITION_TABLE_CUSTOM_FILENAME": "partitions.csv",
    "PARTITION_TABLE_OFFSET": "0x8000",
    "MBEDTLS_INTERNAL_MEM_ALLOC": "y",
}


def build_table(entries):
    out = b""
    for name, ptype, subtype, offset, size, flags in entries:
        out += struct.pack("<HBBII16sI", c.PARTITION_MAGIC, ptype, subtype, offset, size, name.encode(), flags)
    return out + b"\xeb\xeb" + b"\xff" * 30


def write_build_dir(root, sdkconfig=PROFILE, bootloader_size=0x6000, table=None):
    os.makedirs(os.path.join(root, "bootloader"))
    os.makedirs(os.path.join(root, "partition_table"))
    with open(os.path.join(root, "sdkconfig"), "w") as f:
        f.write(sdkconfig)
    with open(os.path.join(root, "bootloader", "bootloader.bin"), "wb") as f:
        f.write(b"\0" * bootloader_size)
    with open(os.path.join(root, "partition_table", "partition-table.bin"), "wb") as f:
        f.write(table if table is not None else build_table(c.parse_partition_csv(CSV)))


class SecureProfileChecks(unittest.TestCase):
    def test_profile_satisfied_by_itself(self):
        self.assertEqual(c.check_profile(PROFILE, PROFILE), [])

    def test_profile_pins_every_required_option(self):
        profile = c.parse_sdkconfig(PROFILE)
        for key, value in REQUIRED.items():
            self.assertEqual(profile.get(key), value, f"sdkconfig.secure must pin CONFIG_{key}={value}")

    def test_missing_option_fails(self):
        resolved = PROFILE.replace("CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y\n", "")
        self.assertEqual(len(c.check_profile(PROFILE, resolved)), 1)

    def test_option_that_must_be_off_fails_when_on(self):
        resolved = PROFILE + "CONFIG_SECURE_BOOT_ALLOW_JTAG=y\n"
        self.assertEqual(len(c.check_profile(PROFILE, resolved)), 1)

    def test_bootloader_size_limit(self):
        self.assertEqual(c.check_bootloader_size(0x7000), [])  # 0x7000 + 0x1000 signature sector
        self.assertEqual(len(c.check_bootloader_size(0x7001)), 1)

    def test_partition_table_matches_repo_csv(self):
        table = build_table(c.parse_partition_csv(CSV))
        self.assertEqual(c.check_partition_table(CSV, table), [])

    def test_partition_table_drift_fails(self):
        entries = c.parse_partition_csv(CSV)
        entries[0] = entries[0][:4] + (entries[0][4] + 0x1000,) + entries[0][5:]
        self.assertEqual(len(c.check_partition_table(CSV, build_table(entries))), 1)

    def test_partition_flag_drift_fails(self):
        entries = c.parse_partition_csv(CSV)
        entries[0] = entries[0][:5] + (c.PARTITION_FLAGS["encrypted"],)
        self.assertEqual(len(c.check_partition_table(CSV, build_table(entries))), 1)

    def test_partition_csv_sizes_and_flags(self):
        (entry,) = c.parse_partition_csv("x, data, nvs_keys, 0x9000, 4K, encrypted\n")
        self.assertEqual(entry, ("x", 0x01, 0x04, 0x9000, 4096, 1))

    def test_secure_version_must_equal_floor(self):
        self.assertEqual(c.check_secure_version(2, 2), [])
        self.assertEqual(len(c.check_secure_version(1, 2)), 1)
        self.assertEqual(len(c.check_secure_version(3, 2)), 1)

    def test_floor_matches_profile_version(self):
        floor = int(c.read(os.path.join(FIRMWARE_DIR, "secure-version-floor.txt")))
        self.assertEqual(int(c.parse_sdkconfig(PROFILE)["BOOTLOADER_APP_SECURE_VERSION"]), floor)

    def test_run_checks_passes_for_a_matching_build(self):
        with tempfile.TemporaryDirectory() as build:
            write_build_dir(build)
            self.assertEqual(c.run_checks(build), [])

    def test_run_checks_reports_every_failure(self):
        with tempfile.TemporaryDirectory() as build:
            write_build_dir(build, sdkconfig=PROFILE.replace("CONFIG_NVS_ENCRYPTION=y\n", ""),
                            bootloader_size=0x7800, table=build_table([]))
            self.assertEqual(len(c.run_checks(build)), 3)


class BaseRefChecks(unittest.TestCase):
    def at_base(self, floor, profile_version):
        files = {
            "secure-version-floor.txt": None if floor is None else f"{floor}\n",
            "sdkconfig.secure": None if profile_version is None
            else f"CONFIG_BOOTLOADER_APP_SECURE_VERSION={profile_version}\n",
        }
        return mock.patch.object(c, "file_at_ref", lambda ref, name: files[name])

    def test_unchanged_passes(self):
        with self.at_base(1, 1):
            self.assertEqual(c.check_against_base("base"), [])

    def test_absent_on_base_passes(self):
        with self.at_base(None, None):
            self.assertEqual(c.check_against_base("base"), [])

    def test_lowering_both_files_fails(self):
        with self.at_base(3, 3):
            errors = c.check_against_base("base")
        self.assertEqual(len(errors), 2)
        self.assertIn("dropped from 3", errors[0])

    def test_lowering_only_the_profile_version_fails(self):
        with self.at_base(1, 2):
            self.assertEqual(len(c.check_against_base("base")), 1)


class GateInputErrors(unittest.TestCase):
    def test_non_numeric_value_is_a_clean_error(self):
        with self.assertRaises(c.GateError):
            c.parse_int("abc\n", "secure-version-floor.txt")

    def test_missing_file_is_a_clean_error(self):
        with tempfile.TemporaryDirectory() as empty:
            with self.assertRaises(c.GateError):
                c.run_checks(empty)

    def test_unresolvable_base_ref_is_a_clean_error(self):
        with self.assertRaises(c.GateError):
            c.file_at_ref("refs/does/not/exist", "sdkconfig.secure")

    def test_unknown_partition_subtype_is_a_clean_error(self):
        with self.assertRaises(c.GateError):
            c.parse_partition_csv("x, app, test, 0x10000, 0x1000,\n")

    def test_implicit_partition_offset_is_a_clean_error(self):
        with self.assertRaises(c.GateError):
            c.parse_partition_csv("x, data, nvs, , 0x1000,\n")

    def test_unknown_partition_flag_is_a_clean_error(self):
        with self.assertRaises(c.GateError):
            c.parse_partition_csv("x, data, nvs, 0x9000, 0x1000, secret\n")


if __name__ == "__main__":
    unittest.main()
