#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "display/display.hpp"
#include "nfc/nfc.hpp"

NFC nfc;
Logger mainLogger("Main");

void setup()
{
    Serial.begin(115200);
    delay(2000);

    Wire.begin(15, 7);

    mainLogger.info("Attractap starting...");

    nfc.setup();
    Display::setup(&nfc);
}

void loop()
{
    static uint32_t lastDebug = 0;
    if (millis() - lastDebug > 5000)
    {
        mainLogger.debug(("loop running at " + String(millis()) + " ms").c_str());
        lastDebug = millis();
    }

    Display::loop();
}