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

BUILD = 'set(ATTRACTAP_SECURE_PROFILE_BUILD "%s")\n'


class SecureProfileBuildSwitch(unittest.TestCase):
    def variant(self, name):
        with open(os.path.join(FIRMWARE_DIR, "variants", name + ".cmake")) as f:
            return f.read()

    def test_only_touch_v2_builds_secure(self):
        enabled = [n for n in b.RELEASE_VARIANTS if b.secure_profile_build_enabled(n, self.variant(n))]
        self.assertEqual(enabled, ["attractap-touch-v2"])

    def test_missing_line_is_off(self):
        self.assertIs(b.secure_profile_build_enabled("x", "set(X \"y\")\n"), False)

    def test_demo_variant_can_never_enable_it(self):
        with self.assertRaisesRegex(ValueError, "must not enable"):
            b.secure_profile_build_enabled("attractap-touch-demo", DEMO + BUILD % "true")

    def test_unknown_value_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "must be"):
            b.secure_profile_build_enabled("x", BUILD % "yes")

    def test_hardware_tested_stays_false_everywhere(self):
        for n in b.RELEASE_VARIANTS:
            self.assertIs(b.secure_profile_hardware_tested(n, self.variant(n)), False, n)


if __name__ == "__main__":
    unittest.main()
