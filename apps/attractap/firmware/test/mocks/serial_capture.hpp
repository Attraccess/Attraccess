#pragma once
#include <string>
#include <cstdio>
#include <cstdarg>
struct SerialCapture {
    std::string _out;
    void clear() { _out.clear(); }
};
inline SerialCapture Serial;
inline int captured_printf(const char *format, ...) {
    va_list args;
    va_start(args, format);
    char buffer[8192];
    int result = vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);
    Serial._out += buffer;
    return result;
}
