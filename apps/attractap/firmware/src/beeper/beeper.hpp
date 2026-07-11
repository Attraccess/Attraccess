#pragma once

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

    void errorBeep();
    void successBeep();
    void singleBeep();
    void indicateBeep();

private:
    Logger logger;

#ifdef HAS_IO_EXPANDER
    IOExpander *ioExpander = nullptr;
#endif
};
