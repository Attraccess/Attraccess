import hashlib
import json
import struct

import pytest

from attractap_lab import ota_images


def test_offer_publishes_the_image_with_its_definition(tmp_path):
    image = tmp_path / "app.bin"
    image.write_bytes(b"\xe9abc")
    definition = ota_images.firmware_definition("attractap_touch_v2", "wifi", "1.2.3-ota")
    ota_images.offer(tmp_path / "assets", definition, image)
    listing = json.loads((tmp_path / "assets/firmwares.json").read_text())
    assert listing == {"firmwares": [definition]}
    assert (tmp_path / "assets" / definition["filenameOTA"]).read_bytes() == b"\xe9abc"


def test_offer_without_a_definition_offers_nothing(tmp_path):
    ota_images.offer(tmp_path)
    assert json.loads((tmp_path / "firmwares.json").read_text()) == {"firmwares": []}


def test_with_version_keeps_the_rest():
    definition = ota_images.firmware_definition("n", "v", "1")
    assert ota_images.with_version(definition, "2") == {**definition, "version": "2"}


def test_corrupt_flips_one_middle_byte(tmp_path):
    image = tmp_path / "app.bin"
    image.write_bytes(bytes([0xE9]) + bytes(99))
    out = ota_images.corrupt(image, tmp_path / "bad.bin")
    changed = [i for i, (a, b) in enumerate(zip(image.read_bytes(), out.read_bytes())) if a != b]
    assert changed == [50]


def test_bad_magic_changes_the_first_byte_only(tmp_path):
    image = tmp_path / "app.bin"
    image.write_bytes(bytes([0xE9, 1, 2, 3]))
    out = ota_images.bad_magic(image, tmp_path / "bad.bin")
    assert out.read_bytes() == bytes([0x16, 1, 2, 3])


def test_bad_magic_refuses_a_non_image(tmp_path):
    image = tmp_path / "other.bin"
    image.write_bytes(b"MZ")
    with pytest.raises(AssertionError):
        ota_images.bad_magic(image, tmp_path / "bad.bin")


def test_sign_command_uses_secure_boot_v2():
    command = ota_images.sign_command("in.bin", "key.pem", "out.bin")
    assert command[:4] == ["espsecure", "sign-data", "--version", "2"]
    assert command[-1] == "in.bin" and "key.pem" in command


@pytest.mark.skipif(not ota_images.REPO.joinpath("apps/attractap/firmware").is_dir(),
                    reason="the firmware sources are not part of this package build")
def test_lab_signing_key_is_the_published_lab_key():
    assert ota_images.LAB_SIGNING_KEY.is_file()


def app_image(segments=(bytes(range(64)), bytes(range(128, 256)) * 2), hash_appended=True, signed=True):
    """A minimal ESP-IDF app image as esptool elf2image + espsecure sign-data v2 lay it out."""
    data = bytearray(struct.pack("<BBBBI", 0xE9, len(segments), 2, 0x4F, 0x40380000))
    data += struct.pack("<BBBBHBHH4BB", 0xEE, 0, 0, 0, 9, 0, 0, 0xFFFF, 0, 0, 0, 0, 1 if hash_appended else 0)
    checksum = 0xEF
    for index, segment in enumerate(segments):
        data += struct.pack("<II", 0x3C000000 + index * 0x10000, len(segment)) + segment
        for byte in segment:
            checksum ^= byte
    data += bytes(15 - len(data) % 16) + bytes([checksum])
    if hash_appended:
        data += hashlib.sha256(data).digest()
    if signed:
        data += b"\xff" * (-len(data) % 4096)
        data += bytes([0xE7]) + b"\x5a" * 4095
    return bytes(data)


def test_a_built_image_verifies_and_corrupt_breaks_its_checksum(tmp_path):
    image = tmp_path / "signed.bin"
    image.write_bytes(app_image())
    assert ota_images.image_problems(image.read_bytes()) == []
    corrupt = ota_images.corrupt(image, tmp_path / "corrupt.bin", position=40 / 8192)
    assert ota_images.image_problems(corrupt.read_bytes()) == ["checksum", "appended SHA-256"]


def test_modified_breaks_only_the_signature(tmp_path):
    source = tmp_path / "signed.bin"
    source.write_bytes(app_image())
    out = ota_images.modified(source, tmp_path / "modified.bin")
    signed, changed = source.read_bytes(), out.read_bytes()
    assert len(changed) == len(signed) and changed != signed
    assert ota_images.image_problems(changed) == [], "checksum and appended hash must still verify"
    segments, checksum_at, digest_at = ota_images.image_layout(changed)
    differing = [i for i, (a, b) in enumerate(zip(signed, changed)) if a != b]
    content = [i for i in differing if i < checksum_at]
    assert len(content) == 1 and segments[1][0] <= content[0] < segments[1][1], "one byte of the largest segment"
    assert set(differing) - set(content) <= {checksum_at, *range(digest_at, digest_at + 32)}
    assert changed[-4096:] == signed[-4096:], "the signature sector is the signed image's"


def test_modified_refuses_images_it_cannot_keep_valid(tmp_path):
    for image, message in ((app_image(signed=False), "signed"), (app_image(hash_appended=False), "SHA-256"),
                           (app_image()[:40] + b"\xff" + app_image()[41:], "does not verify")):
        source = tmp_path / "in.bin"
        source.write_bytes(image)
        with pytest.raises(AssertionError, match=message):
            ota_images.modified(source, tmp_path / "out.bin")
