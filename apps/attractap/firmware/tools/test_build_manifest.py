import os
import sys
import unittest

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, FIRMWARE_DIR)
sys.path.insert(0, os.path.join(FIRMWARE_DIR, "tools"))
import build_firmwares as b  # noqa: E402

BRIDGE = "attractap-bridge-gl-s10"


def variant(name):
    with open(os.path.join(FIRMWARE_DIR, "variants", name + ".cmake")) as f:
        return f.read()


class VariantChip(unittest.TestCase):
    def test_s3_variants_default_to_esp32s3(self):
        for name in b.RELEASE_VARIANTS:
            if name != BRIDGE:
                self.assertEqual(b.variant_chip(name, variant(name)), "esp32s3", name)

    def test_bridge_is_a_classic_esp32_release_variant(self):
        content = variant(BRIDGE)
        self.assertIn(BRIDGE, b.RELEASE_VARIANTS)
        self.assertTrue(b.is_release_variant(content))
        self.assertEqual(b.variant_chip(BRIDGE, content), "esp32")
        self.assertEqual(b.BOARD_FAMILIES["esp32"], "ESP32")
        self.assertFalse(b.secure_profile_build_enabled(BRIDGE, content))

    def test_unknown_target_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported ATTRACTAP_IDF_TARGET"):
            b.variant_chip("x", 'set(ATTRACTAP_IDF_TARGET "esp32c6")\n')


class BleBridgeFlag(unittest.TestCase):
    def test_only_the_bridge_is_a_bridge(self):
        for name in b.RELEASE_VARIANTS:
            self.assertEqual(b.is_ble_bridge_variant(variant(name)), name == BRIDGE, name)

    def test_commented_define_does_not_count(self):
        self.assertFalse(b.is_ble_bridge_variant("set(ATTRACTAP_DEFINES\n    # ATTRACTAP_BLE_BRIDGE=1\n)\n"))


class FlashParameters(unittest.TestCase):
    FLASHER_ARGS = {"flash_settings": {"flash_mode": "dio", "flash_freq": "40m", "flash_size": "4MB"}}

    def test_s3_keeps_the_conservative_values(self):
        self.assertEqual(b.flash_parameters("esp32s3", self.FLASHER_ARGS),
                         {"flashMode": "dio", "flashFreq": "80m", "flashSize": "16MB"})

    def test_esp32_uses_the_image_settings(self):
        self.assertEqual(b.flash_parameters("esp32", self.FLASHER_ARGS),
                         {"flashMode": "dio", "flashFreq": "40m", "flashSize": "4MB"})


if __name__ == "__main__":
    unittest.main()
