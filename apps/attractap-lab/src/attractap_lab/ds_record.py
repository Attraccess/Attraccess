"""The Digital Signature (DS) record of a secure lab reader, restored after every wipe (ATT-1207).

A wipe (``erase_and_flash_encrypted``, janitor parking) erases the reader's flash, the DS
record at the start of its ``spiffs`` partition included. The record (encrypted DS params and
the public key, nothing secret) is committed under ``apps/attractap/firmware/lab/ds/<mac>/``
and written back, encrypted, in the same esptool call. Without a record for the chip's MAC
nothing changes, except that a chip whose KEY3 already holds the DS key is not wiped at all.

The format is documented in ``apps/attractap/firmware/tools/ds_record.py``. This package is built
without the firmware tree, so ``parse`` repeats that file's checks (the firmware's own, plus key
block 3); ``LabParserAgrees`` in ``apps/attractap/firmware/tools/test_create_ds.py`` keeps the copies in step.
"""

import hashlib
import os
import struct
from pathlib import Path

# Start of the `spiffs` partition (partitions.csv); the record owns its first sector.
DS_RECORD_OFFSET = 0xC90000
SECTOR_SIZE = 4096
_MAGIC = b"ATDS"
_VERSION = 1
_HEADER_SIZE = 44
_DS_KEY_BLOCK = 3
_RSA_LENGTH_FIELD = 95
_CIPHERTEXT_LENGTH = 1584
# SubjectPublicKeyInfo of an RSA-3072 key with e = 65537: fixed framing around a 384-byte modulus.
_SPKI_PREFIX = bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f003082018a0282018100")
_SPKI_SUFFIX = bytes.fromhex("0203010001")
_SPKI_LENGTH = len(_SPKI_PREFIX) + 384 + len(_SPKI_SUFFIX)
DS_PURPOSE = "HMAC_DOWN_DIGITAL_SIGNATURE"

DS_DIR_ENV = "ATTRACTAP_LAB_DS_DIR"
REPO_DS_DIR = Path(__file__).resolve().parents[3] / "attractap/firmware/lab/ds"


class DsRecordError(RuntimeError):
    """A committed DS record is missing or damaged; the reader must not be wiped without it."""


def ds_dir(directory=None):
    """The directory with one ``<mac without colons>/ds-record.bin`` per reader."""
    return Path(directory or os.environ.get(DS_DIR_ENV) or REPO_DS_DIR)


def record_path(mac, directory=None):
    return ds_dir(directory) / mac.replace(":", "").lower() / "ds-record.bin"


def parse(record):
    """Validate a record (padded or not); returns (exact record bytes, SPKI DER). Raises ValueError."""
    if not _HEADER_SIZE <= len(record) <= SECTOR_SIZE or record[:4] != _MAGIC:
        raise ValueError("not a DS record (magic or size)")
    version, reserved, length = struct.unpack_from("<HHI", record, 4)
    if version != _VERSION or reserved != 0:
        raise ValueError(f"unsupported record version {version} (reserved {reserved})")
    payload = record[_HEADER_SIZE:_HEADER_SIZE + length]
    if len(payload) != length or hashlib.sha256(payload).digest() != record[12:44]:
        raise ValueError("fails its checksum")
    try:
        key_block, reserved, rsa_length = struct.unpack_from("<BBH", payload, 0)
        (cipher_length,) = struct.unpack_from("<H", payload, 20)
        (spki_length,) = struct.unpack_from("<H", payload, 22 + cipher_length)
    except struct.error as error:
        raise ValueError("payload is truncated") from error
    spki = payload[24 + cipher_length:24 + cipher_length + spki_length]
    if 24 + cipher_length + spki_length != length or len(spki) != spki_length:
        raise ValueError("payload lengths are inconsistent")
    if key_block != _DS_KEY_BLOCK or reserved != 0:
        raise ValueError(f"key block {key_block} is not KEY{_DS_KEY_BLOCK}")
    if rsa_length != _RSA_LENGTH_FIELD or cipher_length != _CIPHERTEXT_LENGTH:
        raise ValueError("not RSA-3072 DS parameters")
    if (len(spki) != _SPKI_LENGTH or not spki.startswith(_SPKI_PREFIX) or not spki.endswith(_SPKI_SUFFIX)
            or not spki[len(_SPKI_PREFIX)] & 0x80):
        raise ValueError("the public key is not an RSA-3072 SubjectPublicKeyInfo with e = 65537")
    return bytes(record[:_HEADER_SIZE + length]), bytes(spki)


def restore_sector(mac, directory=None):
    """The 4096-byte sector to write back for this chip, or None when it has no record.

    Raises DsRecordError for a record that does not validate: writing garbage over a reader's
    DS record location is worse than stopping.
    """
    path = record_path(mac, directory)
    if not path.is_file():
        return None
    try:
        record, _ = parse(path.read_bytes())
    except ValueError as error:
        raise DsRecordError(f"{path}: {error}") from error
    return record.ljust(SECTOR_SIZE, b"\xff")


def require_record_if_burned(mac, summary, directory=None):
    """Refuse a wipe that would lose a DS key for good.

    ``summary`` is the espefuse JSON summary. When KEY3 already is the DS key
    (HMAC_DOWN_DIGITAL_SIGNATURE) the encrypted DS params in flash are the only way to use it
    again, and the wipe erases them: without a committed record for this MAC the reader must not
    be erased (a janitor without ``dsRecordsDir`` and without a source checkout finds none).
    """
    purpose = summary.get("KEY_PURPOSE_3", {}).get("value")
    if purpose == DS_PURPOSE and restore_sector(mac, directory) is None:
        raise DsRecordError(
            f"KEY3 of {mac} holds a DS key but no DS record is available in {ds_dir(directory)}; "
            "refusing to erase the reader (set dsRecordsDir / ATTRACTAP_LAB_DS_DIR)")


def restore_files(mac, directory=None):
    """The record sector for this chip as ``[(offset, bytes)]``, or []."""
    sector = restore_sector(mac, directory)
    return [] if sector is None else [(DS_RECORD_OFFSET, sector)]


def wipe_restore(mac, summary, directory=None):
    """What a full erase of this chip must write back: ``[(offset, bytes)]``, maybe [].

    Every erase of a secure lab reader goes through this (ESPToolDriver.erase_and_flash_encrypted):
    it refuses a chip whose DS key would be lost (require_record_if_burned) and returns its record.
    """
    require_record_if_burned(mac, summary, directory)
    return restore_files(mac, directory)


def public_key(mac, directory=None):
    """The RSA-3072 SubjectPublicKeyInfo DER inside this chip's committed DS record, or None."""
    sector = restore_sector(mac, directory)
    return None if sector is None else parse(sector)[1]


def fingerprint(mac, directory=None):
    """The credential fingerprint the server shows for this reader's DS key (sha256 of the SPKI, hex)."""
    spki = public_key(mac, directory)
    return None if spki is None else hashlib.sha256(spki).hexdigest()
