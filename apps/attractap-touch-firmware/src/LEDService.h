#ifndef LED_SERVICE_H
#define LED_SERVICE_H

#include <Arduino.h>

class LEDService
{
public:
    static bool attraccessAuthenticated;

    enum WaitForNFCTapType
    {
        WAIT_FOR_NFC_TAP_NONE,
        WAIT_FOR_NFC_TAP_ENROLL,
        WAIT_FOR_NFC_TAP_RESET,
        WAIT_FOR_NFC_TAP_USAGE_START,
        WAIT_FOR_NFC_TAP_USAGE_END
    };

    enum LEDServiceState
    {
        NOT_AUTHENTICATED,
        WAITING_FOR_RESOURCE_SELECTION,
        WAITING_FOR_NFC_TAP_ENROLL,
        WAITING_FOR_NFC_TAP_RESET,
        WAITING_FOR_NFC_TAP_USAGE_START,
        WAITING_FOR_NFC_TAP_USAGE_END,
        IDLE
    };

    static WaitForNFCTapType waitForNFCTap;
    static bool waitForResourceSelection;

    static uint8_t updateFrequencyFps;

    LEDService();
    ~LEDService();

    void begin();
    void update();

private:
    // LED pins
    uint8_t redPin;
    uint8_t greenPin;
    uint8_t bluePin;

    // current colors
    uint8_t red;
    uint8_t green;
    uint8_t blue;

    // base colors for breathing effect (to prevent color drift)
    uint8_t baseRed;
    uint8_t baseGreen;
    uint8_t baseBlue;

    // Blinking state
    bool isBlinking;
    uint32_t lastBlinkToggle;

    // Breathing animation state
    bool isBreathing;
    uint32_t breatheStartTime;
    uint32_t breatheDuration;

    // Rainbow animation state
    uint32_t rainbowStartTime;
    uint32_t rainbowSpeed;
    uint8_t rainbowHue;

    LEDServiceState currentState;

    TaskHandle_t ledTaskHandle;

    // Internal methods
    void updateLEDs();
    void updateBlinking(uint32_t interval);
    void updateBreathing();
    void updateRainbow();
    void updateLed();
    void hsvToRgb(uint16_t h, uint8_t s, uint8_t v, uint8_t &r, uint8_t &g, uint8_t &b);
};

#endif // LED_SERVICE_H