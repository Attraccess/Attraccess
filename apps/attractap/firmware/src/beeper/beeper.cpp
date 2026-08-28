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
    this->patternQueue = xQueueCreate(1, sizeof(PatternRequest));
    if (this->patternQueue == nullptr || xTaskCreate(Beeper::workerTask, "Beeper", 2048, this, 1, nullptr) != pdPASS)
    {
        this->logger.error("Failed to create beeper worker");
        if (this->patternQueue)
        {
            vQueueDelete(this->patternQueue);
            this->patternQueue = nullptr;
        }
    }
}
#else
void Beeper::setup()
{
    this->patternQueue = xQueueCreate(1, sizeof(PatternRequest));
    if (this->patternQueue == nullptr || xTaskCreate(Beeper::workerTask, "Beeper", 2048, this, 1, nullptr) != pdPASS)
    {
        this->logger.error("Failed to create beeper worker");
        if (this->patternQueue)
        {
            vQueueDelete(this->patternQueue);
            this->patternQueue = nullptr;
        }
    }
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

    if (this->patternQueue == nullptr)
    {
        this->logger.error("Beep unavailable: worker setup failed");
        return;
    }

    // One-slot queue makes requests latest-wins without waiting on the UI task.
    PatternRequest request = {newPattern, length};
    xQueueOverwrite(this->patternQueue, &request);
}

void Beeper::workerTask(void *arg)
{
    Beeper *self = static_cast<Beeper *>(arg);
    PatternRequest request = {};
    const uint16_t *pattern = nullptr;
    size_t patternLength = 0;
    size_t patternIndex = 0;
    TickType_t waitTime = portMAX_DELAY;

    for (;;)
    {
        if (xQueueReceive(self->patternQueue, &request, waitTime) == pdPASS)
        {
            pattern = request.pattern;
            patternLength = request.length;
            patternIndex = 0;
        }
        else if (pattern != nullptr)
        {
            patternIndex++;
        }

        if (pattern == nullptr || patternIndex >= patternLength || pattern[patternIndex] == 0)
        {
            self->beeperOff();
            pattern = nullptr;
            waitTime = portMAX_DELAY;
            continue;
        }

        if (patternIndex % 2 == 0)
        {
            self->beeperOn();
        }
        else
        {
            self->beeperOff();
        }
        waitTime = pdMS_TO_TICKS(pattern[patternIndex]);
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
