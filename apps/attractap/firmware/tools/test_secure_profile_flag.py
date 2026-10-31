import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, FIRMWARE_DIR)
import build_firmwares as b  # noqa: E402

FLAG = 'set(ATTRACTAP_SECURE_PROFILE_HARDWARE_TESTED "%s")\n'
DEMO = 'set(ATTRACTAP_FIRMWARE_VARIANT "demo")\n'
BUILD = 'set(ATTRACTAP_SECURE_PROFILE_BUILD "%s")\n'


class SecureProfileFlag(unittest.TestCase):
    def test_all_shipped_variants_start_false(self):
        for name in b.RELEASE_VARIANTS:
            with open(os.path.join(FIRMWARE_DIR, "variants", name + ".cmake")) as f:
                self.assertIs(b.secure_profile_hardware_tested(name, f.read()), False, name)

    def test_true_for_regular_variant(self):
        self.assertIs(b.secure_profile_hardware_tested("attractap-touch-v2", FLAG % "true" + BUILD % "true"), True)

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

    def test_value_is_case_insensitive_and_may_be_unquoted(self):
        self.assertIs(b.secure_profile_build_enabled("x", BUILD % "TRUE"), True)
        self.assertIs(b.secure_profile_build_enabled("x", "set(ATTRACTAP_SECURE_PROFILE_BUILD true)\n"), True)

    def test_cmake_style_on_is_rejected_not_read_as_false(self):
        with self.assertRaisesRegex(ValueError, "must be"):
            b.secure_profile_build_enabled("x", "set(ATTRACTAP_SECURE_PROFILE_BUILD ON)\n")

    def test_unparseable_or_duplicate_line_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "cannot parse"):
            b.secure_profile_build_enabled("x", 'set(ATTRACTAP_SECURE_PROFILE_BUILD "true" CACHE BOOL "")\n')
        with self.assertRaisesRegex(ValueError, "more than once"):
            b.secure_profile_build_enabled("x", BUILD % "true" + BUILD % "false")

    def test_comments_mentioning_the_flag_are_ignored(self):
        self.assertIs(b.secure_profile_build_enabled("x", "# ATTRACTAP_SECURE_PROFILE_BUILD: see README\n"), False)

    def test_hardware_tested_requires_the_secure_build(self):
        with self.assertRaisesRegex(ValueError, "would not build or gate"):
            b.secure_profile_hardware_tested("x", FLAG % "true")
        self.assertIs(b.secure_profile_hardware_tested("x", FLAG % "true" + BUILD % "true"), True)


class ReleaseBuildRunsTheSecureGate(unittest.TestCase):
    """Drive main() with the IDF build and the gate mocked out (no compiler, no hardware)."""

    def run_main(self, gate_returncode=0):
        cwd = os.getcwd()
        self.addCleanup(os.chdir, cwd)
        out_dir, build_dir = tempfile.TemporaryDirectory(), tempfile.TemporaryDirectory()
        self.addCleanup(out_dir.cleanup)
        self.addCleanup(build_dir.cleanup)
        out, build_root = out_dir.name, build_dir.name
        calls = []

        def build_variant(variant, variant_path, log_level, secure=False):
            calls.append((variant, secure))
            build_dir = os.path.join(build_root, variant + ("-secure" if secure else ""))
            os.makedirs(build_dir, exist_ok=True)
            open(os.path.join(build_dir, "app.bin"), "wb").close()
            return build_dir, [], {"app": {"file": "app.bin"}}

        gate_runs = []

        def fake_run(cmd, *a, **k):
            gate_runs.append(cmd)
            return subprocess.CompletedProcess(cmd, gate_returncode)

        with mock.patch.object(b.shutil, "which", return_value="/usr/bin/idf.py"), \
                mock.patch.object(b, "resolve_esptool_command", return_value=["esptool"]), \
                mock.patch.object(b, "generate_certificates"), \
                mock.patch.object(b, "prepare_output", return_value=out), \
                mock.patch.object(b, "build_variant", side_effect=build_variant), \
                mock.patch.object(b, "run_merge_bin"), \
                mock.patch.object(b.subprocess, "run", side_effect=fake_run), \
                contextlib.redirect_stdout(io.StringIO()):
            b.main([])
        return calls, gate_runs, out

    def test_touch_v2_gets_a_secure_build_and_gate(self):
        calls, gate_runs, out = self.run_main()
        self.assertEqual([v for v, secure in calls if secure], ["attractap-touch-v2"])
        self.assertEqual(len(gate_runs), 1)
        self.assertTrue(gate_runs[0][-2].endswith("check_secure_profile.py"))
        self.assertTrue(gate_runs[0][-1].endswith("attractap-touch-v2-secure"))
        with open(os.path.join(out, "firmwares.json")) as f:
            manifest = json.load(f)["firmwares"]
        self.assertEqual(len(manifest), len(b.RELEASE_VARIANTS))
        self.assertTrue(all(fw["secureProfileHardwareTested"] is False for fw in manifest))
        self.assertFalse(any("secure" in name for name in os.listdir(out)))

    def test_failing_gate_fails_the_build(self):
        with self.assertRaises(SystemExit) as exit_:
            self.run_main(gate_returncode=1)
        self.assertEqual(exit_.exception.code, 1)


if __name__ == "__main__":
    unittest.main()
