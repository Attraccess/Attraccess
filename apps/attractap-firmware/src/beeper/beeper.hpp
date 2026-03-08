#pragma once

#include <Arduino.h>
#include "../settings/settings.hpp"
#include "../logger/logger.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
class IOExpander;
#endif

class Beeper
{
public:
    Beeper() : logger("Beeper") {}

#ifdef HAS_IO_EXPANDER_TCA9554
    void setup(IOExpander *expander);
#else
    void setup();
#endif

    void errorBeep();
    void successBeep();
    void singleBeep();
    void indicateBeep();

private:
    Logger logger;

#ifdef HAS_IO_EXPANDER_TCA9554
    IOExpander *ioExpander = nullptr;
#endif
};
