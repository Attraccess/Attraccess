#pragma once

#include <Arduino.h>
#include "../settings/settings.hpp"
#include "../logger/logger.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
#include "../ioexpander/ioexpander.hpp"
#endif

class Beeper
{
public:
    Beeper() : logger("Beeper") {}
    void setup();
    void errorBeep();
    void successBeep();
    void singleBeep();
    void indicateBeep();

private:
    Logger logger;

#ifdef HAS_IO_EXPANDER_TCA9554
    IOExpander ioExpander;
#endif
};