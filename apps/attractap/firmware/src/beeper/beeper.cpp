#include "beeper.hpp"

#include "../platform.hpp"
#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
#include "driver/gpio.h"
#endif

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
    gpio_config_t cfg = {};
    cfg.pin_bit_mask = 1ULL << BEEPER_PIN;
    cfg.mode = GPIO_MODE_OUTPUT;
    gpio_config(&cfg);
    gpio_set_level((gpio_num_t)BEEPER_PIN, 0);
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
    gpio_set_level((gpio_num_t)BEEPER_PIN, 1);
#endif

    delay(100);

#ifdef HAS_IO_EXPANDER
    if (this->ioExpander)
    {
        this->ioExpander->beeperOff();
    }
#endif

#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
    gpio_set_level((gpio_num_t)BEEPER_PIN, 0);
#endif
}
