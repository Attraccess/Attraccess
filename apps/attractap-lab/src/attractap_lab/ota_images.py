"""Firmware images and definitions for the HIL update-over-Wi-Fi tests.

The tests run against an API that offers firmware from ``ATTRACTAP_FIRMWARE_ASSETS_DIR``
(re-read when ``firmwares.json`` changes). ``offer`` publishes one lab image
there; the other functions derive the images a reader must refuse. Signing
happens here, in the test harness, with the public device-lab Secure Boot key:
the API's signer refuses lab keys on purpose and is not involved.
"""

import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[4]
LAB_SIGNING_KEY = REPO / "apps/attractap/firmware/lab/secure-boot/lab-signing-key.pem"
# esp_image_header_t.magic
IMAGE_MAGIC = 0xE9
# ESP-IDF app image (esp_app_format.h): 24-byte header (magic, segment count, ..., hash_appended in its
# last byte), then per segment an 8-byte header (load address, length) and the data. Zero padding up to
# a 16-byte boundary ends with the checksum byte (0xEF XOR every segment byte), then, with hash_appended,
# the SHA-256 of everything before it. Secure Boot v2 (espsecure sign-data) pads to 4 KiB and appends a
# 4 KiB signature sector starting with 0xE7.
IMAGE_HEADER_SIZE = 24
SEGMENT_HEADER_SIZE = 8
CHECKSUM_SEED = 0xEF
SIGNATURE_SECTOR = 4096
SIGNATURE_MAGIC = 0xE7
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


def image_layout(data):
    """(segment data ranges, checksum offset, appended SHA-256 offset or None) of an app image."""
    if len(data) < IMAGE_HEADER_SIZE or data[0] != IMAGE_MAGIC:
        raise ValueError("not an ESP application image")
    offset, segments = IMAGE_HEADER_SIZE, []
    for _ in range(data[1]):
        if offset + SEGMENT_HEADER_SIZE > len(data):
            raise ValueError("segment header past the end of the image")
        _, length = struct.unpack_from("<II", data, offset)
        offset += SEGMENT_HEADER_SIZE
        segments.append((offset, offset + length))
        offset += length
    checksum_at = (offset + 1 + 15) // 16 * 16 - 1
    digest_at = checksum_at + 1 if data[IMAGE_HEADER_SIZE - 1] == 1 else None
    if (digest_at or checksum_at) + (32 if digest_at else 1) > len(data):
        raise ValueError("segments past the end of the image")
    return segments, checksum_at, digest_at


def image_checksum(data, segments):
    checksum = CHECKSUM_SEED
    for start, end in segments:
        for byte in data[start:end]:
            checksum ^= byte
    return checksum


def image_problems(data):
    """What the ESP-IDF image check (esp_image_verify) refuses before it looks at a signature: [] when none."""
    segments, checksum_at, digest_at = image_layout(data)
    problems = []
    if image_checksum(data, segments) != data[checksum_at]:
        problems.append("checksum")
    if digest_at is not None and hashlib.sha256(data[:digest_at]).digest() != data[digest_at:digest_at + 32]:
        problems.append("appended SHA-256")
    return problems


def modified(signed_image, out, position=0.5):
    """Copy a lab-signed image with one application byte changed after signing, ONLY the signature broken.

    The checksum byte and the appended SHA-256 are recomputed, so the image passes every check up to the
    Secure Boot signature (``corrupt`` already fails the checksum). The reader must refuse it for the
    signature alone; its log then says "Secure boot signature verification failed" and "image valid,
    signature bad" (esp_image_format.c). It must be an image ``lab_sign`` produced.
    """
    data = bytearray(Path(signed_image).read_bytes())
    assert data[0] == IMAGE_MAGIC, "not an ESP application image"
    assert len(data) % SIGNATURE_SECTOR == 0 and data[-SIGNATURE_SECTOR] == SIGNATURE_MAGIC, \
        "not a Secure Boot v2 signed image"
    assert not image_problems(data), "the signed image does not verify"
    segments, checksum_at, digest_at = image_layout(data)
    assert digest_at is not None and digest_at + 32 <= len(data) - SIGNATURE_SECTOR, "no appended SHA-256"
    start, end = max(segments, key=lambda segment: segment[1] - segment[0])
    data[start + int((end - start) * position)] ^= 0xFF
    data[checksum_at] = image_checksum(data, segments)
    data[digest_at:digest_at + 32] = hashlib.sha256(data[:digest_at]).digest()
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
