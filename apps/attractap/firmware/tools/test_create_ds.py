"""Tests for the DS record format and `secure_lab_reader.py create-ds` / restore. Nothing here touches a
port: espefuse, esptool and the reader console are mocked."""

import argparse
import base64
import contextlib
import hashlib
import io
import os
import struct
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_record  # noqa: E402
import secure_lab_reader as r  # noqa: E402
from test_secure_lab_reader import DIGESTS, MAC, efuses, write_build  # noqa: E402

SPKI = (bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f003082018a0282018100")
        + b"\xc3" + bytes(383) + bytes.fromhex("0203010001"))


def make_record(spki=SPKI, key_block=3, ciphertext=b"\x07" * 1200):
    payload = struct.pack("<BBH16sH", key_block, 0, 95, b"\x01" * 16, len(ciphertext)) + ciphertext \
        + struct.pack("<H", len(spki)) + spki
    return b"ATDS" + struct.pack("<HHI", 1, 0, len(payload)) + hashlib.sha256(payload).digest() + payload


def secure_lab(**extra):
    """The lab reader just before the burn: KEY2 XTS and KEY4 HMAC_UP read-protected, KEY3 unused."""
    fuses = efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, used_keys=(2,))
    fuses["KEY_PURPOSE_4"] = {"value": "HMAC_UP"}
    for name in ("BLOCK_KEY2", "BLOCK_KEY4"):
        fuses[name] = {"value": "?? " * 31 + "??", "readable": False}
    fuses.update(extra)
    return fuses


def burned():
    return secure_lab(KEY_PURPOSE_3={"value": r.DS_PURPOSE}, BLOCK_KEY3={"value": "?? ??", "readable": False},
                      RD_DIS={"value": 28, "writeable": False})


class RecordFormat(unittest.TestCase):
    def test_parse_returns_fields_and_key(self):
        fields = ds_record.parse(make_record())
        self.assertEqual((fields["keyBlock"], fields["rsaLength"], fields["spki"]), (3, 95, SPKI))

    def test_sector_pads_with_ff_and_exact_strips_it(self):
        record = make_record()
        sector = ds_record.sector(record)
        self.assertEqual(len(sector), 4096)
        self.assertEqual(sector[len(record):], b"\xff" * (4096 - len(record)))
        self.assertEqual(ds_record.exact(sector), record)

    def test_damage_is_refused(self):
        record = bytearray(make_record())
        for index, message in ((0, "magic"), (50, "checksum")):
            broken = bytearray(record)
            broken[index] ^= 1
            with self.assertRaisesRegex(ds_record.DsRecordError, message):
                ds_record.parse(bytes(broken))
        with self.assertRaises(ds_record.DsRecordError):
            ds_record.parse(bytes(record[:-5]))

    def test_other_keys_are_refused(self):
        for spki in (SPKI[:-5] + bytes.fromhex("0203010003"), b"\x30" + SPKI[1:60] + bytes(300),
                     SPKI[:10] + b"\x07" + SPKI[11:], SPKI[:33] + b"\x43" + SPKI[34:]):
            with self.assertRaises(ds_record.DsRecordError):
                ds_record.parse(make_record(spki=spki))

    def test_pem_and_fingerprint(self):
        pem = ds_record.spki_pem(SPKI)
        self.assertTrue(pem.startswith("-----BEGIN PUBLIC KEY-----\n") and pem.endswith("-----END PUBLIC KEY-----\n"))
        body = "".join(pem.splitlines()[1:-1])
        self.assertEqual(base64.b64decode(body), SPKI)
        self.assertEqual(ds_record.fingerprint(SPKI), hashlib.sha256(SPKI).hexdigest())


class PreChecks(unittest.TestCase):
    def problems(self, fuses):
        return r.ds_precheck_problems(fuses, DIGESTS)

    def test_the_expected_lab_state_passes(self):
        self.assertEqual(self.problems(secure_lab()), [])

    def test_every_surprise_is_reported(self):
        cases = {
            "not the approved": efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, chip_mac="00:11:22:33:44:55"),
            "Secure Boot is not enabled": secure_lab(SECURE_BOOT_EN={"value": False}),
            "lab key digests": efuses(secure_boot=True, crypt_raw="0x1", used_keys=(2,)),
            "development mode": secure_lab(DIS_DOWNLOAD_MANUAL_ENCRYPT={"value": True}),
            "KEY2 purpose": secure_lab(KEY_PURPOSE_2={"value": "USER"}),
            "KEY2 is not read-protected": secure_lab(BLOCK_KEY2={"value": "11 22"}),
            "KEY4 purpose": secure_lab(KEY_PURPOSE_4={"value": "USER"}),
            "KEY3 is not unused": secure_lab(KEY_PURPOSE_3={"value": "XTS_AES_128_KEY"}),
            "KEY3 is already read-protected": secure_lab(BLOCK_KEY3={"value": "?? ??", "readable": False}),
            "RD_DIS is already write-protected": secure_lab(RD_DIS={"value": 20, "writeable": False}),
        }
        for message, fuses in cases.items():
            with self.subTest(message):
                self.assertTrue(any(message in problem for problem in self.problems(fuses)), self.problems(fuses))

    def test_a_key3_with_data_but_purpose_user_is_not_unused(self):
        self.assertTrue(self.problems(secure_lab(BLOCK_KEY3={"value": spaced_one()})))

    def test_burned_state(self):
        self.assertEqual(r.ds_burned_problems(burned()), [])
        self.assertEqual(len(r.ds_burned_problems(secure_lab())), 3)


def spaced_one():
    return " ".join(["00"] * 31 + ["01"])


class Console:
    """Scripted reader console: command name -> reply."""

    def __init__(self, replies):
        self.replies, self.sent = replies, []

    def __call__(self, port, command, pattern, timeout, baud=115200):
        self.sent.append(command)
        reply = self.replies[command.split()[0]]
        if isinstance(reply, Exception):
            raise reply
        return reply


class CreateDs(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = tmp.name
        self.out = os.path.join(self.tmp, "out", "dcb4d92171c8")
        self.record = make_record()
        export = "DS_RECORD_BEGIN\nI (123) log line\n" + base64.b64encode(self.record).decode() \
            + "\nDS_RECORD_END"
        self.console = Console({
            "ds.status": "DS_STATUS available=0 record=0 key3=unused fe=development",
            "ds.create": "DS_CREATE_RESULT ok", "ds.export": export})
        self.dumps = []

    def run_command(self, burn=True, expect=r.APPROVED_DS_MAC, before=None, after=None, console=None, out=None):
        reads = iter([before or secure_lab(), after or burned()])
        args = argparse.Namespace(port="/dev/fake", expect_mac=expect, burn_efuses=burn, dump_dir=self.tmp,
                                  out_dir=out or self.out, baud=115200)

        def dump(port, path):
            self.dumps.append(path)
            return next(reads)

        statuses = [self.console.replies["ds.status"], "DS_STATUS available=1 record=1 key3=hmac-ds fe=development"]
        scripted = console or self.console
        original = scripted.replies["ds.status"]

        def exchange(port, command, pattern, timeout, baud=115200):
            if command == "ds.status":
                scripted.sent.append(command)
                return statuses.pop(0) if scripted is self.console else original
            return scripted(port, command, pattern, timeout, baud)

        with mock.patch.object(r, "dump_efuses", side_effect=dump), \
                mock.patch.object(r, "key_digest", side_effect=lambda path: DIGESTS[path == r.RECOVERY_KEY]), \
                mock.patch.object(r, "console_exchange", side_effect=exchange), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            r.cmd_create_ds(args)
        return output.getvalue()

    def test_other_macs_are_refused_before_anything_runs(self):
        for mac in ("00:11:22:33:44:55", "DC:B4:D9:21:71:C9"):
            with mock.patch.object(r, "dump_efuses") as dump, self.assertRaisesRegex(r.LabReaderError, "approved for"):
                self.run_command(expect=mac)
            dump.assert_not_called()

    def test_the_chip_must_be_the_approved_one_even_with_the_right_flag(self):
        other = efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, chip_mac="00:11:22:33:44:55")
        with self.assertRaisesRegex(r.LabReaderError, "not the approved"):
            self.run_command(before=other)
        self.assertEqual(self.console.sent, [])

    def test_without_the_burn_flag_only_the_read_only_checks_run(self):
        text = self.run_command(burn=False)
        self.assertIn("Dry run", text)
        self.assertEqual(self.console.sent, [])
        self.assertEqual(len(self.dumps), 1)
        self.assertFalse(os.path.exists(self.out))

    def test_a_failed_pre_check_stops_before_the_console(self):
        with self.assertRaisesRegex(r.LabReaderError, "nothing was burned"):
            self.run_command(before=secure_lab(KEY_PURPOSE_3={"value": "HMAC_UP"}))
        self.assertEqual(self.console.sent, [])

    def test_an_existing_record_stops_everything(self):
        os.makedirs(self.out)
        open(os.path.join(self.out, "ds-record.bin"), "wb").close()
        with mock.patch.object(r, "dump_efuses") as dump, self.assertRaisesRegex(r.LabReaderError, "already holds"):
            self.run_command()
        dump.assert_not_called()

    def test_firmware_that_already_has_a_ds_key_stops_before_the_burn(self):
        self.console.replies["ds.status"] = "DS_STATUS available=1 record=1 key3=hmac-ds fe=development"
        with self.assertRaisesRegex(r.LabReaderError, "expected a secure-lab build"):
            self.run_command()
        self.assertEqual(self.console.sent, ["ds.status"])

    def test_success_burns_once_dumps_twice_and_saves_the_files(self):
        text = self.run_command()
        self.assertEqual(self.console.sent, ["ds.status", f"ds.create {r.APPROVED_DS_MAC}", "ds.export", "ds.status"])
        self.assertEqual([os.path.basename(p) for p in self.dumps], ["efuse-before.txt", "efuse-after.txt"])
        with open(os.path.join(self.out, "ds-record.bin"), "rb") as f:
            self.assertEqual(f.read(), self.record)
        with open(os.path.join(self.out, "ds-public-key.pem")) as f:
            self.assertEqual(f.read(), ds_record.spki_pem(SPKI))
        self.assertIn(ds_record.fingerprint(SPKI), text)

    def test_a_failed_creation_is_reported_never_retried(self):
        self.console.replies["ds.create"] = "DS_CREATE_RESULT error 7"
        with self.assertRaisesRegex(r.LabReaderError, "Do not retry"):
            self.run_command()
        self.assertEqual(self.console.sent.count(f"ds.create {r.APPROVED_DS_MAC}"), 1)
        self.assertEqual(len(self.dumps), 2, "the after-dump is taken even when creation failed")
        self.assertFalse(os.path.exists(os.path.join(self.out, "ds-record.bin")))

    def test_a_burn_that_does_not_read_back_is_an_error(self):
        with self.assertRaisesRegex(r.LabReaderError, "did not read back"):
            self.run_command(after=secure_lab())

    def test_a_damaged_export_is_not_saved(self):
        broken = bytearray(self.record)
        broken[60] ^= 1
        self.console.replies["ds.export"] = "DS_RECORD_BEGIN\n" + base64.b64encode(bytes(broken)).decode() \
            + "\nDS_RECORD_END"
        with self.assertRaises(ds_record.DsRecordError):
            self.run_command()
        self.assertFalse(os.path.exists(os.path.join(self.out, "ds-record.bin")))

    def test_a_different_committed_record_is_never_overwritten(self):
        with self.assertRaisesRegex(r.LabReaderError, "differs"):
            os.makedirs(self.out)
            with open(os.path.join(self.out, "ds-public-key.pem"), "w") as f:
                f.write("other")
            self.run_command()
        with open(os.path.join(self.dumps and self.tmp, "ds-record.bin"), "rb") as backup:
            self.assertEqual(backup.read(), self.record)

    def test_parse_export_ignores_log_lines(self):
        text = "DS_RECORD_BEGIN\nI (1) x: hello world\n" + base64.b64encode(b"abc").decode() + "\nDS_RECORD_END"
        self.assertEqual(r.parse_export(text), b"abc")


class Restore(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.ds = tmp.name
        self.record = make_record()

    def commit_record(self):
        os.makedirs(os.path.join(self.ds, "dcb4d92171c8"))
        with open(os.path.join(self.ds, "dcb4d92171c8", "ds-record.bin"), "wb") as f:
            f.write(self.record)

    def test_no_record_means_nothing_is_written(self):
        self.assertIsNone(r.restore_sector(MAC, self.ds))

    def test_a_damaged_record_blocks_the_wipe(self):
        self.commit_record()
        with open(os.path.join(self.ds, "dcb4d92171c8", "ds-record.bin"), "r+b") as f:
            f.seek(60)
            f.write(b"\x00")
        with self.assertRaisesRegex(r.LabReaderError, "refusing to wipe"):
            r.restore_sector(MAC, self.ds)

    def test_flash_writes_the_record_sector_encrypted_at_the_spiffs_start(self):
        self.commit_record()
        commands = []
        written = {}
        with tempfile.TemporaryDirectory() as build:
            write_build(build)
            args = argparse.Namespace(port="/dev/fake", build_dir=build, erase_all=True, ds_dir=self.ds)

            def run(cmd, capture=False):
                commands.append(cmd)
                if "write-flash" in cmd:
                    path = cmd[cmd.index("0xc90000") + 1]
                    with open(path, "rb") as f:
                        written["sector"] = f.read()

            with mock.patch.object(r, "read_efuses", return_value=efuses(secure_boot=True, crypt_raw="0x1",
                                                                         digests_burned=True)), \
                    mock.patch.object(r, "key_digest", side_effect=lambda p: DIGESTS[p == r.RECOVERY_KEY]), \
                    mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                    mock.patch.object(r, "run", side_effect=run), contextlib.redirect_stdout(io.StringIO()):
                r.cmd_flash(args)
        (cmd,) = commands
        self.assertIn("--encrypt", cmd)
        self.assertEqual(written["sector"], ds_record.sector(self.record))

    def test_flash_of_a_reader_without_record_is_unchanged(self):
        commands = []
        with tempfile.TemporaryDirectory() as build:
            write_build(build)
            args = argparse.Namespace(port="/dev/fake", build_dir=build, erase_all=False, ds_dir=self.ds)
            with mock.patch.object(r, "read_efuses", return_value=efuses(secure_boot=True, crypt_raw="0x1",
                                                                         digests_burned=True)), \
                    mock.patch.object(r, "key_digest", side_effect=lambda p: DIGESTS[p == r.RECOVERY_KEY]), \
                    mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                    mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd)), \
                    contextlib.redirect_stdout(io.StringIO()):
                r.cmd_flash(args)
        self.assertNotIn("0xc90000", commands[0])

    def test_hex_merges_the_record_only_when_asked(self):
        self.commit_record()
        for mac, merged in ((MAC, True), (None, False), ("00:11:22:33:44:55", False)):
            commands = []
            with tempfile.TemporaryDirectory() as root:
                write_build(root)
                with mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                        mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd)), \
                        contextlib.redirect_stdout(io.StringIO()):
                    r.write_hex_image(root, "/out/r.hex", ds_mac=mac, ds_directory=self.ds)
            self.assertEqual("0xc90000" in commands[0], merged, mac)


if __name__ == "__main__":
    unittest.main()
