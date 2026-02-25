/**
 * Minimal main for ESP32-P4 display+touch only build.
 * No NFC, network, API - just display and touch for base bring-up.
 */
#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "display_p4.hpp"

SET_LOOP_TASK_STACK_SIZE(16 * 1024);

Logger mainLogger("Main");

void setup()
{
    Serial.begin(115200);
    mainLogger.info("Attractap P4 - Display+Touch only");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s",
                    FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

#if defined(PIN_I2C_SDA) && defined(PIN_I2C_SCL)
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
#else
    Wire.begin(7, 8);  // 4DS MIPI default I2C
#endif
    Wire.setTimeOut(50);

    mainLogger.info("Initializing display...");
    Display::setup();
    mainLogger.info("Setup done");
}

void loop()
{
    Display::loop();
}
