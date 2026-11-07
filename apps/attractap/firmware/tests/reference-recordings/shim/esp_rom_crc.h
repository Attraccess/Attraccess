#pragma once
#include <cstdint>
// esp_rom_crc32_le(0, ...) is the standard CRC-32; the firmware relies on exactly that.
inline uint32_t esp_rom_crc32_le(uint32_t crc, const uint8_t *buffer, uint32_t length)
{
    crc = ~crc;
    for (uint32_t i = 0; i < length; ++i)
    {
        crc ^= buffer[i];
        for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320u : 0u);
    }
    return ~crc;
}
