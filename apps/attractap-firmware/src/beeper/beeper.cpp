#include "beeper.hpp"

#ifdef HAS_IO_EXPANDER
#include "../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_IO_EXPANDER
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
    delay(200);
    this->singleBeep();
    delay(200);
    this->singleBeep();
}

void Beeper::indicateBeep()
{
    this->singleBeep();
    delay(200);
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
        this->logger.debug("Beep skipped: beeperEnabled=false");
        return;
    }

    this->logger.debug("BEEP");

#ifdef HAS_IO_EXPANDER
    if (this->ioExpander)
    {
        this->ioExpander->beeperOn();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
    digitalWrite(BEEPER_PIN, HIGH);
#endif

    delay(100);

#ifdef HAS_IO_EXPANDER
    if (this->ioExpander)
    {
        this->ioExpander->beeperOff();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
    digitalWrite(BEEPER_PIN, LOW);
#endif
}
