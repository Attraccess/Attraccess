// Pull the firmware modules under test into this translation unit.
// PlatformIO's native test runner only compiles the test suite directory,
// not src/. This file bridges the gap without code duplication.
#include <string>
#include <cstdio>
#include <cstdarg>
#include "serial_capture.hpp"
#define private public
#include "../../src/serial/serialCommandHandler.hpp"
#undef private
#define printf captured_printf
#include "../../src/serial/serialCommandHandler.cpp"
#undef printf
void trimString(std::string &s) {
    const auto first = s.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) { s.clear(); return; }
    s = s.substr(first, s.find_last_not_of(" \t\r\n") - first + 1);
}
#include "../../src/logger/logger.cpp"
