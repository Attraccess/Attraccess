#include "beeper.hpp"
#include <Wire.h>

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
        this->logger.debug("Beep skipped: beeperEnabled=false");
        return;
    }

    this->logger.debug("BEEP (200ms)");

    // Flush I2C bus to clear any stuck state from GT911/PN532 transactions
    Wire.flush();
    delay(1);

#ifdef HAS_IO_EXPANDER_TCA9554
    if (this->ioExpander)
    {
        this->ioExpander->beeperOn();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER_TCA9554)
    digitalWrite(BEEPER_PIN, HIGH);
#endif

    delay(200);

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
