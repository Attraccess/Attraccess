#include "frame_encoding.hpp"

namespace FrameEncoding
{
    static uint8_t *putPixel(uint8_t *out, uint16_t pixel)
    {
        *out++ = static_cast<uint8_t>(pixel & 0xFF);
        *out++ = static_cast<uint8_t>(pixel >> 8);
        return out;
    }

    size_t encodeRle565(const uint16_t *pixels, size_t count, uint8_t *out)
    {
        uint8_t *start = out;
        size_t i = 0;
        while (i < count)
        {
            size_t run = 1;
            while (i + run < count && run < MAX_RUN && pixels[i + run] == pixels[i])
            {
                run++;
            }
            if (run >= 2)
            {
                *out++ = static_cast<uint8_t>(126 + run);
                out = putPixel(out, pixels[i]);
                i += run;
                continue;
            }

            // Literal packet up to the next run of two equal pixels.
            size_t literalStart = i;
            size_t length = 0;
            while (i < count && length < MAX_LITERAL)
            {
                if (length > 0 && i + 1 < count && pixels[i + 1] == pixels[i])
                {
                    break;
                }
                i++;
                length++;
            }
            *out++ = static_cast<uint8_t>(length - 1);
            for (size_t j = 0; j < length; j++)
            {
                out = putPixel(out, pixels[literalStart + j]);
            }
        }
        return static_cast<size_t>(out - start);
    }

    uint32_t crc32(const uint8_t *data, size_t length, uint32_t crc)
    {
        static uint32_t table[256];
        static bool tableReady = false;
        if (!tableReady)
        {
            for (uint32_t n = 0; n < 256; n++)
            {
                uint32_t c = n;
                for (int k = 0; k < 8; k++)
                {
                    c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                }
                table[n] = c;
            }
            tableReady = true;
        }

        crc = ~crc;
        for (size_t i = 0; i < length; i++)
        {
            crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
        }
        return ~crc;
    }

    size_t base64Encode(const uint8_t *data, size_t length, char *out)
    {
        static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        char *start = out;
        size_t i = 0;
        for (; i + 2 < length; i += 3)
        {
            uint32_t v = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8) | data[i + 2];
            *out++ = alphabet[(v >> 18) & 63];
            *out++ = alphabet[(v >> 12) & 63];
            *out++ = alphabet[(v >> 6) & 63];
            *out++ = alphabet[v & 63];
        }
        if (i < length)
        {
            uint32_t v = uint32_t(data[i]) << 16;
            if (i + 1 < length)
            {
                v |= uint32_t(data[i + 1]) << 8;
            }
            *out++ = alphabet[(v >> 18) & 63];
            *out++ = alphabet[(v >> 12) & 63];
            *out++ = (i + 1 < length) ? alphabet[(v >> 6) & 63] : '=';
            *out++ = '=';
        }
        *out = '\0';
        return static_cast<size_t>(out - start);
    }
}
