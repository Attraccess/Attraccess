#include "beeper.hpp"

void Beeper::setup()
{
#ifdef HAS_IO_EXPANDER_TCA9554
    this->ioExpander.setup();
#endif

#ifdef BEEPER_PIN
    pinMode(BEEPER_PIN, OUTPUT);
    digitalWrite(BEEPER_PIN, LOW);
#endif
}

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
    this->ioExpander.beeperOn();
#endif

#ifdef BEEPER_PIN
    digitalWrite(BEEPER_PIN, HIGH);
#endif

    delay(100);

#ifdef HAS_IO_EXPANDER_TCA9554
    this->ioExpander.beeperOff();
#endif

#ifdef BEEPER_PIN
    digitalWrite(BEEPER_PIN, LOW);
#endif
}