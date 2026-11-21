#include "utf8_copy.hpp"

#include <cstring>

namespace {
// Length of the longest prefix of the first `length` bytes of `text` that ends on a whole character.
size_t wholeCharacterLength(const char *text, size_t length)
{
    size_t start = length;
    while (start > 0 && (static_cast<unsigned char>(text[start - 1]) & 0xC0) == 0x80) --start;
    if (start == 0) return length; // only continuation bytes: not UTF-8, keep the bytes as they are
    const unsigned char lead = static_cast<unsigned char>(text[start - 1]);
    const size_t needed = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
    return length - (start - 1) < needed ? start - 1 : length;
}

size_t fittingLength(const char *source, size_t maxBytes)
{
    const size_t length = strnlen(source, maxBytes + 1);
    if (length <= maxBytes) return length;
    return wholeCharacterLength(source, maxBytes);
}
} // namespace

size_t copyUtf8(char *destination, const char *source, size_t size)
{
    if (destination == nullptr || size == 0) return 0;
    const size_t length = source == nullptr ? 0 : fittingLength(source, size - 1);
    if (length > 0) std::memmove(destination, source, length);
    destination[length] = '\0';
    return length;
}

std::string utf8Prefix(const char *source, size_t maxBytes)
{
    if (source == nullptr) return std::string();
    return std::string(source, fittingLength(source, maxBytes));
}
