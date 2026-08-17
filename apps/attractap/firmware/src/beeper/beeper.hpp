#pragma once

#include "esp_timer.h"
#include "../settings/settings.hpp"
#include "../logger/logger.hpp"

#ifdef HAS_IO_EXPANDER
class IOExpander;
#endif

class Beeper
{
public:
    Beeper() : logger("Beeper") {}

#ifdef HAS_IO_EXPANDER
    void setup(IOExpander *expander = nullptr);
#else
    void setup();
#endif

    // All beep entry points are NON-BLOCKING: they schedule the beep pattern
    // on an esp_timer and return immediately. The blocking delay()-based
    // implementation froze the UI for 100-700 ms because processState() runs
    // under lv_lock (PERFORMANCE_ANALYSIS.md M1/M6).
    void errorBeep();
    void successBeep();
    void singleBeep();
    void indicateBeep();

private:
    void beeperOn();
    void beeperOff();
    void schedulePattern(const uint16_t *pattern, size_t length);
    void advancePattern();
    static void timerCallback(void *arg);

    Logger logger;
    esp_timer_handle_t timer = nullptr;
    // Interleaved [on_ms, off_ms, ...] steps; on_ms == 0 marks the end.
    const uint16_t *pattern = nullptr;
    size_t patternLength = 0;
    size_t patternIndex = 0;
    bool beeping = false;

#ifdef HAS_IO_EXPANDER
    IOExpander *ioExpander = nullptr;
#endif
};
