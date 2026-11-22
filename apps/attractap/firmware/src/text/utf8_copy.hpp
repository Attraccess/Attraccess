#pragma once

// UTF-8-safe copies of server-supplied text (display names, resource names) into fixed buffers.
// A plain strlcpy can cut a multi-byte character in half; the screen then shows a broken glyph.
#include <cstddef>
#include <string>

// Copies `source` into `destination` (`size` bytes, terminator included). A text that does not fit
// is cut at the last whole UTF-8 character. A null `source` copies an empty text; `size` 0 writes
// nothing. Returns the number of bytes copied (without the terminator).
size_t copyUtf8(char *destination, const char *source, size_t size);

inline size_t copyUtf8(char *destination, const std::string &source, size_t size)
{
    return copyUtf8(destination, source.c_str(), size);
}

// The longest prefix of `source` of at most `maxBytes` bytes that ends on a whole UTF-8 character.
std::string utf8Prefix(const char *source, size_t maxBytes);
