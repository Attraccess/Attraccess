#pragma once

// Compatibility layer for the vendored Adafruit PN532 driver on pure ESP-IDF.
// Provides the small Arduino surface the driver's (mostly #ifdef'd) debug
// printing uses — a Serial-style print object, byte/HEX/DEC/F() — so the
// ~300 debug call sites compile unchanged. Output goes to stdout, i.e. the
// same USB console the logger uses. Include this ONLY from the PN532 .cpp.

#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include "platform.hpp" // millis()/delay()

typedef uint8_t byte;

#ifndef HEX
#define HEX 16
#endif
#ifndef DEC
#define DEC 10
#endif
#ifndef F
#define F(x) (x)
#endif

class Pn532DebugPort
{
public:
    void print(const char *s) { fputs(s, stdout); }
    void println(const char *s) { fputs(s, stdout); fputc('\n', stdout); }
    void println() { fputc('\n', stdout); }
    void print(char c) { fputc(c, stdout); }

    void print(int v, int base = DEC) { printNum((long)v, base); }
    void println(int v, int base = DEC) { printNum((long)v, base); fputc('\n', stdout); }
    void print(unsigned int v, int base = DEC) { printNum((unsigned long)v, base); }
    void println(unsigned int v, int base = DEC) { printNum((unsigned long)v, base); fputc('\n', stdout); }
    void print(long v, int base = DEC) { printNum(v, base); }
    void println(long v, int base = DEC) { printNum(v, base); fputc('\n', stdout); }
    void print(unsigned long v, int base = DEC) { printNum(v, base); }
    void println(unsigned long v, int base = DEC) { printNum(v, base); fputc('\n', stdout); }

    void printf(const char *fmt, ...) __attribute__((format(printf, 2, 3)))
    {
        va_list args;
        va_start(args, fmt);
        vprintf(fmt, args);
        va_end(args);
    }

private:
    void printNum(long v, int base)
    {
        if (base == HEX)
            ::printf("%lx", (unsigned long)v);
        else
            ::printf("%ld", v);
    }
    void printNum(unsigned long v, int base)
    {
        ::printf(base == HEX ? "%lx" : "%lu", v);
    }
};
