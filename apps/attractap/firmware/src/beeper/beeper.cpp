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
    this->beepMutex = xSemaphoreCreateMutex();
}
#else
void Beeper::setup()
{
    this->beepMutex = xSemaphoreCreateMutex();
#ifdef BEEPER_PIN
    gpio_config_t cfg = {};
    cfg.pin_bit_mask = 1ULL << BEEPER_PIN;
    cfg.mode = GPIO_MODE_OUTPUT;
    gpio_config(&cfg);
    gpio_set_level((gpio_num_t)BEEPER_PIN, 0);
#endif
}
#endif

// Beep patterns (interleaved on/off ms; 0 terminates). 100 ms beep length
// matches the legacy singleBeep() delay(100). The error pattern keeps the
// 200 ms gaps of the old errorBeep().
static const uint16_t ERROR_BEEP_PATTERN[] = {100, 200, 100, 200, 100, 0};
static const uint16_t INDICATE_BEEP_PATTERN[] = {100, 200, 100, 0};
static const uint16_t SINGLE_BEEP_PATTERN[] = {100, 0};

void Beeper::errorBeep()
{
    this->schedulePattern(ERROR_BEEP_PATTERN, sizeof(ERROR_BEEP_PATTERN) / sizeof(ERROR_BEEP_PATTERN[0]));
}

void Beeper::indicateBeep()
{
    this->schedulePattern(INDICATE_BEEP_PATTERN, sizeof(INDICATE_BEEP_PATTERN) / sizeof(INDICATE_BEEP_PATTERN[0]));
}

void Beeper::successBeep()
{
    this->singleBeep();
}

void Beeper::singleBeep()
{
    this->schedulePattern(SINGLE_BEEP_PATTERN, sizeof(SINGLE_BEEP_PATTERN) / sizeof(SINGLE_BEEP_PATTERN[0]));
}

void Beeper::schedulePattern(const uint16_t *newPattern, size_t length)
{
    if (!Settings::getDeviceConfig().beeperEnabled)
    {
        this->logger.debug("Beep skipped: beeperEnabled=false");
        return;
    }

    // Serialize against the esp_timer task (timerCallback) so a beep triggered
    // from another task can't race a half-updated pattern (Sourcery PR #1695).
    if (this->beepMutex && xSemaphoreTake(this->beepMutex, portMAX_DELAY) != pdTRUE)
    {
        return;
    }

    // A new pattern replaces any in-flight one (latest wins).
    this->pattern = newPattern;
    this->patternLength = length;
    this->patternIndex = 0;

    if (this->timer == nullptr)
    {
        const esp_timer_create_args_t timer_args = {
            .callback = &Beeper::timerCallback,
            .arg = this,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "beep",
            .skip_unhandled_events = false,
        };
        if (esp_timer_create(&timer_args, &this->timer) != ESP_OK)
        {
            this->logger.error("Failed to create beep timer");
            xSemaphoreGive(this->beepMutex);
            return;
        }
    }

    this->advancePattern();

    if (this->beepMutex)
    {
        xSemaphoreGive(this->beepMutex);
    }
}

void Beeper::advancePattern()
{
    // Called with beepMutex held (from schedulePattern or timerCallback).
    if (this->pattern == nullptr || this->patternIndex >= this->patternLength)
    {
        this->beeping = false;
        return;
    }

    uint16_t stepMs = this->pattern[this->patternIndex];
    if (stepMs == 0)
    {
        // Pattern terminator.
        this->beeperOff();
        this->beeping = false;
        return;
    }

    // Even indices are ON steps, odd indices are OFF gaps. Advance the pin,
    // then schedule the next step after the current one's duration.
    if (this->patternIndex % 2 == 0)
    {
        this->beeperOn();
    }
    else
    {
        this->beeperOff();
    }
    this->beeping = true;
    this->patternIndex++;

    esp_timer_stop(this->timer);
    esp_timer_start_once(this->timer, (uint64_t)stepMs * 1000);
}

void Beeper::timerCallback(void *arg)
{
    Beeper *self = static_cast<Beeper *>(arg);
    if (self->beepMutex && xSemaphoreTake(self->beepMutex, portMAX_DELAY) != pdTRUE)
    {
        return;
    }
    self->advancePattern();
    if (self->beepMutex)
    {
        xSemaphoreGive(self->beepMutex);
    }
}

void Beeper::beeperOn()
{
    this->logger.debug("BEEP ON");
#ifdef HAS_IO_EXPANDER
    if (this->ioExpander)
    {
        this->ioExpander->beeperOn();
    }
#endif
#if defined(BEEPER_PIN) && !defined(HAS_IO_EXPANDER)
    gpio_set_level((gpio_num_t)BEEPER_PIN, 1);
#endif
}

void Beeper::beeperOff()
{
    this->logger.debug("BEEP OFF");
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
