#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

// The staging region of the "Secure this reader" conversion (ATT-1208): the last 256 KiB of the `spiffs` partition
// (0xFA0000..0xFE0000; spiffs spans 0xC90000..0xFE0000 and nothing mounts it). It holds the signed bootloader and the
// NVS backup between the transfer (plain app) and the first boot of the secure app, which deletes it after the
// migration. spiffs is not flagged `encrypted`, so flash encryption leaves the region readable as it was written.
//
// Layout, offsets inside the region:
//   0x00000  header sector    written once per conversion (magic, id, digests, image sizes and hashes), CRC-protected
//   0x01000  progress sector  never erased during a conversion: done chunks clear one bit each (NOR flash writes
//                             only clear bits), so progress survives a power cut and needs no sector rewrite
//   0x02000  bootloader       up to 0x8000 bytes (the signed bootloader must end below the partition table)
//   0x0A000  NVS backup       up to 0x36000 bytes (nvs_backup_codec.hpp)
// Pure code: the flash access lives in conversion_device.cpp.
namespace Staging
{
    constexpr uint32_t SECTOR = 0x1000;
    constexpr uint32_t CHUNK = 0x1000; // one transfer chunk = one flash sector
    constexpr uint32_t SPIFFS_OFFSET = 0xC90000;
    constexpr uint32_t SPIFFS_SIZE = 0x350000;
    constexpr uint32_t REGION_SIZE = 0x40000;
    // Offset of the region inside the spiffs partition and on the flash.
    constexpr uint32_t PARTITION_OFFSET = SPIFFS_SIZE - REGION_SIZE; // 0x310000
    constexpr uint32_t FLASH_OFFSET = SPIFFS_OFFSET + PARTITION_OFFSET; // 0xFA0000

    constexpr uint32_t HEADER_OFFSET = 0x0;
    constexpr uint32_t PROGRESS_OFFSET = 0x1000;
    constexpr uint32_t BOOTLOADER_OFFSET = 0x2000;
    constexpr uint32_t BOOTLOADER_MAX = 0x8000;
    constexpr uint32_t NVS_OFFSET = BOOTLOADER_OFFSET + BOOTLOADER_MAX; // 0xA000
    constexpr uint32_t NVS_MAX = REGION_SIZE - NVS_OFFSET;              // 0x36000

    // Inside the progress sector.
    constexpr uint32_t APP_BITMAP_OFFSET = 0;
    constexpr uint32_t APP_BITMAP_BYTES = 2048; // 16384 chunks = 64 MiB, far above an app slot
    constexpr uint32_t BOOTLOADER_BITMAP_OFFSET = 2048;
    constexpr uint32_t BOOTLOADER_BITMAP_BYTES = 1; // 8 chunks = 0x8000
    constexpr uint32_t NVS_RECORD_OFFSET = 3072;
    constexpr uint32_t VERIFIED_RECORD_OFFSET = 3584;

    constexpr uint32_t APP_SLOT_MAX = 0x640000;
    constexpr uint32_t HEADER_VERSION = 1;
    constexpr size_t HEADER_BYTES = 160;
    constexpr size_t NVS_RECORD_BYTES = 40;
    constexpr size_t VERIFIED_RECORD_BYTES = 12;

    using Digest = std::array<uint8_t, 32>;

    struct Header
    {
        uint32_t conversionId = 0;
        Digest digest0{};
        Digest digest1{};
        uint32_t appSize = 0;
        Digest appSha256{};
        uint32_t bootloaderSize = 0;
        Digest bootloaderSha256{};
        // Flash offset of the inactive app slot the signed app is written to.
        uint32_t appSlotOffset = 0;
    };

    // The NVS backup was written completely: its length and hash, written once after the backup.
    struct NvsRecord
    {
        uint32_t length = 0;
        Digest sha256{};
    };

    // zlib CRC-32 (what the Secure Boot signature block uses as well).
    uint32_t crc32(const uint8_t *data, size_t length, uint32_t crc = 0);

    void encodeHeader(const Header &header, uint8_t out[HEADER_BYTES]);
    // False for erased flash, another magic or version, a broken CRC or impossible sizes.
    bool decodeHeader(const uint8_t *data, size_t length, Header &out);
    // Same conversion and same images: a transfer can resume where it stopped.
    bool sameTransfer(const Header &a, const Header &b);

    void encodeNvsRecord(const NvsRecord &record, uint8_t out[NVS_RECORD_BYTES]);
    bool decodeNvsRecord(const uint8_t *data, size_t length, NvsRecord &out);

    // The verify step passed for this conversion id (written once, never cleared until the region is wiped).
    void encodeVerified(uint32_t conversionId, uint8_t out[VERIFIED_RECORD_BYTES]);
    bool decodeVerified(const uint8_t *data, size_t length, uint32_t conversionId);

    constexpr uint32_t chunkCount(uint32_t size)
    {
        return (size + CHUNK - 1) / CHUNK;
    }
    // Chunks done in a row from the start (a done chunk has its bit cleared, LSB first).
    uint32_t chunksDone(const uint8_t *bitmap, size_t bitmapBytes, uint32_t chunks);
    // The bitmap byte after marking `chunk` done; to be written at `chunk / 8`.
    uint8_t markDone(uint8_t current, uint32_t chunk);

    // 64 lowercase hex characters <-> 32 bytes.
    bool parseDigest(const char *hex, Digest &out);
    std::string hex(const uint8_t *data, size_t length);
}
