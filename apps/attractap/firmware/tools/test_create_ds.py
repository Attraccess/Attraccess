"""Tests for the DS record format and `secure_lab_reader.py create-ds` / restore. Nothing here touches a
port: espefuse and esptool are mocked, and the reader console is a fake serial port that answers like the
firmware's serial handler (only `CMND <topic> [argument]` lines get a reply)."""

import argparse
import base64
import contextlib
import hashlib
import importlib.util
import io
import os
import struct
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import create_ds as c  # noqa: E402
import ds_record  # noqa: E402
import secure_lab_reader as r  # noqa: E402
from test_secure_lab_reader import DIGESTS, MAC, efuses, write_build  # noqa: E402

SPKI = (bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f003082018a0282018100")
        + b"\xc3" + bytes(383) + bytes.fromhex("0203010001"))
FINGERPRINT = hashlib.sha256(SPKI).hexdigest()
PRE_STATUS = "DS_STATUS available=0 record=0 key3=unused fe=development spki=-\n"
POST_STATUS = f"DS_STATUS available=1 record=1 key3=HMAC_DOWN_DIGITAL_SIGNATURE fe=development spki={FINGERPRINT}\n"


def make_record(spki=SPKI, key_block=3, ciphertext=b"\x07" * 1584, rsa_length=95):
    payload = struct.pack("<BBH16sH", key_block, 0, rsa_length, b"\x01" * 16, len(ciphertext)) + ciphertext \
        + struct.pack("<H", len(spki)) + spki
    return b"ATDS" + struct.pack("<HHI", 1, 0, len(payload)) + hashlib.sha256(payload).digest() + payload


def export_text(record):
    return "DS_RECORD_BEGIN\nI (123) log line\n" + base64.b64encode(record).decode() + "\nDS_RECORD_END\n"


def secure_lab(**extra):
    """The lab reader just before the burn: KEY2 XTS and KEY4 HMAC_UP read-protected, KEY3 unused."""
    fuses = efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, used_keys=(2,))
    fuses["KEY_PURPOSE_4"] = {"value": "HMAC_UP"}
    for name in ("BLOCK_KEY2", "BLOCK_KEY4"):
        fuses[name] = {"value": "?? " * 31 + "??", "readable": False}
    fuses.update(extra)
    return fuses


def burned():
    return secure_lab(KEY_PURPOSE_3={"value": c.DS_PURPOSE}, BLOCK_KEY3={"value": "?? ??", "readable": False},
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
        for index, message in ((0, "magic"), (4, "version"), (6, "version"), (50, "checksum")):
            broken = bytearray(record)
            broken[index] ^= 1
            with self.assertRaisesRegex(ds_record.DsRecordError, message):
                ds_record.parse(bytes(broken))
        with self.assertRaises(ds_record.DsRecordError):
            ds_record.parse(bytes(record[:-5]))

    def test_what_the_firmware_would_not_load_is_refused(self):
        for record, message in ((make_record(key_block=2), "key block"), (make_record(rsa_length=63), "RSA-3072"),
                                (make_record(ciphertext=b"\x07" * 1200), "RSA-3072")):
            with self.assertRaisesRegex(ds_record.DsRecordError, message):
                ds_record.parse(record)

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
        self.assertEqual(ds_record.fingerprint(SPKI), FINGERPRINT)


class PreChecks(unittest.TestCase):
    def problems(self, fuses):
        return c.ds_precheck_problems(fuses, DIGESTS)

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
        self.assertTrue(self.problems(secure_lab(BLOCK_KEY3={"value": " ".join(["00"] * 31 + ["01"])})))

    def test_burned_state(self):
        self.assertEqual(c.ds_burned_problems(burned()), [])
        self.assertEqual(len(c.ds_burned_problems(secure_lab())), 3)


class FakeReader:
    """The reader behind the port: replies by topic (a list is consumed in order; None stays silent).

    Records every write. Replies arrive in 7-byte reads, so a reply line is seen before its newline.
    `missing_opens`: the port is gone that many times (the reader re-enumerating after a reset)."""

    def __init__(self, replies, missing_opens=0):
        self.replies, self.written, self.missing_opens, self.clock = replies, [], missing_opens, 0.0

    def module(self):
        return types.SimpleNamespace(Serial=lambda: FakePort(self))

    def topics(self):
        return [line.split()[1] for line in self.written]


class FakePort:
    def __init__(self, reader):
        self.reader, self.pending, self.dtr, self.rts = reader, b"", True, True

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def open(self):
        assert self.dtr is False and self.rts is False, "opening must not reset the reader"
        if self.reader.missing_opens:
            self.reader.missing_opens -= 1
            raise OSError(2, "could not open port: No such file or directory")

    def reset_input_buffer(self):
        self.pending = b""

    def write(self, data):
        self.reader.written.append(data.decode())
        words = data.decode().split()
        if words[:1] != ["CMND"]:
            return  # the firmware's serial handler drops it
        reply = self.reader.replies.get(words[1])
        if isinstance(reply, list):
            reply = reply.pop(0)
        self.pending += (reply or "").encode()

    def read(self, size):
        if not self.pending:
            self.reader.clock += 0.5  # what a real read would wait for
        chunk, self.pending = self.pending[:min(size, 7)], self.pending[min(size, 7):]
        return chunk


class ConsoleProtocol(unittest.TestCase):
    def exchange(self, reader, *args):
        with mock.patch.dict(sys.modules, {"serial": reader.module()}), \
                mock.patch.object(c.time, "monotonic", lambda: reader.clock), mock.patch.object(c.time, "sleep"):
            return c.console_exchange("/dev/fake", *args)

    def test_commands_are_cmnd_lines_and_wait_for_the_whole_reply_line(self):
        reader = FakeReader({"ds.status": PRE_STATUS, "ds.create": "DS_CREATE_BURNED 1\nI (5) x\nDS_CREATE_RESULT ok "
                             f"spki={FINGERPRINT}\n"})
        self.assertEqual(self.exchange(reader, "ds.status", c.STATUS_PATTERN, 5), PRE_STATUS)
        reply = self.exchange(reader, f"ds.create {c.APPROVED_DS_MAC}", c.CREATE_PATTERN, 5)
        self.assertEqual(reader.written, ["\nCMND ds.status\n", "\nCMND ds.create dc:b4:d9:21:71:c8\n"])
        self.assertEqual(c.parse_create(reply), (f"ok spki={FINGERPRINT}", "1", FINGERPRINT))

    def test_a_missing_reply_times_out(self):
        with self.assertRaisesRegex(r.LabReaderError, "no answer to `ds.status` within 5s"):
            self.exchange(FakeReader({}), "ds.status", c.STATUS_PATTERN, 5)

    def test_a_mac_mismatch_has_no_burned_line(self):
        self.assertEqual(c.parse_create("DS_CREATE_RESULT error mac-mismatch\n"), ("error mac-mismatch", None, None))

    def test_parse_export_ignores_log_lines(self):
        text = "DS_RECORD_BEGIN\nI (1) x: hello world\n" + base64.b64encode(b"abc").decode() + "\nDS_RECORD_END"
        self.assertEqual(c.parse_export(text), b"abc")

    def test_dump_efuses_hard_resets_the_reader_afterwards(self):
        commands = []
        output = '=== Run "dump" command ===\n=== Run "summary" command ===\n{"MAC": {"value": "x"}}'
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd) or output):
            self.assertEqual(c.dump_efuses("/dev/fake", os.path.join(tmp, "dump.txt")), {"MAC": {"value": "x"}})
        (cmd,) = commands
        # A global espefuse option: it must come before the `dump` command.
        self.assertEqual(cmd[cmd.index("--after"):cmd.index("dump")], ["--after", "hard-reset"])


class CreateDs(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = tmp.name
        self.dump = os.path.join(self.tmp, "dump")
        self.out = os.path.join(self.tmp, "out", "dcb4d92171c8")
        self.record = make_record()
        self.reader = FakeReader({
            "ds.status": [PRE_STATUS, POST_STATUS],
            "ds.create": f"DS_CREATE_BURNED 1\nDS_CREATE_RESULT ok spki={FINGERPRINT}\n",
            "ds.export": export_text(self.record)})
        self.dumps = []

    def run_command(self, burn=True, expect=c.APPROVED_DS_MAC, before=None, after=None, out="default"):
        reads = iter([before or secure_lab(), after or burned()])
        args = argparse.Namespace(port="/dev/fake", expect_mac=expect, burn_efuses=burn, dump_dir=self.dump,
                                  out_dir=self.out if out == "default" else out, baud=115200)

        def dump(port, path):
            self.dumps.append(path)
            return next(reads)

        with mock.patch.object(c, "dump_efuses", side_effect=dump), \
                mock.patch.object(r, "key_digest", side_effect=lambda path: DIGESTS[path == r.RECOVERY_KEY]), \
                mock.patch.dict(sys.modules, {"serial": self.reader.module()}), \
                mock.patch.object(c.time, "monotonic", lambda: self.reader.clock), \
                mock.patch.object(c.time, "sleep"), contextlib.redirect_stdout(io.StringIO()) as output:
            c.cmd_create_ds(args)
        return output.getvalue()

    def saved(self, directory, name="ds-record.bin"):
        path = os.path.join(directory, name)
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return f.read()

    def test_other_macs_are_refused_before_anything_runs(self):
        for mac in ("00:11:22:33:44:55", "DC:B4:D9:21:71:C9", "not-a-mac"):
            with mock.patch.object(c, "dump_efuses") as dump, self.assertRaises(r.LabReaderError):
                self.run_command(expect=mac)
            dump.assert_not_called()

    def test_the_mac_may_be_typed_with_dashes_and_capitals(self):
        self.assertIn("Dry run", self.run_command(burn=False, expect="DC-B4-D9-21-71-C8"))

    def test_the_chip_must_be_the_approved_one_even_with_the_right_flag(self):
        other = efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True, chip_mac="00:11:22:33:44:55")
        with self.assertRaisesRegex(r.LabReaderError, "not the approved"):
            self.run_command(before=other)
        self.assertEqual(self.reader.written, [])

    def test_without_the_burn_flag_only_the_read_only_checks_run(self):
        self.assertIn("Dry run", self.run_command(burn=False))
        self.assertEqual(self.reader.written, [])
        self.assertEqual(len(self.dumps), 1)
        self.assertFalse(os.path.exists(self.out))

    def test_a_failed_pre_check_stops_before_the_console(self):
        with self.assertRaisesRegex(r.LabReaderError, "nothing was burned"):
            self.run_command(before=secure_lab(KEY_PURPOSE_3={"value": "HMAC_UP"}))
        self.assertEqual(self.reader.written, [])

    def test_an_existing_record_stops_everything(self):
        os.makedirs(self.out)
        open(os.path.join(self.out, "ds-record.bin"), "wb").close()
        with mock.patch.object(c, "dump_efuses") as dump, self.assertRaisesRegex(r.LabReaderError, "already holds"):
            self.run_command()
        dump.assert_not_called()

    def test_the_default_out_dir_follows_the_ds_directory_variable(self):
        with mock.patch.dict(os.environ, {r.DS_DIR_ENV: os.path.join(self.tmp, "env-ds")}):
            text = self.run_command(burn=False, out=None)
        self.assertIn(os.path.join(self.tmp, "env-ds", "dcb4d92171c8"), text)

    def test_firmware_that_already_has_a_ds_key_stops_before_the_burn(self):
        self.reader.replies["ds.status"] = [POST_STATUS]
        with self.assertRaisesRegex(r.LabReaderError, "expected a secure-lab build"):
            self.run_command()
        self.assertEqual(self.reader.topics(), ["ds.status"])

    def test_success_burns_once_and_saves_the_verified_files(self):
        text = self.run_command()
        self.assertEqual(self.reader.written, ["\nCMND ds.status\n", "\nCMND ds.create dc:b4:d9:21:71:c8\n",
                                               "\nCMND ds.status\n", "\nCMND ds.export\n"])
        self.assertEqual([os.path.basename(p) for p in self.dumps], ["efuse-before.txt", "efuse-after.txt"])
        self.assertEqual(self.saved(self.out), self.record)
        self.assertEqual(self.saved(self.dump), self.record)
        self.assertEqual(self.saved(self.out, "ds-public-key.pem").decode(), ds_record.spki_pem(SPKI))
        self.assertIn(FINGERPRINT, text)
        self.assertIn("verified", text)

    def test_the_console_is_awaited_after_each_eFuse_dump(self):
        # espefuse's hard reset reboots the reader: the port is gone, then the app is not up yet.
        self.reader.missing_opens = 2
        self.reader.replies["ds.status"] = [None, PRE_STATUS, None, None, POST_STATUS]
        self.run_command()
        self.assertEqual(self.reader.topics(), ["ds.status", "ds.status", "ds.create", "ds.status", "ds.status",
                                                "ds.status", "ds.export"])
        self.assertEqual(self.saved(self.out), self.record)

    def test_a_console_that_never_answers_stops_before_the_burn(self):
        self.reader.replies["ds.status"] = None
        with self.assertRaisesRegex(r.LabReaderError, "did not answer `ds.status` within 60s"):
            self.run_command()
        self.assertNotIn("ds.create", self.reader.topics())

    def test_a_failed_creation_without_a_burn_is_reported_never_retried(self):
        self.reader.replies["ds.create"] = "DS_CREATE_BURNED 0\nDS_CREATE_RESULT error keygen\n"
        with self.assertRaisesRegex(r.LabReaderError, "error keygen; KEY3 reads unburned"):
            self.run_command(after=secure_lab())
        self.assertEqual(self.reader.topics(), ["ds.status", "ds.create"])
        self.assertEqual(len(self.dumps), 2, "the after-dump is taken even when creation failed")
        self.assertIsNone(self.saved(self.out))

    def test_no_answer_to_ds_create_with_an_unburned_key3_is_never_retried(self):
        self.reader.replies["ds.create"] = None
        with self.assertRaisesRegex(r.LabReaderError, "no answer to `ds.create`.*State unknown: do not retry"):
            self.run_command(after=secure_lab())
        self.assertEqual(self.reader.topics(), ["ds.status", "ds.create"])
        self.assertEqual(len(self.dumps), 2, "the after-dump is taken when ds.create never answered")

    def test_no_answer_to_ds_create_after_a_burn_still_saves_the_record(self):
        self.reader.replies["ds.create"] = None
        with self.assertRaisesRegex(r.LabReaderError, "after KEY3 was burned.*saved to"):
            self.run_command()
        self.assertEqual(self.reader.topics(), ["ds.status", "ds.create", "ds.status", "ds.export"])
        self.assertEqual(self.saved(self.out), self.record)

    def test_a_failed_creation_after_the_burn_still_saves_the_record(self):
        self.reader.replies["ds.create"] = "DS_CREATE_BURNED 1\nDS_CREATE_RESULT error record-readback\n"
        with self.assertRaisesRegex(r.LabReaderError, "after KEY3 was burned.*saved to"):
            self.run_command()
        self.assertEqual(self.reader.topics(), ["ds.status", "ds.create", "ds.status", "ds.export"])
        self.assertEqual(self.saved(self.out), self.record)
        self.assertEqual(self.saved(self.dump), self.record)

    def test_a_burned_reader_without_a_burned_line_is_still_salvaged(self):
        self.reader.replies["ds.create"] = "DS_CREATE_RESULT error record-write\n"
        with self.assertRaisesRegex(r.LabReaderError, "after KEY3 was burned"):
            self.run_command()
        self.assertEqual(self.saved(self.dump), self.record)

    def test_a_record_error_is_reported_instead_of_waiting(self):
        self.reader.replies["ds.create"] = "DS_CREATE_BURNED 1\nDS_CREATE_RESULT error record-write\n"
        self.reader.replies["ds.export"] = "DS_RECORD_ERROR no-record\n"
        with self.assertRaisesRegex(r.LabReaderError, "DS_RECORD_ERROR no-record.*Do not retry"):
            self.run_command()
        self.reader.replies["ds.create"] = f"DS_CREATE_BURNED 1\nDS_CREATE_RESULT ok spki={FINGERPRINT}\n"
        self.reader.replies["ds.status"] = [PRE_STATUS, POST_STATUS]
        with self.assertRaisesRegex(r.LabReaderError, "ds.export answered DS_RECORD_ERROR no-record"):
            self.run_command()
        self.assertLess(self.reader.clock, 30, "an error reply must not wait for the export timeout")

    def test_a_burn_that_does_not_read_back_is_an_error(self):
        with self.assertRaisesRegex(r.LabReaderError, "did not read back"):
            self.run_command(after=secure_lab(KEY_PURPOSE_3={"value": c.DS_PURPOSE}))
        self.assertEqual(self.saved(self.out), self.record, "the record is saved before the read-back error")

    def test_a_damaged_export_is_not_saved_but_kept_raw(self):
        broken = bytearray(self.record)
        broken[60] ^= 1
        self.reader.replies["ds.export"] = export_text(bytes(broken))
        with self.assertRaises(ds_record.DsRecordError):
            self.run_command()
        self.assertIsNone(self.saved(self.out))
        self.assertIn(base64.b64encode(bytes(broken)), self.saved(self.dump, "ds-export.txt"))

    def test_a_record_with_another_key_than_the_created_one_is_not_committed(self):
        other = "ab" * 32
        cases = {"DS_CREATE_RESULT spki": {"ds.create": f"DS_CREATE_BURNED 1\nDS_CREATE_RESULT ok spki={other}\n"},
                 "reported no spki": {"ds.create": "DS_CREATE_BURNED 1\nDS_CREATE_RESULT ok\n"},
                 "DS_STATUS spki": {"ds.status": [PRE_STATUS, POST_STATUS.replace(FINGERPRINT, other)]}}
        for message, replies in cases.items():
            with self.subTest(message):
                self.reader.replies.update({"ds.status": [PRE_STATUS, POST_STATUS],
                                            "ds.create": f"DS_CREATE_BURNED 1\nDS_CREATE_RESULT ok spki={FINGERPRINT}\n"})
                self.reader.replies.update(replies)
                with self.assertRaisesRegex(r.LabReaderError, f"not verified: .*{message}"):
                    self.run_command()
                self.assertIsNone(self.saved(self.out))
                self.assertIsNone(self.saved(self.out, "ds-public-key.pem"))
                self.assertEqual(self.saved(self.dump), self.record)

    def test_a_different_committed_record_is_never_overwritten(self):
        os.makedirs(self.out)
        with open(os.path.join(self.out, "ds-public-key.pem"), "w") as f:
            f.write("other")
        with self.assertRaisesRegex(r.LabReaderError, "differs"):
            self.run_command()
        self.assertEqual(self.saved(self.dump), self.record)


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

    def flash(self, fuses, erase_all):
        commands, written = [], {}
        with tempfile.TemporaryDirectory() as build:
            write_build(build)
            args = argparse.Namespace(port="/dev/fake", build_dir=build, erase_all=erase_all, ds_dir=self.ds)

            def run(cmd, capture=False):
                commands.append(cmd)
                if "0xc90000" in cmd:
                    with open(cmd[cmd.index("0xc90000") + 1], "rb") as f:
                        written["sector"] = f.read()

            with mock.patch.object(r, "read_efuses", return_value=fuses), \
                    mock.patch.object(r, "key_digest", side_effect=lambda p: DIGESTS[p == r.RECOVERY_KEY]), \
                    mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                    mock.patch.object(r, "run", side_effect=run), contextlib.redirect_stdout(io.StringIO()):
                r.cmd_flash(args)
        return commands, written

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
        (cmd,), written = self.flash(efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True), True)
        self.assertIn("--encrypt", cmd)
        self.assertEqual(written["sector"], ds_record.sector(self.record))

    def test_flash_of_a_reader_without_record_is_unchanged(self):
        (cmd,), _ = self.flash(efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True), False)
        self.assertNotIn("0xc90000", cmd)

    def test_erasing_a_burned_reader_needs_its_record(self):
        fuses = efuses(secure_boot=True, crypt_raw="0x1", digests_burned=True)
        fuses["KEY_PURPOSE_3"] = {"value": c.DS_PURPOSE}
        with self.assertRaisesRegex(r.LabReaderError, "refusing to erase"):
            self.flash(fuses, True)
        self.assertEqual(len(self.flash(fuses, False)[0]), 1, "a flash without erase keeps the record in place")
        self.commit_record()
        (cmd,), written = self.flash(fuses, True)
        self.assertIn("--erase-all", cmd)
        self.assertEqual(written["sector"], ds_record.sector(self.record))

    def test_hex_merges_the_record_only_when_asked(self):
        self.commit_record()
        for mac, merged in ((MAC, True), ("DC-B4-D9-21-71-C8", True), ("dcb4d92171c8", True), (None, False),
                            ("00:11:22:33:44:55", False)):
            commands = []
            with tempfile.TemporaryDirectory() as root:
                write_build(root)
                with mock.patch.object(r, "signed_images", side_effect=lambda images, tmp: [i[:3] for i in images]), \
                        mock.patch.object(r, "run", side_effect=lambda cmd, capture=False: commands.append(cmd)), \
                        contextlib.redirect_stdout(io.StringIO()) as output:
                    r.write_hex_image(root, "/out/r.hex", ds_mac=mac, ds_directory=self.ds)
            self.assertEqual("0xc90000" in commands[0], merged, mac)
            if mac:
                notice = "Also merging the DS record for" if merged else "No DS record for 00:11:22:33:44:55"
                self.assertIn(notice, output.getvalue())


# The janitor's copy of the record checks (apps/attractap-lab/src/attractap_lab/ds_record.py; that package is
# built without the firmware tree) must agree with ds_record.py: same sector for a valid record, and every
# record refused here refused by a lab restore too.
LAB_DS_RECORD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "attractap-lab", "src",
                             "attractap_lab", "ds_record.py")


def load_lab_parser():
    spec = importlib.util.spec_from_file_location("lab_ds_record_under_test", LAB_DS_RECORD)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def flipped(record, index):
    data = bytearray(record)
    data[index] ^= 1
    return bytes(data)


@unittest.skipUnless(os.path.isfile(LAB_DS_RECORD), "the attractap-lab sources are not next to the firmware tools")
class LabParserAgrees(unittest.TestCase):
    def setUp(self):
        self.lab = load_lab_parser()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = tmp.name

    def lab_restore(self, record):
        path = os.path.join(self.dir, "dcb4d92171c8", "ds-record.bin")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(record)
        return self.lab.restore_sector(c.APPROVED_DS_MAC, self.dir)

    def test_the_constants_match(self):
        self.assertEqual((self.lab.DS_RECORD_OFFSET, self.lab.SECTOR_SIZE),
                         (ds_record.DS_RECORD_OFFSET, ds_record.SECTOR_SIZE))

    def test_a_valid_record_restores_to_the_same_sector_and_key(self):
        for record in (make_record(), ds_record.sector(make_record())):
            self.assertEqual(self.lab_restore(record), ds_record.sector(record))
            self.assertEqual(self.lab.parse(record), (ds_record.exact(record), ds_record.parse(record)["spki"]))
        self.assertEqual(self.lab.fingerprint(c.APPROVED_DS_MAC, self.dir), ds_record.fingerprint(SPKI))

    def test_every_record_the_tools_refuse_is_refused_by_the_lab_restore(self):
        record = make_record()
        refused = {
            "magic": flipped(record, 0), "version": flipped(record, 4), "reserved": flipped(record, 6),
            "length": flipped(record, 8), "checksum": flipped(record, 12), "payload": flipped(record, 60),
            "truncated": record[:-5], "short": record[:40], "oversized": record + bytes(4096),
            "key block": make_record(key_block=2), "rsa length": make_record(rsa_length=63),
            "ciphertext": make_record(ciphertext=b"\x07" * 1200),
            "exponent": make_record(spki=SPKI[:-5] + bytes.fromhex("0203010003")),
            "modulus": make_record(spki=SPKI[:33] + b"\x43" + SPKI[34:]),
            "spki framing": make_record(spki=SPKI[:10] + b"\x07" + SPKI[11:]),
        }
        for name, broken in refused.items():
            with self.subTest(name):
                with self.assertRaises(ds_record.DsRecordError):
                    ds_record.parse(broken)
                with self.assertRaises(self.lab.DsRecordError):
                    self.lab_restore(broken)


if __name__ == "__main__":
    unittest.main()
