#include "neopixel.hpp"

void Neopixel::taskFn(void *parameter)
{
    const int REFRESH_RATE_HZ = 60;
    const int MS_PER_SECOND = 1000;
    const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ) / portTICK_PERIOD_MS;

    Neopixel *instance = (Neopixel *)parameter;

    while (true)
    {
        instance->loop();
        vTaskDelay(LOOP_DELAY_MS);
    }
}

void Neopixel::setup()
{
    logger.info("Setup");
    FastLED.addLeds<WS2812, PIN_NEOPIXEL_LED, GRB>(leds, LED_COUNT);

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);

    xTaskCreate(
        Neopixel::taskFn,
        "leds",
        4096,
        this,
        TASK_PRIORITY_LED,
        NULL);
}

void Neopixel::loop()
{
    // Update LED state based on system state
    updateStateBasedLeds();

    switch (this->currentState)
    {
    case NEOPIXEL_STATE_OFF:
        this->updateAnimationOff();
        break;
    case NEOPIXEL_STATE_ON:
        this->updateAnimationOn();
        break;
    case NEOPIXEL_STATE_BLINKING:
        this->updateAnimationBlinking();
        break;
    case NEOPIXEL_STATE_BREATHING:
        this->updateAnimationBreathing();
        break;
    }
    FastLED.show();
}

void Neopixel::setOff()
{
    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = CRGB::Black;
    }
    this->currentState = NEOPIXEL_STATE_OFF;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Neopixel::updateAnimationOff()
{
    return;
}

void Neopixel::setOn(CRGB color)
{
    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = color;
    }
    this->currentState = NEOPIXEL_STATE_ON;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Neopixel::updateAnimationOn()
{
    return;
}

void Neopixel::setBlinking(CRGB color, int interval)
{
    this->currentColor = color;
    this->currentInterval = interval;
    this->currentState = NEOPIXEL_STATE_BLINKING;

    FastLED.setBrightness(LED_MAX_BRIGHTNESS);
}

void Neopixel::updateAnimationBlinking()
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

void Neopixel::setBreathing(CRGB color, int interval)
{
    this->currentColor = color;
    this->currentInterval = interval;
    this->currentState = NEOPIXEL_STATE_BREATHING;

    FastLED.setBrightness(0);

    for (int i = 0; i < LED_COUNT; i++)
    {
        leds[i] = CRGB(this->currentColor);
    }
}

void Neopixel::updateAnimationBreathing()
{
    // breath the color from black to the current color and back, calculate the change amount by time and interval
    unsigned long currentTime = millis();
    int percentagePassed = (currentTime - this->lastUpdate) / this->currentInterval;
    int brightness = map(percentagePassed, 0, 100, 0, LED_MAX_BRIGHTNESS);

    FastLED.setBrightness(brightness);
}

// State update methods
void Neopixel::setNetworkConnected(bool connected)
{
    this->is_network_connected = connected;
}

void Neopixel::setApiConnected(bool connected)
{
    this->is_api_connected = connected;
}

void Neopixel::setDisplayState(DISPLAY_STATE state)
{
    this->current_display_state = state;
}

// Autonomous LED state management based on system state
void Neopixel::updateStateBasedLeds()
{
    if (!this->is_network_connected)
    {
        // Network disconnected - yellow blinking
        setBlinking(CRGB::Yellow, 500);
    }
    else if (!this->is_api_connected)
    {
        // API disconnected - blue blinking
        setBlinking(CRGB::Blue, 500);
    }
    else
    {
        // Network and API connected - respond to display state
        switch (this->current_display_state)
        {
        case DISPLAY_STATE_CARD_CHECKING:
            setBreathing(CRGB::White, 500);
            break;
        case DISPLAY_STATE_ERROR:
            setBlinking(CRGB::Red, 1000);
            break;
        case DISPLAY_STATE_SUCCESS:
            setBlinking(CRGB::Green, 1000);
            break;
        case DISPLAY_STATE_TEXT:
            setOn(CRGB::Blue);
            break;
        case DISPLAY_STATE_SELECT_ITEM:
            setBreathing(CRGB::White, 500);
            break;
        case DISPLAY_STATE_CONFIRM_ACTION:
            setBlinking(CRGB::White, 500);
            break;
        case DISPLAY_STATE_NONE:
        default:
            // Default state when everything is connected but no special display state
            setOff();
            break;
        }
    }
}
