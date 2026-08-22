#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
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

    // All beep entry points are NON-BLOCKING: they enqueue a pattern for the
    // dedicated beeper worker and return immediately. The blocking delay()-based
    // implementation froze the UI for 100-700 ms because processState() runs
    // under lv_lock (PERFORMANCE_ANALYSIS.md M1/M6).
    void errorBeep();
    void successBeep();
    void singleBeep();
    void indicateBeep();

private:
    struct PatternRequest
    {
        const uint16_t *pattern;
        size_t length;
    };

    void beeperOn();
    void beeperOff();
    void schedulePattern(const uint16_t *pattern, size_t length);
    static void workerTask(void *arg);

    Logger logger;
    QueueHandle_t patternQueue = nullptr;

#ifdef HAS_IO_EXPANDER
    IOExpander *ioExpander = nullptr;
#endif
};
