#include <Arduino.h>
#include <cstdint>

HardwareSerial Serial;

static unsigned long g_millis = 0;

extern "C" {
    unsigned long millis() { return g_millis; }
    void delay(unsigned long) {}
}

void mock_millis_set(unsigned long v) { g_millis = v; }
void mock_millis_advance(unsigned long ms) { g_millis += ms; }
