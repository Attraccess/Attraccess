#pragma once

#include <Arduino.h>
#include "../settings/settings.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
#include "../ioexpander/ioexpander.hpp"
#endif

class Beeper
{
public:
    void setup();
    void errorBeep();
    void successBeep();
    void singleBeep();

private:
#ifdef HAS_IO_EXPANDER_TCA9554
    IOExpander ioExpander;
#endif
};