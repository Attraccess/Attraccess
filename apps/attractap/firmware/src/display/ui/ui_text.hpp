#pragma once

// Text helpers shared by display and display-less (Lite) builds. Header-only: Lite excludes src/display/*.cpp.

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace ui
{
    // Rewrites UTF-8 `in` into `out` keeping only glyphs the Latin-1 fonts have (0x20-0x7E, 0xA0-0xFF);
    // everything else becomes '?', control characters a space. Returns the number of code points written,
    // or -1 when `out` is too small.
    inline int sanitizeLatin1(const char *in, char *out, size_t outCap)
    {
        size_t o = 0;
        int chars = 0;
        const unsigned char *p = reinterpret_cast<const unsigned char *>(in);
        auto put = [&](const unsigned char *bytes, size_t n) -> bool {
            if (o + n + 1 > outCap) return false;
            for (size_t i = 0; i < n; i++) out[o++] = static_cast<char>(bytes[i]);
            chars++;
            return true;
        };
        while (*p)
        {
            uint32_t cp;
            size_t len;
            if (*p < 0x80) { cp = *p; len = 1; }
            else if ((*p & 0xE0) == 0xC0 && (p[1] & 0xC0) == 0x80) { cp = ((*p & 0x1F) << 6) | (p[1] & 0x3F); len = 2; }
            else if ((*p & 0xF0) == 0xE0 && (p[1] & 0xC0) == 0x80 && (p[2] & 0xC0) == 0x80)
            { cp = ((*p & 0x0F) << 12) | ((p[1] & 0x3F) << 6) | (p[2] & 0x3F); len = 3; }
            else if ((*p & 0xF8) == 0xF0 && (p[1] & 0xC0) == 0x80 && (p[2] & 0xC0) == 0x80 && (p[3] & 0xC0) == 0x80)
            { cp = 0x10000; len = 4; }
            else { cp = 0xFFFD; len = 1; }
            unsigned char q;
            if (cp < 0x20 || cp == 0x7F) { q = ' '; if (!put(&q, 1)) return -1; }
            else if (cp < 0x7F) { q = static_cast<unsigned char>(cp); if (!put(&q, 1)) return -1; }
            else if (cp >= 0xA0 && cp <= 0xFF)
            {
                const unsigned char b[2] = {static_cast<unsigned char>(0xC0 | (cp >> 6)),
                                            static_cast<unsigned char>(0x80 | (cp & 0x3F))};
                if (!put(b, 2)) return -1;
            }
            else { q = '?'; if (!put(&q, 1)) return -1; }
            p += len;
        }
        if (o + 1 > outCap) return -1;
        out[o] = '\0';
        return chars;
    }

}
