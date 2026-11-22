// Host tests for the UTF-8-safe text copy used for server-supplied names (ATT-1385).
#include "../../src/text/utf8_copy.hpp"

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

namespace {
void expect(bool condition, const char *message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(1);
    }
}

// Every multi-byte sequence in `text` is complete.
bool wholeUtf8(const std::string &text) {
    size_t i = 0;
    while (i < text.size()) {
        const unsigned char lead = static_cast<unsigned char>(text[i]);
        const size_t length = lead < 0x80 ? 1 : lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 0;
        if (length == 0 || i + length > text.size()) return false;
        for (size_t j = 1; j < length; ++j)
            if ((static_cast<unsigned char>(text[i + j]) & 0xC0) != 0x80) return false;
        i += length;
    }
    return true;
}

void cutsBeforeATwoByteCharacter() {
    char buffer[6];
    // "abcd" fills 4 bytes; "ä" (C3 A4) would need bytes 5 and 6, but only byte 5 is left.
    expect(copyUtf8(buffer, "abcd\xC3\xA4", sizeof(buffer)) == 4, "the cut drops the half character");
    expect(std::string(buffer) == "abcd", "no lead byte without its continuation remains");
}

void cutsBeforeAThreeByteCharacter() {
    char buffer[6];
    // "abc" then "€" (E2 82 AC): two of its three bytes would fit.
    expect(copyUtf8(buffer, "abc\xE2\x82\xAC", sizeof(buffer)) == 3, "a three-byte character is not split");
    expect(std::string(buffer) == "abc", "only whole characters are copied");
}

void keepsAnExactFit() {
    char buffer[6];
    expect(copyUtf8(buffer, "abc\xC3\xA4", sizeof(buffer)) == 5, "an exact fit is copied whole");
    expect(std::string(buffer) == "abc\xC3\xA4", "the last character is kept when it fits");
    expect(copyUtf8(buffer, "abcd\xC3\xA4" "e", sizeof(buffer)) == 4, "a character ending past the buffer is dropped");
}

void copiesShortTextUnchanged() {
    char buffer[16];
    expect(copyUtf8(buffer, std::string("J\xC3\xBCrgen"), sizeof(buffer)) == 7, "short text is copied whole");
    expect(std::string(buffer) == "J\xC3\xBCrgen", "short text is unchanged");
}

void handlesEmptyAndNull() {
    char buffer[4] = {'x', 'x', 'x', '\0'};
    expect(copyUtf8(buffer, "", sizeof(buffer)) == 0 && buffer[0] == '\0', "empty text clears the buffer");
    buffer[0] = 'x';
    expect(copyUtf8(buffer, static_cast<const char *>(nullptr), sizeof(buffer)) == 0 && buffer[0] == '\0',
           "a null text copies an empty text");
    buffer[0] = 'x';
    expect(copyUtf8(buffer, "abc", 0) == 0 && buffer[0] == 'x', "a zero-size buffer is left alone");
    expect(copyUtf8(nullptr, "abc", 4) == 0, "a null buffer is ignored");
    char one[1] = {'x'};
    expect(copyUtf8(one, "\xC3\xA4", sizeof(one)) == 0 && one[0] == '\0', "a one-byte buffer holds the terminator");
    expect(utf8Prefix(nullptr, 10).empty(), "a null text has an empty prefix");
    expect(utf8Prefix("", 10).empty(), "an empty text has an empty prefix");
}

void cutsLongUmlautNamesWhole() {
    std::string name;
    while (name.size() < 200) name += "\xC3\x84rger\xC3\xBC\xC3\x9F ";
    for (size_t size = 1; size <= 82; ++size) {
        char buffer[82];
        const size_t copied = copyUtf8(buffer, name, size);
        expect(copied < size && copied + 1 >= size - 1, "the cut loses at most one partial character");
        expect(std::strlen(buffer) == copied, "the copy is terminated");
        expect(wholeUtf8(buffer), "a cut name never ends in a broken UTF-8 sequence");
        expect(name.compare(0, copied, buffer) == 0, "the copy is a prefix of the name");
        expect(utf8Prefix(name.c_str(), size - 1) == buffer, "utf8Prefix cuts like copyUtf8");
    }
}

void copiesOverlappingBuffers() {
    char buffer[8] = "abcdef";
    expect(copyUtf8(buffer, buffer, sizeof(buffer)) == 6 && std::string(buffer) == "abcdef",
           "copying a buffer onto itself keeps it");
}
} // namespace

int main() {
    cutsBeforeATwoByteCharacter();
    cutsBeforeAThreeByteCharacter();
    keepsAnExactFit();
    copiesShortTextUnchanged();
    handlesEmptyAndNull();
    cutsLongUmlautNamesWhole();
    copiesOverlappingBuffers();
    std::cout << "utf8_copy_test passed\n";
    return 0;
}
