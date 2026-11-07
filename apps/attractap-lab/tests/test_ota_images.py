import json

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
