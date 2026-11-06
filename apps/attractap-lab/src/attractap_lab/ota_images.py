"""Firmware images and definitions for the HIL update-over-Wi-Fi tests.

The tests run against an API that offers firmware from ``ATTRACTAP_FIRMWARE_ASSETS_DIR``
(re-read when ``firmwares.json`` changes). ``offer`` publishes one lab image
there; the other functions derive the images a reader must refuse. Signing
happens here, in the test harness, with the public device-lab Secure Boot key:
the API's signer refuses lab keys on purpose and is not involved.
"""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[4]
LAB_SIGNING_KEY = REPO / "apps/attractap/firmware/lab/secure-boot/lab-signing-key.pem"
# esp_image_header_t.magic
IMAGE_MAGIC = 0xE9
OTA_FILENAME = "hil-ota.bin"


def firmware_definition(name, variant, version, filename=OTA_FILENAME):
    """The ``firmwares.json`` entry the API offers (only the fields the OTA path reads)."""
    return {"name": name, "friendlyName": name, "variant": variant, "variantFriendlyName": variant,
            "version": version, "boardFamily": "ESP32-S3", "filename": filename, "filenameOTA": filename,
            "chip": "esp32s3", "flashMode": "dio", "flashFreq": "80m", "flashSize": "16MB"}


def offer(directory, definition=None, image=None):
    """Make the API offer ``image`` as ``definition`` (None: offer nothing)."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    if image is not None:
        shutil.copyfile(image, directory / definition["filenameOTA"])
    (directory / "firmwares.json").write_text(json.dumps({"firmwares": [definition] if definition else []}))


def with_version(definition, version):
    return {**definition, "version": version}


def corrupt(image, out, position=0.5):
    """Copy ``image`` with one byte flipped in the middle (valid header, wrong hash and signature)."""
    data = bytearray(Path(image).read_bytes())
    data[int(len(data) * position)] ^= 0xFF
    Path(out).write_bytes(bytes(data))
    return out


def bad_magic(image, out):
    """Copy ``image`` with a wrong first byte: the reader refuses it from the first chunk on."""
    data = bytearray(Path(image).read_bytes())
    assert data[0] == IMAGE_MAGIC, "not an ESP application image"
    data[0] ^= 0xFF
    Path(out).write_bytes(bytes(data))
    return out


def sign_command(image, key, out):
    return ["espsecure", "sign-data", "--version", "2", "--keyfile", str(key), "-o", str(out), str(image)]


def lab_sign(image, out):
    """Sign an app image for a secure lab reader (RSA-PSS signature block with the lab key)."""
    subprocess.run(sign_command(image, LAB_SIGNING_KEY, out), check=True, capture_output=True)
    return out


def foreign_sign(image, out):
    """Sign with a throwaway key the reader has no digest for: a well-formed but wrong signature."""
    with tempfile.TemporaryDirectory() as tmp:
        key = Path(tmp) / "foreign-key.pem"
        subprocess.run(["espsecure", "generate-signing-key", "--version", "2", "--scheme", "rsa3072", str(key)],
                       check=True, capture_output=True)
        subprocess.run(sign_command(image, key, out), check=True, capture_output=True)
    return out
