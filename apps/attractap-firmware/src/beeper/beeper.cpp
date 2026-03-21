#include "beeper.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
#include "../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_IO_EXPANDER_TCA9554
void Beeper::setup(IOExpander *expander)
{
    this->ioExpander = expander;
}
#else
void Beeper::setup()
{
#ifdef BEEPER_PIN
    pinMode(BEEPER_PIN, OUTPUT);
    digitalWrite(BEEPER_PIN, LOW);
#endif
}
#endif

void Beeper::errorBeep()
{
    this->singleBeep();
    delay(100);
    this->singleBeep();
    delay(100);
    this->singleBeep();
}

void Beeper::indicateBeep()
{
    this->singleBeep();
    delay(100);
    this->singleBeep();
}

void Beeper::successBeep()
{

    this->singleBeep();
}

void Beeper::singleBeep()
{
    if (!Settings::getDeviceConfig().beeperEnabled)
    {
        return;
    }

    this->logger.debug("BEEP");

#ifdef HAS_IO_EXPANDER_TCA9554
    if (this->ioExpander)
    {
        this->ioExpander->beeperOn();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER_TCA9554)
    digitalWrite(BEEPER_PIN, HIGH);
#endif

    delay(100);

#ifdef HAS_IO_EXPANDER_TCA9554
    if (this->ioExpander)
    {
        this->ioExpander->beeperOff();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER_TCA9554)
    digitalWrite(BEEPER_PIN, LOW);
#endif
}
