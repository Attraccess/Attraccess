"""The Digital Signature (DS) record a secure reader keeps at the start of its `spiffs` partition (ATT-1207).

One 4096-byte flash sector at DS_RECORD_OFFSET, little-endian, unused bytes 0xFF:

  0   magic "ATDS"            4   u16 version (1)        6   u16 reserved (0)
  8   u32 payload length      12  sha256(payload)        44  payload

  payload = u8 keyBlock (3) | u8 reserved (0) | u16 rsaLengthField (95) | u8 iv[16]
            | u16 cLen (1584) | u8 c[cLen] | u16 spkiLen (422) | u8 spki[spkiLen]

`parse` refuses everything the firmware's DsRecord::parse refuses (src/api/security/ds_record.cpp), plus a
key block other than KEY3: a lab restore must never write a record the reader would not load.
attractap_lab/ds_record.py (the janitor's copy, packaged without this file) applies the same checks;
test_create_ds.py (LabParserAgrees) keeps the two in step.

The payload holds the encrypted DS parameters (useless without the HMAC key in the chip's
KEY3 eFuse block) and the public key (SubjectPublicKeyInfo DER, RSA-3072). Nothing in it
is secret, which is why a lab reader's record is committed (lab/ds/<mac>/).
"""

import base64
import hashlib
import struct

DS_RECORD_OFFSET = 0xC90000
SECTOR_SIZE = 4096
MAGIC = b"ATDS"
VERSION = 1
HEADER_SIZE = 44
DS_KEY_BLOCK = 3
RSA_LENGTH_FIELD = 95
CIPHERTEXT_LENGTH = 1584

# SubjectPublicKeyInfo of an RSA-3072 key with e = 65537: fixed framing around a 384-byte modulus.
_SPKI_PREFIX = bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f003082018a0282018100")
_SPKI_SUFFIX = bytes.fromhex("0203010001")
SPKI_LENGTH = len(_SPKI_PREFIX) + 384 + len(_SPKI_SUFFIX)


class DsRecordError(ValueError):
    """The bytes are not a valid DS record."""


def check_spki(spki):
    """Raise unless `spki` is the canonical DER of an RSA-3072 public key with e = 65537."""
    if len(spki) != SPKI_LENGTH or not spki.startswith(_SPKI_PREFIX) or not spki.endswith(_SPKI_SUFFIX):
        raise DsRecordError("the public key is not an RSA-3072 SubjectPublicKeyInfo with e = 65537")
    if not spki[len(_SPKI_PREFIX)] & 0x80:
        raise DsRecordError("the RSA modulus is not 3072 bits")


def spki_pem(spki):
    body = base64.encodebytes(spki).decode().replace("\n", "")
    lines = [body[i:i + 64] for i in range(0, len(body), 64)]
    return "-----BEGIN PUBLIC KEY-----\n" + "\n".join(lines) + "\n-----END PUBLIC KEY-----\n"


def parse(record):
    """Validate a record (padded or not) and return its fields."""
    if len(record) < HEADER_SIZE or len(record) > SECTOR_SIZE:
        raise DsRecordError(f"record length {len(record)} is not between {HEADER_SIZE} and {SECTOR_SIZE}")
    if record[:4] != MAGIC:
        raise DsRecordError("bad magic")
    version, reserved, length = struct.unpack_from("<HHI", record, 4)
    if version != VERSION or reserved != 0:
        raise DsRecordError(f"unsupported record version {version} (reserved {reserved})")
    payload = record[HEADER_SIZE:HEADER_SIZE + length]
    if len(payload) != length:
        raise DsRecordError("the record is shorter than its payload length")
    if hashlib.sha256(payload).digest() != record[12:44]:
        raise DsRecordError("payload checksum mismatch")
    try:
        key_block, reserved, rsa_length, iv = struct.unpack_from("<BBH16s", payload, 0)
        (c_len,) = struct.unpack_from("<H", payload, 20)
        ciphertext = payload[22:22 + c_len]
        (spki_len,) = struct.unpack_from("<H", payload, 22 + c_len)
        spki = payload[24 + c_len:24 + c_len + spki_len]
    except struct.error as error:
        raise DsRecordError("payload is truncated") from error
    if len(ciphertext) != c_len or len(spki) != spki_len or 24 + c_len + spki_len != length:
        raise DsRecordError("payload lengths are inconsistent")
    if key_block != DS_KEY_BLOCK or reserved != 0:
        raise DsRecordError(f"key block {key_block} is not KEY{DS_KEY_BLOCK} (reserved {reserved})")
    if rsa_length != RSA_LENGTH_FIELD or c_len != CIPHERTEXT_LENGTH:
        raise DsRecordError(f"not RSA-3072 DS parameters (length field {rsa_length}, ciphertext {c_len} bytes)")
    check_spki(spki)
    return {"keyBlock": key_block, "rsaLength": rsa_length, "iv": iv, "ciphertext": ciphertext, "spki": spki}


def exact(record):
    """The record without the 0xFF padding of a flash sector; validated."""
    parse(record)
    length = HEADER_SIZE + struct.unpack_from("<I", record, 8)[0]
    return bytes(record[:length])


def sector(record):
    """The 4096-byte sector to write: the record padded with 0xFF."""
    return exact(record).ljust(SECTOR_SIZE, b"\xff")


def fingerprint(spki):
    """Credential fingerprint the server records for this key (sha256 of the SPKI DER, hex)."""
    return hashlib.sha256(spki).hexdigest()
