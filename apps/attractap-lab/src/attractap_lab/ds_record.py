"""The Digital Signature (DS) record of a secure lab reader, restored after every wipe (ATT-1207).

A wipe (``erase_and_flash_encrypted``, janitor parking) erases the reader's flash, the DS
record at the start of its ``spiffs`` partition included. The record (encrypted DS params and
the public key, nothing secret) is committed under ``apps/attractap/firmware/lab/ds/<mac>/``
and written back, encrypted, in the same esptool call. Without a record for the chip's MAC
nothing changes. The format is documented in ``apps/attractap/firmware/tools/ds_record.py``.
"""

import hashlib
import os
import struct
from pathlib import Path

# Start of the `spiffs` partition (partitions.csv); the record owns its first sector.
DS_RECORD_OFFSET = 0xC90000
SECTOR_SIZE = 4096
_MAGIC = b"ATDS"
_HEADER_SIZE = 44

DS_DIR_ENV = "ATTRACTAP_LAB_DS_DIR"
REPO_DS_DIR = Path(__file__).resolve().parents[3] / "attractap/firmware/lab/ds"


class DsRecordError(RuntimeError):
    """A committed DS record is damaged; the reader must not be wiped without it."""


def ds_dir(directory=None):
    """The directory with one ``<mac without colons>/ds-record.bin`` per reader."""
    return Path(directory or os.environ.get(DS_DIR_ENV) or REPO_DS_DIR)


def record_path(mac, directory=None):
    return ds_dir(directory) / mac.replace(":", "").lower() / "ds-record.bin"


def restore_sector(mac, directory=None):
    """The 4096-byte sector to write back for this chip, or None when it has no record.

    Raises DsRecordError for a record that does not validate: writing garbage over a reader's
    DS record location is worse than stopping.
    """
    path = record_path(mac, directory)
    if not path.is_file():
        return None
    record = path.read_bytes()
    if len(record) < _HEADER_SIZE or len(record) > SECTOR_SIZE or record[:4] != _MAGIC:
        raise DsRecordError(f"{path} is not a DS record")
    length = struct.unpack_from("<I", record, 8)[0]
    payload = record[_HEADER_SIZE:_HEADER_SIZE + length]
    if len(payload) != length or hashlib.sha256(payload).digest() != record[12:44]:
        raise DsRecordError(f"{path} fails its checksum")
    return record[:_HEADER_SIZE + length].ljust(SECTOR_SIZE, b"\xff")


def restore_files(mac, directory=None):
    """``extra`` argument for ``erase_and_flash_encrypted``: the record sector for this chip, or []."""
    sector = restore_sector(mac, directory)
    return [] if sector is None else [(DS_RECORD_OFFSET, sector)]


def public_key(mac, directory=None):
    """The RSA-3072 SubjectPublicKeyInfo DER inside this chip's committed DS record, or None."""
    sector = restore_sector(mac, directory)
    if sector is None:
        return None
    # payload = u8 keyBlock, u8 reserved, u16 rsaLength, u8 iv[16], u16 cLen, c[cLen], u16 spkiLen, spki
    payload = sector[_HEADER_SIZE:_HEADER_SIZE + struct.unpack_from("<I", sector, 8)[0]]
    (cipher_length,) = struct.unpack_from("<H", payload, 20)
    (spki_length,) = struct.unpack_from("<H", payload, 22 + cipher_length)
    return payload[24 + cipher_length:24 + cipher_length + spki_length]


def fingerprint(mac, directory=None):
    """The credential fingerprint the server shows for this reader's DS key (sha256 of the SPKI, hex)."""
    spki = public_key(mac, directory)
    return None if spki is None else hashlib.sha256(spki).hexdigest()
