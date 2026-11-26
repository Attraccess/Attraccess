#include "staging_flash.hpp"

#if defined(ESP_PLATFORM)

#include "esp_partition.h"

namespace
{
    const esp_partition_t *partition()
    {
        static const esp_partition_t *found = nullptr;
        static bool looked = false;
        if (!looked)
        {
            looked = true;
            const esp_partition_t *candidate =
                esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, "spiffs");
            // Only the layout of partitions.csv: the region is the end of this exact partition.
            if (candidate && candidate->address == Staging::SPIFFS_OFFSET && candidate->size == Staging::SPIFFS_SIZE &&
                !candidate->encrypted)
            {
                found = candidate;
            }
        }
        return found;
    }

    bool inRegion(uint32_t offset, size_t length)
    {
        return offset <= Staging::REGION_SIZE && length <= Staging::REGION_SIZE - offset;
    }

    uint32_t chunksDoneAt(uint32_t bitmapOffset, uint32_t bitmapBytes, uint32_t chunks)
    {
        uint8_t bitmap[Staging::APP_BITMAP_BYTES];
        const uint32_t bytes = (chunks + 7) / 8 < bitmapBytes ? (chunks + 7) / 8 : bitmapBytes;
        if (bytes == 0 || !StagingFlash::read(Staging::PROGRESS_OFFSET + bitmapOffset, bitmap, bytes))
        {
            return 0;
        }
        return Staging::chunksDone(bitmap, bytes, chunks);
    }

    bool markAt(uint32_t bitmapOffset, uint32_t bitmapBytes, uint32_t chunk)
    {
        if (chunk / 8 >= bitmapBytes)
        {
            return false;
        }
        const uint32_t at = Staging::PROGRESS_OFFSET + bitmapOffset + chunk / 8;
        uint8_t current = 0xff;
        if (!StagingFlash::read(at, &current, 1))
        {
            return false;
        }
        const uint8_t next = Staging::markDone(current, chunk);
        return next == current || StagingFlash::write(at, &next, 1);
    }
}

namespace StagingFlash
{
    bool available()
    {
        return partition() != nullptr;
    }

    bool read(uint32_t offset, void *out, size_t length)
    {
        return partition() && inRegion(offset, length) &&
               esp_partition_read(partition(), Staging::PARTITION_OFFSET + offset, out, length) == ESP_OK;
    }

    bool write(uint32_t offset, const void *data, size_t length)
    {
        return partition() && inRegion(offset, length) &&
               esp_partition_write(partition(), Staging::PARTITION_OFFSET + offset, data, length) == ESP_OK;
    }

    bool erase(uint32_t offset, size_t length)
    {
        return partition() && inRegion(offset, length) && offset % Staging::SECTOR == 0 &&
               length % Staging::SECTOR == 0 &&
               esp_partition_erase_range(partition(), Staging::PARTITION_OFFSET + offset, length) == ESP_OK;
    }

    bool readHeader(Staging::Header &out)
    {
        uint8_t bytes[Staging::HEADER_BYTES];
        return read(Staging::HEADER_OFFSET, bytes, sizeof(bytes)) && Staging::decodeHeader(bytes, sizeof(bytes), out);
    }

    bool startTransfer(const Staging::Header &header)
    {
        uint8_t bytes[Staging::HEADER_BYTES];
        Staging::encodeHeader(header, bytes);
        return wipe() && write(Staging::HEADER_OFFSET, bytes, sizeof(bytes));
    }

    bool wipe()
    {
        for (const Staging::EraseRange &range : Staging::WIPE_ORDER)
        {
            if (!erase(range.offset, range.length))
            {
                return false; // the header stays: still pending, wiped again later
            }
        }
        return true;
    }

    uint32_t appChunksDone(const Staging::Header &header)
    {
        return chunksDoneAt(Staging::APP_BITMAP_OFFSET, Staging::APP_BITMAP_BYTES, Staging::chunkCount(header.appSize));
    }

    uint32_t bootloaderChunksDone(const Staging::Header &header)
    {
        return chunksDoneAt(Staging::BOOTLOADER_BITMAP_OFFSET, Staging::BOOTLOADER_BITMAP_BYTES,
                            Staging::chunkCount(header.bootloaderSize));
    }

    bool markAppChunkDone(uint32_t chunk)
    {
        return markAt(Staging::APP_BITMAP_OFFSET, Staging::APP_BITMAP_BYTES, chunk);
    }

    bool markBootloaderChunkDone(uint32_t chunk)
    {
        return markAt(Staging::BOOTLOADER_BITMAP_OFFSET, Staging::BOOTLOADER_BITMAP_BYTES, chunk);
    }

    bool readNvsRecord(Staging::NvsRecord &out)
    {
        uint8_t bytes[Staging::NVS_RECORD_BYTES];
        return read(Staging::PROGRESS_OFFSET + Staging::NVS_RECORD_OFFSET, bytes, sizeof(bytes)) &&
               Staging::decodeNvsRecord(bytes, sizeof(bytes), out);
    }

    bool writeNvsRecord(const Staging::NvsRecord &record)
    {
        uint8_t bytes[Staging::NVS_RECORD_BYTES];
        Staging::encodeNvsRecord(record, bytes);
        return write(Staging::PROGRESS_OFFSET + Staging::NVS_RECORD_OFFSET, bytes, sizeof(bytes));
    }

    bool verifiedFor(uint32_t conversionId)
    {
        uint8_t bytes[Staging::VERIFIED_RECORD_BYTES];
        return read(Staging::PROGRESS_OFFSET + Staging::VERIFIED_RECORD_OFFSET, bytes, sizeof(bytes)) &&
               Staging::decodeVerified(bytes, sizeof(bytes), conversionId);
    }

    bool markVerified(uint32_t conversionId)
    {
        if (verifiedFor(conversionId))
        {
            return true;
        }
        uint8_t bytes[Staging::VERIFIED_RECORD_BYTES];
        Staging::encodeVerified(conversionId, bytes);
        return write(Staging::PROGRESS_OFFSET + Staging::VERIFIED_RECORD_OFFSET, bytes, sizeof(bytes));
    }

    bool pending()
    {
        Staging::Header header;
        return readHeader(header);
    }
}

#else // host builds: there is no staging region

namespace StagingFlash
{
    bool available() { return false; }
    bool read(uint32_t, void *, size_t) { return false; }
    bool write(uint32_t, const void *, size_t) { return false; }
    bool erase(uint32_t, size_t) { return false; }
    bool readHeader(Staging::Header &) { return false; }
    bool startTransfer(const Staging::Header &) { return false; }
    bool wipe() { return false; }
    uint32_t appChunksDone(const Staging::Header &) { return 0; }
    uint32_t bootloaderChunksDone(const Staging::Header &) { return 0; }
    bool markAppChunkDone(uint32_t) { return false; }
    bool markBootloaderChunkDone(uint32_t) { return false; }
    bool readNvsRecord(Staging::NvsRecord &) { return false; }
    bool writeNvsRecord(const Staging::NvsRecord &) { return false; }
    bool verifiedFor(uint32_t) { return false; }
    bool markVerified(uint32_t) { return false; }
    bool pending() { return false; }
}

#endif
