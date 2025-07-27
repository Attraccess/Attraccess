#include "LEDService.h"

bool LEDService::attraccessAuthenticated = false;
LEDService::WaitForNFCTapType LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_NONE;
bool LEDService::waitForResourceSelection = false;

uint8_t LEDService::updateFrequencyFps = 60;

LEDService::LEDService()
    : redPin(LED_RED_PIN), greenPin(LED_GREEN_PIN), bluePin(LED_BLUE_PIN), red(0), green(0), blue(0), lastBlinkToggle(0), breatheDuration(1000), rainbowSpeed(250), rainbowHue(0)
{
}

LEDService::~LEDService()
{
}

void ledUpdateTask(void *pvParameters)
{
    LEDService *ledService = (LEDService *)pvParameters;
    while (true)
    {
        ledService->update();
        vTaskDelay(1000 / LEDService::updateFrequencyFps / portTICK_PERIOD_MS);
    }
}

void LEDService::begin()
{
    // Configure LED pins as outputs
    pinMode(redPin, OUTPUT);
    pinMode(greenPin, OUTPUT);
    pinMode(bluePin, OUTPUT);

    // Initialize LEDs to OFF (active LOW)
    digitalWrite(redPin, HIGH);
    digitalWrite(greenPin, HIGH);
    digitalWrite(bluePin, HIGH);

    xTaskCreate(ledUpdateTask, "LEDUpdateTask", 10000, this, 1, &ledTaskHandle);

    Serial.println("LEDService: Initialized RGB LED");
}

void LEDService::update()
{
    LEDServiceState oldState = currentState;

    if (!LEDService::attraccessAuthenticated)
    {
        currentState = LEDServiceState::NOT_AUTHENTICATED;
        if (oldState != LEDServiceState::NOT_AUTHENTICATED)
        {
            // breath orange
            red = 255;
            green = 165;
            blue = 0;
        }

        updateBreathing();
        return;
    }

    if (LEDService::waitForResourceSelection)
    {
        currentState = LEDServiceState::WAITING_FOR_RESOURCE_SELECTION;
        // rainbow
        updateRainbow();
        return;
    }

    if (LEDService::waitForNFCTap == LEDService::WAIT_FOR_NFC_TAP_ENROLL)
    {
        currentState = LEDServiceState::WAITING_FOR_NFC_TAP_ENROLL;

        if (oldState != LEDServiceState::WAITING_FOR_NFC_TAP_ENROLL)
        {
            // blink blue
            red = 0;
            green = 0;
            blue = 255;
        }

        updateBlinking(500);
        return;
    }

    if (LEDService::waitForNFCTap == LEDService::WAIT_FOR_NFC_TAP_RESET)
    {
        currentState = LEDServiceState::WAITING_FOR_NFC_TAP_RESET;

        if (oldState != LEDServiceState::WAITING_FOR_NFC_TAP_RESET)
        {
            // blink purple
            red = 128;
            green = 0;
            blue = 128;
        }

        updateBlinking(500);
        return;
    }

    if (LEDService::waitForNFCTap == LEDService::WAIT_FOR_NFC_TAP_USAGE_START)
    {
        currentState = LEDServiceState::WAITING_FOR_NFC_TAP_USAGE_START;

        if (oldState != LEDServiceState::WAITING_FOR_NFC_TAP_USAGE_START)
        {
            // breath green
            red = 0;
            green = 255;
            blue = 0;
        }

        updateBreathing();
        return;
    }

    if (LEDService::waitForNFCTap == LEDService::WAIT_FOR_NFC_TAP_USAGE_END)
    {
        currentState = LEDServiceState::WAITING_FOR_NFC_TAP_USAGE_END;

        if (oldState != LEDServiceState::WAITING_FOR_NFC_TAP_USAGE_END)
        {
            // breath red
            red = 255;
            green = 0;
            blue = 0;
        }

        updateBreathing();
        return;
    }

    // nothing to do
    currentState = LEDServiceState::IDLE;
    if (oldState != LEDServiceState::IDLE)
    {
        red = 0;
        green = 0;
        blue = 0;
    }

    updateLed();
}

void LEDService::updateBlinking(uint32_t interval)
{
    uint32_t currentTime = millis();
    if (currentTime - lastBlinkToggle >= interval)
    {
        lastBlinkToggle = currentTime;

        // Toggle between the blink state and off
        static bool ledOn = true;
        ledOn = !ledOn;

        if (ledOn)
        {
            updateLed();
        }
        else
        {
            digitalWrite(redPin, HIGH);
            digitalWrite(greenPin, HIGH);
            digitalWrite(bluePin, HIGH);
        }
    }
}

void LEDService::updateBreathing()
{
    uint32_t currentTime = millis();
    uint32_t elapsed = currentTime - breatheStartTime;

    // Calculate breathing intensity (0-255)
    float intensity = (sinf((elapsed * 2 * PI) / breatheDuration) + 1) / 2;
    uint8_t brightness = (uint8_t)(intensity * 255);

    // map brightness to red, green, blue current colors
    red = (uint8_t)(brightness * (red / 255.0));
    green = (uint8_t)(brightness * (green / 255.0));
    blue = (uint8_t)(brightness * (blue / 255.0));

    updateLed();
}

void LEDService::updateRainbow()
{
    uint32_t currentTime = millis();
    if (currentTime - rainbowStartTime >= rainbowSpeed)
    {
        rainbowStartTime = currentTime;
        rainbowHue = (rainbowHue + 1) % 256;

        hsvToRgb(rainbowHue, 255, 255, red, green, blue);
        updateLed();
    }
}

void LEDService::updateLed()
{
    // Set individual LED values (active LOW)

    // since leds are active LOW, we need to invert the values
    analogWrite(redPin, 255 - red);
    analogWrite(greenPin, 255 - green);
    analogWrite(bluePin, 255 - blue);
}

void LEDService::hsvToRgb(uint16_t h, uint8_t s, uint8_t v, uint8_t &r, uint8_t &g, uint8_t &b)
{
    // Simple HSV to RGB conversion
    uint8_t sector = h / 43;
    uint16_t f = (h % 43) * 6;
    uint8_t p = (v * (255 - s)) >> 8;
    uint8_t q = (v * (255 - ((s * f) >> 8))) >> 8;
    uint8_t t = (v * (255 - ((s * (255 - f)) >> 8))) >> 8;

    switch (sector)
    {
    case 0:
        r = v;
        g = t;
        b = p;
        break;
    case 1:
        r = q;
        g = v;
        b = p;
        break;
    case 2:
        r = p;
        g = v;
        b = t;
        break;
    case 3:
        r = p;
        g = q;
        b = v;
        break;
    case 4:
        r = t;
        g = p;
        b = v;
        break;
    default:
        r = v;
        g = p;
        b = q;
        break;
    }
}