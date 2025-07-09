#include "leds.hpp"

void ledTask(void *parameter)
{
    const int REFRESH_RATE_HZ = 60;
    const int MS_PER_SECOND = 1000;
    const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ) / portTICK_PERIOD_MS;

    Leds *leds = (Leds *)parameter;

    for (;;)
    {
        leds->loop();
        vTaskDelay(LOOP_DELAY_MS);
    }
}

void Leds::setup()
{
    FastLED.addLeds<WS2812, PIN_LED, GRB>(leds, LED_COUNT);

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);

    xTaskCreate(
        ledTask,
        "leds",
        1024,
        this,
        5,
        &this->taskHandle);
}

void Leds::loop()
{
    switch (this->currentState)
    {
    case LED_STATE_OFF:
        this->updateAnimationOff();
        break;
    case LED_STATE_ON:
        this->updateAnimationOn();
        break;
    case LED_STATE_BLINKING:
        this->updateAnimationBlinking();
        break;
    case LED_STATE_BREATHING:
        this->updateAnimationBreathing();
        break;
    }
    FastLED.show();
}

void Leds::setOff()
{
    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = CRGB::Black;
    }
    this->currentState = LED_STATE_OFF;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Leds::updateAnimationOff()
{
    return;
}

void Leds::setOn(CRGB color)
{
    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = color;
    }
    this->currentState = LED_STATE_ON;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Leds::updateAnimationOn()
{
    return;
}

void Leds::setBlinking(CRGB color, int interval)
{
    this->currentColor = color;
    this->currentInterval = interval;
    this->currentState = LED_STATE_BLINKING;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Leds::updateAnimationBlinking()
{
    unsigned long currentTime = millis();

    // if interval not reached, return
    if (currentTime - this->lastUpdate < this->currentInterval)
    {
        return;
    }

    // update last update time
    this->lastUpdate = currentTime;

    // toggle led state
    this->ledsAreOn = !this->ledsAreOn;

    // set led state
    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = this->ledsAreOn ? this->currentColor : CRGB::Black;
    }
}

void Leds::setBreathing(CRGB color, int interval)
{
    this->currentColor = color;
    this->currentInterval = interval;
    this->currentState = LED_STATE_BREATHING;

    FastLED.setBrightness(0);

    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = CRGB(this->currentColor);
    }
}

void Leds::updateAnimationBreathing()
{
    // breath the color from black to the current color and back, calculate the change amount by time and interval
    unsigned long currentTime = millis();
    int percentagePassed = (currentTime - this->lastUpdate) / this->currentInterval;
    int brightness = map(percentagePassed, 0, 100, 0, LED_MAX_BRIGHTNESS);

    FastLED.setBrightness(brightness);
}
