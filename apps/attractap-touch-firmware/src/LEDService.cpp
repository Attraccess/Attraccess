#include "LEDService.h"

bool LEDService::attraccessAuthenticated = false;
LEDService::WaitForNFCTapType LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_NONE;
bool LEDService::waitForResourceSelection = false;

uint8_t LEDService::updateFrequencyFps = 60;

LEDService::LEDService()
    : redPin(LED_RED_PIN), greenPin(LED_GREEN_PIN), bluePin(LED_BLUE_PIN), red(0), green(0), blue(0), baseRed(0), baseGreen(0), baseBlue(0), lastBlinkToggle(0), breatheDuration(1000), rainbowSpeed(250), rainbowHue(0)
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
            baseRed = 255;
            baseGreen = 165;
            baseBlue = 0;
        }

        updateBreathing();
        return;
    }

    if (LEDService::waitForResourceSelection)
    {
        currentState = LEDServiceState::WAITING_FOR_RESOURCE_SELECTION;
        // rainbow
        if (oldState != LEDServiceState::WAITING_FOR_RESOURCE_SELECTION)
        {
            rainbowStartTime = millis();
            rainbowHue = 0;
        }
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
            baseRed = 0;
            baseGreen = 0;
            baseBlue = 255;
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
            baseRed = 128;
            baseGreen = 0;
            baseBlue = 128;
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
            baseRed = 0;
            baseGreen = 255;
            baseBlue = 0;

            breatheStartTime = millis();
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
            baseRed = 255;
            baseGreen = 0;
            baseBlue = 0;

            breatheStartTime = millis();
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
        baseRed = 0;
        baseGreen = 0;
        baseBlue = 0;
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

    // Apply breathing effect to base colors using temporary variables
    // This prevents color drift by not modifying the base colors directly
    uint8_t tempRed = (uint8_t)(brightness * (baseRed / 255.0));
    uint8_t tempGreen = (uint8_t)(brightness * (baseGreen / 255.0));
    uint8_t tempBlue = (uint8_t)(brightness * (baseBlue / 255.0));

    // Update current colors with the breathing-modified values
    red = tempRed;
    green = tempGreen;
    blue = tempBlue;

    updateLed();
}

void LEDService::updateRainbow()
{
    uint32_t currentTime = millis();
    uint32_t elapsed = currentTime - rainbowStartTime;
    if (elapsed >= rainbowSpeed)
    {
        // Calculate how many hue steps to advance
        uint32_t steps = elapsed / rainbowSpeed;
        rainbowStartTime += steps * rainbowSpeed;
        rainbowHue = (rainbowHue + steps) % 256;

        hsvToRgb(rainbowHue, 255, 255, red, green, blue);
        updateLed();
    }
}

void LEDService::updateLed()
{
    // Clamp color values to 0-255
    uint8_t clampedRed = red > 255 ? 255 : (red < 0 ? 0 : red);
    uint8_t clampedGreen = green > 255 ? 255 : (green < 0 ? 0 : green);
    uint8_t clampedBlue = blue > 255 ? 255 : (blue < 0 ? 0 : blue);

    // Set individual LED values (active LOW)
    // since leds are active LOW, we need to invert the values
    analogWrite(redPin, 255 - clampedRed);
    analogWrite(greenPin, 255 - clampedGreen);
    analogWrite(bluePin, 255 - clampedBlue);
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