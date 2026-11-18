#include "migration_pending.hpp"

#include <cstring>

namespace MigrationStaging
{
    bool headerPresent(const uint8_t *sector, size_t length)
    {
        return sector && length >= sizeof(MAGIC) && memcmp(sector, MAGIC, sizeof(MAGIC)) == 0;
    }
}

#ifdef ESP_PLATFORM
#include "esp_flash.h"
#include "esp_flash_encrypt.h"

bool migrationPending()
{
    // 16 bytes are enough for the magic; encrypted reads need a 16-byte multiple.
    alignas(16) uint8_t header[16] = {};
    const esp_err_t result = esp_flash_encryption_enabled()
                                 ? esp_flash_read_encrypted(nullptr, MigrationStaging::HEADER_OFFSET, header,
                                                            sizeof(header))
                                 : esp_flash_read(nullptr, header, MigrationStaging::HEADER_OFFSET, sizeof(header));
    return result == ESP_OK && MigrationStaging::headerPresent(header, sizeof(header));
}
#else
bool migrationPending()
{
    return false;
}
#endif
