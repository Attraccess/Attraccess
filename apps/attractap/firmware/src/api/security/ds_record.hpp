#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

// The DS record: everything the reader needs to use its Digital Signature key except the HMAC key
// that only the eFuses hold. One 4 KiB sector at the start of the `spiffs` partition (0xc90000),
// written and read with flash encryption. Layout (little endian, unused sector bytes 0xFF):
//   0   "ATDS"                     magic
//   4   u16 version (= 1)
//   6   u16 reserved (= 0)
//   8   u32 payload length
//   12  sha256(payload)            32 bytes
//   44  payload:
//         u8  key block (3 = KEY3)
//         u8  reserved (0)
//         u16 rsa length field     (words - 1; 95 for RSA-3072)
//         u8  iv[16]
//         u16 c length             (1584: esp_ds_data_t.c, the encrypted DS parameters)
//         u8  c[...]
//         u16 spki length          (422)
//         u8  spki[...]            RSA-3072 SubjectPublicKeyInfo
// The encrypted parameters are useless without the KEY3 HMAC key; the record is not secret.
// Pure code (host tested); flash access lives in ds_storage.cpp.
namespace DsRecord
{
    constexpr size_t SECTOR_BYTES = 4096;
    constexpr uint32_t FLASH_OFFSET = 0xc90000; // start of the spiffs partition (partitions.csv)
    constexpr size_t HEADER_BYTES = 44;
    constexpr uint16_t VERSION = 1;
    constexpr uint8_t DS_KEY_BLOCK = 3;
    constexpr size_t IV_BYTES = 16;
    // ESP_DS_C_LEN for a 4096-bit-capable peripheral; ds_storage.cpp asserts it against ESP-IDF.
    constexpr size_t C_BYTES = 1584;
    constexpr uint16_t RSA_LENGTH_FIELD = 95;

    struct Record
    {
        uint8_t keyBlock = DS_KEY_BLOCK;
        uint16_t rsaLength = RSA_LENGTH_FIELD;
        uint8_t iv[IV_BYTES] = {};
        std::vector<uint8_t> c;
        std::vector<uint8_t> spki;
    };

    // Header + payload, without the 0xFF padding. Empty when `record` is not a valid DS record.
    std::vector<uint8_t> serialize(const Record &record);
    // Validates magic, version, hash, lengths and the canonical RSA-3072 SPKI. `data` may be a whole
    // sector (trailing bytes are ignored) or just the serialized record.
    bool parse(const uint8_t *data, size_t length, Record &out);
}
