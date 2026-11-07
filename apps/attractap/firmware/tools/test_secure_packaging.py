import json
import os
import sys
import tempfile
import unittest

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, FIRMWARE_DIR)
import secure_packaging as p  # noqa: E402


def make_build(root, app=b"app " + p.SECURE_PROFILE_MARKER.encode(), version="2"):
    files = {"app.bin": app, "bootloader/bootloader.bin": b"boot", "partition_table/partition-table.bin": b"table"}
    for name, data in files.items():
        os.makedirs(os.path.dirname(os.path.join(root, name)), exist_ok=True)
        with open(os.path.join(root, name), "wb") as f:
            f.write(data)
    with open(os.path.join(root, "flasher_args.json"), "w") as f:
        json.dump({"app": {"file": "app.bin"}, "bootloader": {"file": "bootloader/bootloader.bin"},
                   "partition-table": {"file": "partition_table/partition-table.bin"}}, f)
    with open(os.path.join(root, "sdkconfig"), "w") as f:
        f.write(f"CONFIG_X=1\nCONFIG_BOOTLOADER_APP_SECURE_VERSION={version}\n")


class SecurePackaging(unittest.TestCase):
    def test_packages_unsigned_images_with_hashes(self):
        with tempfile.TemporaryDirectory() as build, tempfile.TemporaryDirectory() as out:
            make_build(build)
            entry = p.package_secure_images(build, out, "attractap", "touch-v2")
            self.assertEqual(entry["appFilename"], "attractap_touch-v2_secure_app.bin")
            self.assertEqual(entry["bootloaderFilename"], "attractap_touch-v2_secure_bootloader.bin")
            self.assertEqual(entry["secureVersion"], 2)
            self.assertEqual(entry["profileMarker"], p.SECURE_PROFILE_MARKER)
            self.assertEqual(entry["bootloaderSha256"], p.sha256_file(os.path.join(build, "bootloader/bootloader.bin")))
            self.assertEqual(entry["partitionTableSha256"], p.sha256_file(os.path.join(build, "partition_table/partition-table.bin")))
            self.assertEqual(sorted(os.listdir(out)), [entry["appFilename"], entry["bootloaderFilename"]])

    def test_app_without_marker_is_not_packaged(self):
        with tempfile.TemporaryDirectory() as build, tempfile.TemporaryDirectory() as out:
            make_build(build, app=b"plain app")
            self.assertIsNone(p.package_secure_images(build, out, "attractap", "touch-v2"))
            self.assertEqual(os.listdir(out), [])

    def test_missing_secure_version_is_an_error(self):
        with tempfile.TemporaryDirectory() as build:
            make_build(build)
            with open(os.path.join(build, "sdkconfig"), "w") as f:
                f.write("CONFIG_X=1\n")
            with self.assertRaises(ValueError):
                p.secure_version(build)


if __name__ == "__main__":
    unittest.main()
