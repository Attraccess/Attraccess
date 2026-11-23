#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// The NVS backup the plain app stages for the secure app (ATT-1208, step 2): every entry of the namespaces the reader
// keeps across the conversion. `demo_store` and everything else are not carried over. Pure codec; reading and
// restoring NVS lives in nvs_backup.cpp. The backup holds the reader's P-256 key: it is never logged, and the staging
// region that holds it is erased right after the secure app read the migrated entries back.
//
// Format (little-endian): "NVB1", u32 count, then per entry
//   u8 namespace length, namespace, u8 key length, key, u8 type (nvs_type_t), u32 value length, value bytes.
// Integers are stored as their little-endian bytes (1, 2, 4 or 8), strings without the terminating NUL.
namespace NvsBackup
{
    struct Entry
    {
        std::string ns;
        std::string key;
        uint8_t type = 0; // nvs_type_t
        std::vector<uint8_t> value;
    };

    // nvs_type_t values (nvs.h), repeated so the codec builds on the host.
    constexpr uint8_t TYPE_U8 = 0x01;
    constexpr uint8_t TYPE_I8 = 0x11;
    constexpr uint8_t TYPE_U16 = 0x02;
    constexpr uint8_t TYPE_I16 = 0x12;
    constexpr uint8_t TYPE_U32 = 0x04;
    constexpr uint8_t TYPE_I32 = 0x14;
    constexpr uint8_t TYPE_U64 = 0x08;
    constexpr uint8_t TYPE_I64 = 0x18;
    constexpr uint8_t TYPE_STR = 0x21;
    constexpr uint8_t TYPE_BLOB = 0x42;

    // NVS limits: 15 characters for namespaces and keys.
    constexpr size_t MAX_NAME_LENGTH = 15;

    // The namespaces carried into the secure app: pairing identity, settings, the server certificate choice.
    constexpr const char *NAMESPACES[] = {"readerpair", "settings", "cert_mgr"};
    bool isMigrated(const char *ns);

    // Byte length an integer type must have; 0 for strings and blobs (any length).
    size_t integerSize(uint8_t type);
    bool knownType(uint8_t type);

    // False when an entry does not fit the format (name too long, unknown type, wrong integer size) or the result
    // would exceed `maxBytes`.
    bool encode(const std::vector<Entry> &entries, std::vector<uint8_t> &out, size_t maxBytes);
    // False on any malformed byte: a backup is used completely or not at all.
    bool decode(const uint8_t *data, size_t length, std::vector<Entry> &out);
    // Same entries, same order.
    bool same(const std::vector<Entry> &a, const std::vector<Entry> &b);
}
