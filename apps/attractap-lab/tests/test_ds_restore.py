"""DS record restore after a wipe (ATT-1207): record lookup and validation, the wipe guard in the driver, janitor
parking, the HIL suite's write_secure_image and the janitor's quarantine of a reader without its record."""

import contextlib
import hashlib
import importlib.util
from pathlib import Path
import struct
import sys

from labgrid.binding import BindingState
import pytest

from attractap_lab import ds_record, janitor, workflow
from attractap_lab.drivers import ESPToolDriver
from attractap_lab.workflow import park
from test_efuse_ds import DS_MAC, OTHER_MAC, POST_WORDS, output
from test_janitor import FakeConsole, FakeFlash, FakeTarget

HIL = Path(__file__).parents[1] / "hil"
SPKI = (bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f003082018a0282018100")
        + b"\xc3" + bytes(383) + bytes.fromhex("0203010001"))


def make_record(key_block=3, ciphertext=b"\x07" * 1584, spki=SPKI, version=1):
    """A record as the firmware writes it (format: apps/attractap/firmware/tools/ds_record.py)."""
    payload = struct.pack("<BBH16sH", key_block, 0, 95, b"\x01" * 16, len(ciphertext)) + ciphertext \
        + struct.pack("<H", len(spki)) + spki
    return b"ATDS" + struct.pack("<HHI", version, 0, len(payload)) + hashlib.sha256(payload).digest() + payload


def commit(directory, record, mac=DS_MAC):
    path = directory / mac.replace(":", "") / "ds-record.bin"
    path.parent.mkdir(parents=True)
    path.write_bytes(record)


def test_no_record_means_no_restore(tmp_path):
    assert ds_record.restore_sector(DS_MAC, tmp_path) is None
    assert ds_record.restore_files(DS_MAC, tmp_path) == []


def test_the_record_is_padded_to_a_flash_sector_at_the_spiffs_start(tmp_path):
    record = make_record()
    commit(tmp_path, record)
    ((offset, sector),) = ds_record.restore_files(DS_MAC, tmp_path)
    assert offset == 0xC90000 and len(sector) == 4096
    assert sector.startswith(record) and set(sector[len(record):]) == {0xFF}
    assert ds_record.restore_sector(OTHER_MAC, tmp_path) is None
    assert ds_record.public_key(DS_MAC, tmp_path) == SPKI
    assert ds_record.fingerprint(DS_MAC, tmp_path) == hashlib.sha256(SPKI).hexdigest()


@pytest.mark.parametrize("record,message", [
    (bytes(60) + make_record()[60:], "magic"),
    (make_record()[:60] + b"\x00" + make_record()[61:], "checksum"),
    (make_record(version=2), "version"),
    (make_record(key_block=2), "key block"),
    (make_record(ciphertext=b"\x07" * 1200), "RSA-3072"),
    (make_record(spki=SPKI[:-5] + bytes.fromhex("0203010003")), "SubjectPublicKeyInfo"),
    (make_record()[:-5], "checksum"),
])
def test_a_record_the_firmware_would_not_load_is_refused_not_written(tmp_path, record, message):
    commit(tmp_path, record)
    with pytest.raises(ds_record.DsRecordError, match=message):
        ds_record.restore_sector(DS_MAC, tmp_path)


def test_the_directory_can_come_from_the_environment(tmp_path, monkeypatch):
    commit(tmp_path, make_record())
    monkeypatch.setenv(ds_record.DS_DIR_ENV, str(tmp_path))
    assert ds_record.restore_sector(DS_MAC) is not None


def test_the_repo_default_points_at_the_firmware_lab_directory():
    assert ds_record.REPO_DS_DIR.name == "ds" and ds_record.REPO_DS_DIR.parent.name == "lab"


class DriverFlash(FakeFlash):
    """The real ESPToolDriver.erase_and_flash_encrypted on a fake transport: records the esptool write."""

    state = BindingState.active

    def erase_and_flash_encrypted(self, image, **options):
        return ESPToolDriver.erase_and_flash_encrypted(self, image, **options)

    def _write(self, image, arguments, name="firmware.bin", extra=()):
        assert "--erase-all" in arguments and "--encrypt" in arguments
        self.events.append(("erase-and-flash-encrypted", Path(image).name, [(hex(o), len(d)) for o, d in extra]))


def hex_image(tmp_path):
    tmp_path.mkdir(parents=True, exist_ok=True)
    image = tmp_path / "park.hex"
    image.write_text(":00000001FF\n")
    return image


def erased(events):
    return [event for event in events if isinstance(event, tuple) and event[0].startswith("erase")]


def parked(report, tmp_path, **options):
    events = []
    target = FakeTarget(FakeConsole([b"ATTRACTAP_PARKED\n"]), DriverFlash(report, events))
    mac = park(target, hex_image(tmp_path), tmp_path / "run", profile="secure-lab",
               baseline_dir=tmp_path / "base", **options)
    return mac, events


def test_parking_the_ds_reader_writes_its_record_back(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    commit(tmp_path / "ds", make_record())
    mac, events = parked(output(POST_WORDS, post=True), tmp_path, ds_dir=tmp_path / "ds")
    assert mac == DS_MAC
    assert erased(events) == [("erase-and-flash-encrypted", "park.hex", [("0xc90000", 4096)])]
    assert events.count("efuse") == 1, "the driver reuses the report park just checked"


def test_parking_the_ds_reader_before_its_burn_or_without_a_record_changes_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    _, events = parked(output(), tmp_path, ds_dir=tmp_path / "none")
    assert erased(events) == [("erase-and-flash-encrypted", "park.hex", [])]
    # another reader never gets a DS record, even when the directory holds one
    commit(tmp_path / "ds", make_record())
    _, events = parked(output(mac=OTHER_MAC), tmp_path / "other", ds_dir=tmp_path / "ds")
    assert erased(events) == [("erase-and-flash-encrypted", "park.hex", [])]


def test_a_damaged_record_stops_parking_before_the_erase(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    record = bytearray(make_record())
    record[70] ^= 1
    commit(tmp_path / "ds", bytes(record))
    with pytest.raises(ds_record.DsRecordError):
        parked(output(POST_WORDS, post=True), tmp_path, ds_dir=tmp_path / "ds")


def test_a_burned_reader_without_a_record_is_not_wiped(tmp_path, monkeypatch):
    # A janitor that cannot find the committed record (no dsRecordsDir, no source checkout) must not erase the
    # reader: the encrypted DS params in its flash are the only copy.
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    events = []
    target = FakeTarget(FakeConsole([]), DriverFlash(output(POST_WORDS, post=True), events))
    with pytest.raises(ds_record.DsRecordError, match="refusing to erase"):
        park(target, hex_image(tmp_path), tmp_path / "run", profile="secure-lab", ds_dir=tmp_path / "none")
    assert not erased(events)


def test_the_driver_guards_every_caller_also_without_a_report(tmp_path, monkeypatch):
    monkeypatch.setenv(ds_record.DS_DIR_ENV, str(tmp_path / "none"))
    events = []
    flash = DriverFlash(output(POST_WORDS, post=True), events)
    with pytest.raises(ds_record.DsRecordError, match="refusing to erase"):
        flash.erase_and_flash_encrypted(str(hex_image(tmp_path)))
    assert events == ["efuse"], "the driver reads the eFuses itself and never erases"


@pytest.mark.skipif(not (HIL / "conftest.py").is_file(), reason="hil/ is not part of this package build")
def test_the_hil_wipe_refuses_a_burned_reader_without_its_record(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(HIL))
    spec = importlib.util.spec_from_file_location("hil_conftest_under_test", HIL / "conftest.py")
    hil = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, hil)
    spec.loader.exec_module(hil)
    monkeypatch.setenv("READER_IMAGE", str(hex_image(tmp_path)))
    monkeypatch.setenv(ds_record.DS_DIR_ENV, str(tmp_path / "ds"))
    events = []
    target = FakeTarget(FakeConsole([]), DriverFlash(output(POST_WORDS, post=True), events))
    with pytest.raises(ds_record.DsRecordError, match="refusing to erase"):
        hil.write_secure_image(target)
    assert not erased(events)
    assert events[-1] == ("deactivate", "flash")
    commit(tmp_path / "ds", make_record())
    hil.write_secure_image(target)
    assert erased(events) == [("erase-and-flash-encrypted", "park.hex", [("0xc90000", 4096)])]


def test_the_janitor_quarantines_a_reader_without_its_record_at_once(tmp_path, monkeypatch):
    @contextlib.contextmanager
    def attached(config, place):
        yield object()

    def refuse(*args, **options):
        raise ds_record.DsRecordError("KEY3 of dc:b4:d9:21:71:c8 holds a DS key but no DS record is available")

    monkeypatch.setattr(janitor, "attached", attached)
    monkeypatch.setattr(janitor, "park", refuse)
    monkeypatch.setattr(janitor.signal, "signal", lambda *args: None)  # run_park's SIGTERM handler
    code = janitor.main(["--state-dir", str(tmp_path), "park", "--config", "env.yaml", "--place", "reader",
                         "--image", "park.hex", "--profile", "secure-lab", "--output", str(tmp_path / "run")])
    assert code == janitor.QUARANTINE_EXIT
    assert (tmp_path / "run/reason.txt").read_text() == (
        "DS record: KEY3 of dc:b4:d9:21:71:c8 holds a DS key but no DS record is available\n")
