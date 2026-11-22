import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
FIRMWARE_DIR = os.path.dirname(TOOLS_DIR)
sys.path.insert(0, TOOLS_DIR)
sys.path.insert(0, FIRMWARE_DIR)
import check_release_build as c  # noqa: E402
import build_firmwares as b  # noqa: E402

SERIAL = "/src/serial/serialCommandHandler.cpp"


def partition_table(*app_sizes):
    """A binary partition table with nvs and one app partition per size."""
    def row(kind, subtype, offset, size, name):
        return b"\xaa\x50" + bytes([kind, subtype]) + offset.to_bytes(4, "little") + size.to_bytes(4, "little") + \
            name.encode().ljust(16, b"\x00") + bytes(4)
    rows = [row(1, 2, 0x9000, 0x5000, "nvs")]
    offset = 0x10000
    for index, size in enumerate(app_sizes):
        rows.append(row(0, 0x10 + index, offset, size, f"app{index}"))
        offset += size
    return b"".join(rows) + b"\xeb\xeb" + bytes(30) + b"\xff" * 32


def entry(defines, file=SERIAL):
    return {"file": file, "command": "xtensa-gcc " + " ".join(f"-D{d}" for d in defines) + " -c " + file}


class CompileCommands(unittest.TestCase):
    def test_release_defines_pass(self):
        self.assertEqual(c.check_compile_commands([entry(["FIRMWARE_VERSION=\"1\"", "LOG_LEVEL=ERROR"])]), [])

    def test_each_lab_define_fails(self):
        for define in c.LAB_ONLY_DEFINES:
            errors = c.check_compile_commands([entry([define])])
            self.assertEqual(len(errors), 1, define)
            self.assertIn(define, errors[0])

    def test_perf_monitor_define_fails(self):
        self.assertEqual(len(c.check_compile_commands([entry(["ATTRACTAP_LV_PERF_MONITOR=1"])])), 1)

    def test_arguments_form_is_read(self):
        commands = [{"file": SERIAL, "arguments": ["gcc", "-DATTRACTAP_CRASH_TRIGGER=1", SERIAL]}]
        self.assertEqual(len(c.check_compile_commands(commands)), 1)

    def test_malformed_input_is_a_gate_error(self):
        with self.assertRaises(c.GateError):
            c.check_compile_commands({"file": SERIAL})


class AppImage(unittest.TestCase):
    def test_trigger_topic_fails(self):
        self.assertEqual(len(c.check_app_image(b"\x00prefix debug.crash suffix")), 1)

    def test_stats_topic_fails(self):
        self.assertEqual(len(c.check_app_image(b"\x00prefix debug.stats suffix")), 1)

    def test_lab_ca_fails(self):
        self.assertEqual(len(c.check_app_image(b"\x00Attractap Device Lab CA (lab builds only)\x00")), 1)

    def test_clean_image_passes(self):
        self.assertEqual(c.check_app_image(b"\x00 debug.log auth.status.get"), [])


class AppHeadroom(unittest.TestCase):
    def test_image_with_headroom_passes(self):
        self.assertEqual(c.check_app_headroom(0x174360, partition_table(0x1f0000, 0x1f0000)), [])

    def test_image_without_headroom_fails(self):
        errors = c.check_app_headroom(0x1c0000, partition_table(0x1f0000, 0x1f0000))
        self.assertEqual(len(errors), 1)
        self.assertIn("less than 10%", errors[0])

    def test_smallest_slot_counts(self):
        self.assertEqual(len(c.check_app_headroom(0x180000, partition_table(0x640000, 0x1a0000))), 1)

    def test_table_without_app_is_a_gate_error(self):
        with self.assertRaises(c.GateError):
            c.check_app_headroom(1, partition_table())

    def test_garbage_table_is_a_gate_error(self):
        with self.assertRaises(c.GateError):
            c.check_app_headroom(1, b"\x00" * 64)


RELEASE_SDKCONFIG_H = "#define CONFIG_FREERTOS_HZ 1000\n#define CONFIG_FREERTOS_USE_TRACE_FACILITY 1\n"
STATS_SDKCONFIG_H = RELEASE_SDKCONFIG_H + "#define CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS 1\n"


class SdkconfigHeader(unittest.TestCase):
    def test_release_config_passes(self):
        self.assertEqual(c.check_sdkconfig_header(RELEASE_SDKCONFIG_H), [])

    def test_run_time_stats_fail(self):
        errors = c.check_sdkconfig_header(STATS_SDKCONFIG_H)
        self.assertEqual(len(errors), 1)
        self.assertIn("CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS", errors[0])

    def test_similar_names_pass(self):
        self.assertEqual(c.check_sdkconfig_header("#define CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS_X 1\n"), [])


class SdkconfigFragments(unittest.TestCase):
    """sdkconfig.debug carries the same run-time stats options as sdkconfig.lab-stats (README "Task stats")."""

    @staticmethod
    def options(name):
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), name)) as f:
            return {line.strip() for line in f if line.startswith("CONFIG_")}

    def test_debug_overlay_has_every_lab_stats_option(self):
        lab_stats = self.options("sdkconfig.lab-stats")
        self.assertIn("CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS=y", lab_stats)
        self.assertEqual(lab_stats - self.options("sdkconfig.debug"), set())


class BuildDirectory(unittest.TestCase):
    def build_dir(self, defines, image, sdkconfig_h=RELEASE_SDKCONFIG_H):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        with open(os.path.join(tmp.name, "compile_commands.json"), "w") as f:
            json.dump([entry(defines)], f)
        with open(os.path.join(tmp.name, c.APP_IMAGE), "wb") as f:
            f.write(image)
        os.makedirs(os.path.join(tmp.name, "partition_table"))
        with open(os.path.join(tmp.name, c.PARTITION_TABLE), "wb") as f:
            f.write(partition_table(0x640000, 0x640000))
        os.makedirs(os.path.join(tmp.name, "config"))
        with open(os.path.join(tmp.name, c.SDKCONFIG_HEADER), "w") as f:
            f.write(sdkconfig_h)
        return tmp.name

    def run_main(self, build_dir):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return c.main([build_dir])

    def test_release_build_passes(self):
        self.assertEqual(self.run_main(self.build_dir(["LOG_LEVEL=ERROR"], b"app")), 0)

    def test_crash_trigger_build_fails(self):
        self.assertEqual(self.run_main(self.build_dir(["ATTRACTAP_CRASH_TRIGGER=1"], b"debug.crash")), 1)

    def test_run_time_stats_build_fails(self):
        self.assertEqual(self.run_main(self.build_dir(["LOG_LEVEL=ERROR"], b"app", STATS_SDKCONFIG_H)), 1)

    def test_missing_build_fails(self):
        self.assertEqual(self.run_main(os.path.join(tempfile.gettempdir(), "no-such-attractap-build")), 1)


class ReleaseBuildFlags(unittest.TestCase):
    def test_release_builds_force_the_crash_trigger_off(self):
        # The build fails right away (run_idf), so nothing is built or cleaned.
        with mock.patch.object(b, "run_idf", return_value=1) as run_idf, \
                mock.patch.object(b.os.path, "exists", return_value=False), \
                contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            b.build_variant("attractap-touch-v2", "variants/attractap-touch-v2.cmake", "ERROR")
        args = run_idf.call_args[0][0]
        self.assertIn("-DATTRACTAP_CRASH_TRIGGER=OFF", args)
        self.assertIn("-DATTRACTAP_TEST_HOOKS=OFF", args)
        self.assertIn("-DATTRACTAP_LV_PERF_MONITOR=OFF", args)
        self.assertIn("-DATTRACTAP_LAB_CA=", args)

    def test_secure_release_builds_clear_the_lab_ca(self):
        with mock.patch.object(b, "run_idf", return_value=1) as run_idf, \
                mock.patch.object(b.os.path, "exists", return_value=False), \
                contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            b.build_variant("attractap-touch-v2", "variants/attractap-touch-v2.cmake", "ERROR", secure=True)
        args = run_idf.call_args[0][0]
        self.assertIn("-DATTRACTAP_SECURE_PROFILE=ON", args)
        self.assertIn("-DATTRACTAP_LAB_CA=", args)
        self.assertIn("-DATTRACTAP_TEST_HOOKS=OFF", args)


if __name__ == "__main__":
    unittest.main()
