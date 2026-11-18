"""DS record restore after a wipe (ATT-1207): record lookup, janitor parking and the `modified` OTA image."""

import hashlib
import struct
from pathlib import Path

import pytest

from attractap_lab import ds_record, ota_images, workflow
from attractap_lab.workflow import park
from test_efuse_ds import DS_MAC, OTHER_MAC, POST_WORDS, output
from test_janitor import FakeConsole, FakeFlash, FakeTarget


def make_record(payload=b"\x03\x00" + bytes(300)):
    return b"ATDS" + struct.pack("<HHI", 1, 0, len(payload)) + hashlib.sha256(payload).digest() + payload


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


def test_a_damaged_record_is_refused_not_written(tmp_path):
    record = bytearray(make_record())
    record[60] ^= 1
    commit(tmp_path, bytes(record))
    with pytest.raises(ds_record.DsRecordError, match="checksum"):
        ds_record.restore_sector(DS_MAC, tmp_path)


def test_the_directory_can_come_from_the_environment(tmp_path, monkeypatch):
    commit(tmp_path, make_record())
    monkeypatch.setenv(ds_record.DS_DIR_ENV, str(tmp_path))
    assert ds_record.restore_sector(DS_MAC) is not None


def test_the_repo_default_points_at_the_firmware_lab_directory():
    assert ds_record.REPO_DS_DIR.name == "ds" and ds_record.REPO_DS_DIR.parent.name == "lab"


class RestoringFlash(FakeFlash):
    def erase_and_flash_encrypted(self, image, extra=()):
        self.events.append(("erase-and-flash-encrypted", Path(image).name, [(hex(o), len(d)) for o, d in extra]))


def parked(report, tmp_path, flash_class=RestoringFlash, **options):
    events = []
    target = FakeTarget(FakeConsole([b"ATTRACTAP_PARKED\n"]), flash_class(report, events))
    mac = park(target, tmp_path / "park.hex", tmp_path / "run", profile="secure-lab",
               baseline_dir=tmp_path / "base", **options)
    return mac, events


def test_parking_the_ds_reader_writes_its_record_back(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    commit(tmp_path / "ds", make_record())
    mac, events = parked(output(POST_WORDS, post=True), tmp_path, ds_dir=tmp_path / "ds")
    assert mac == DS_MAC
    assert ("erase-and-flash-encrypted", "park.hex", [("0xc90000", 4096)]) in events


def test_parking_the_ds_reader_before_its_burn_or_without_a_record_changes_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    # no record committed: the old flash call, without `extra`
    _, events = parked(output(), tmp_path, flash_class=FakeFlash, ds_dir=tmp_path / "none")
    assert ("erase-and-flash-encrypted", "park.hex") in events
    # another reader never gets a DS record, even when the directory holds one
    commit(tmp_path / "ds", make_record())
    _, events = parked(output(mac=OTHER_MAC), tmp_path / "other", flash_class=FakeFlash, ds_dir=tmp_path / "ds")
    assert ("erase-and-flash-encrypted", "park.hex") in events


def test_a_damaged_record_stops_parking_before_the_erase(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    record = bytearray(make_record())
    record[70] ^= 1
    commit(tmp_path / "ds", bytes(record))
    events = []
    target = FakeTarget(FakeConsole([]), RestoringFlash(output(POST_WORDS, post=True), events))
    with pytest.raises(ds_record.DsRecordError):
        park(target, tmp_path / "park.hex", tmp_path / "run", profile="secure-lab", ds_dir=tmp_path / "ds")
    assert not [event for event in events if isinstance(event, tuple) and event[0].startswith("erase")]


def signed_image(size=3 * 4096, signature_magic=0xE7):
    data = bytearray(size)
    data[0] = ota_images.IMAGE_MAGIC
    data[-4096] = signature_magic
    return bytes(data)


def test_modified_changes_one_application_byte_of_a_signed_image(tmp_path):
    source = tmp_path / "signed.bin"
    source.write_bytes(signed_image())
    out = ota_images.modified(source, tmp_path / "modified.bin")
    changed = [i for i, (a, b) in enumerate(zip(source.read_bytes(), out.read_bytes())) if a != b]
    assert changed == [int(2 * 4096 * 0.25)]


def test_modified_refuses_images_that_are_not_signed(tmp_path):
    source = tmp_path / "unsigned.bin"
    source.write_bytes(signed_image(signature_magic=0))
    with pytest.raises(AssertionError, match="signed"):
        ota_images.modified(source, tmp_path / "out.bin")
