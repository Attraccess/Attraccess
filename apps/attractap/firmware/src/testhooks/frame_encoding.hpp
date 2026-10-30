#pragma once

#include <cstddef>
#include <cstdint>

// Screenshot wire encoding for the ui.screenshot.get test hook.
//
// RLE565: PackBits over 16-bit pixels. Each packet starts with a control byte c:
//   c <  128: c + 1 literal pixels follow (2 bytes each, little-endian RGB565)
//   c >= 128: one pixel follows, repeated c - 126 times (2..129)
// The host decoder lives in apps/attractap-lab/src/attractap_lab/reader_screen.py.
namespace FrameEncoding
{
    constexpr size_t MAX_LITERAL = 128;
    constexpr size_t MAX_RUN = 129;

    // Worst case: every pixel literal, one control byte per 128 pixels.
    constexpr size_t maxRle565Size(size_t pixels)
    {
        return pixels * 2 + (pixels + MAX_LITERAL - 1) / MAX_LITERAL;
    }

    // Writes at most maxRle565Size(count) bytes; returns the bytes written.
    size_t encodeRle565(const uint16_t *pixels, size_t count, uint8_t *out);

    // zlib/PNG-compatible CRC-32; pass the previous result to continue.
    uint32_t crc32(const uint8_t *data, size_t length, uint32_t crc = 0);

    constexpr size_t base64Size(size_t length)
    {
        return (length + 2) / 3 * 4;
    }

    // Standard alphabet with padding; writes base64Size(length) chars plus a NUL.
    size_t base64Encode(const uint8_t *data, size_t length, char *out);
}
