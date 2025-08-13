#pragma once

#include <Arduino.h>
#include <Adafruit_MPR121.h>
#include "../../../logger/logger.hpp"
#include "../../../state/state.hpp"

#include "../../IKeypad.hpp"

class MPR121 : public IKeypad
{
public:
    MPR121() : logger("Keyboard:MPR121") {}

    bool setup() override;
    char checkForKeyPress() override;
    void setThresholds(uint8_t touch, uint8_t release)
    {

        capSensor.setThresholds(touch, release);
        lastTouchThreshold = touch;
        lastReleaseThreshold = release;
        isConfigured = true;
    };
    void getBaselineAndFiltered(uint16_t (&baseline)[12], uint16_t (&filtered)[12])
    {
        for (uint8_t i = 0; i < 12; i++)
        {
            baseline[i] = capSensor.baselineData(i);
            filtered[i] = capSensor.filteredData(i);
        }
    }

    void getStatusJson(String &out, uint8_t touch, uint8_t release)
    {
        uint16_t base[12];
        uint16_t filt[12];
        getBaselineAndFiltered(base, filt);
        out = "{\"type\":\"MPR121\",\"needsConfig\":";
        out += ((touch == 0 || release == 0) ? "true" : "false");
        out += ",\"thresholds\":[" + String(touch) + "," + String(release) + "],\"channels\":[";
        for (uint8_t i = 0; i < 12; i++)
        {
            out += "[" + String(base[i]) + "," + String(filt[i]) + "]";
            if (i < 11)
                out += ",";
        }
        out += "],\"keymap\":[";
        for (uint8_t i = 0; i < 12; i++)
        {
            out += "\"" + String(keymap[i]) + "\"";
            if (i < 11)
                out += ",";
        }
        out += "]}";
    }

private:
    // Returns address that successfully responds, or 0x00 if none
    uint8_t detectWorkingAddress();

    Adafruit_MPR121 capSensor;
    bool isInitialized = false;
    uint8_t i2cAddress = 0x00;

    uint16_t currentlyTouched = 0;
    uint16_t lastTouched = 0;

    // Custom keypad mapping: indices 0..11 map to characters
    // 0..11 => 3,6,9,#(OK),2,5,8,0,1,4,7,'D'(CANCEL)
    const char keymap[12] = {'3', '6', '9', IKeypad::KEYPAD_CONFIRM, '2', '5', '8', '0', '1', '4', '7', IKeypad::KEYPAD_CANCEL};

    Logger logger;

    bool isConfigured = false;
    uint8_t lastTouchThreshold = 0;
    uint8_t lastReleaseThreshold = 0;
};