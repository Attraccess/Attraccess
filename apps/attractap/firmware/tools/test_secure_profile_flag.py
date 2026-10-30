import os
import sys
import unittest

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, FIRMWARE_DIR)
import build_firmwares as b  # noqa: E402

FLAG = 'set(ATTRACTAP_SECURE_PROFILE_HARDWARE_TESTED "%s")\n'
DEMO = 'set(ATTRACTAP_FIRMWARE_VARIANT "demo")\n'


class SecureProfileFlag(unittest.TestCase):
    def test_all_shipped_variants_start_false(self):
        for name in b.RELEASE_VARIANTS:
            with open(os.path.join(FIRMWARE_DIR, "variants", name + ".cmake")) as f:
                self.assertIs(b.secure_profile_hardware_tested(name, f.read()), False, name)

    def test_true_for_regular_variant(self):
        self.assertIs(b.secure_profile_hardware_tested("attractap-touch-v2", FLAG % "true"), True)

    def test_missing_line_is_false(self):
        self.assertIs(b.secure_profile_hardware_tested("attractap-touch-v2", "set(X \"y\")\n"), False)

    def test_demo_variant_true_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "must not be marked"):
            b.secure_profile_hardware_tested("attractap-touch-v2-demo", DEMO + FLAG % "true")

    def test_demo_is_read_from_the_variant_file(self):
        with open(os.path.join(FIRMWARE_DIR, "variants", "attractap-touch-v2-demo.cmake")) as f:
            self.assertTrue(b.is_demo_variant(f.read()))
        with open(os.path.join(FIRMWARE_DIR, "variants", "attractap-touch-v2.cmake")) as f:
            self.assertFalse(b.is_demo_variant(f.read()))

    def test_unknown_value_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "must be"):
            b.secure_profile_hardware_tested("attractap-touch-v2", FLAG % "yes")


if __name__ == "__main__":
    unittest.main()
