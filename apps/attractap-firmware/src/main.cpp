#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

SET_LOOP_TASK_STACK_SIZE(16 * 1024); // 16KB

Logger mainLogger("Main");

#if defined(DISPLAY_DRIVER_P4_DSI) && !defined(ATTACTAP_P4_FULL_APP)
// Minimal P4: display+touch only (no Application)
#include "display_p4.hpp"

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

#else
// Full application
#include "application/application.hpp"

Application application;

#ifdef LOG_MEMORY_DEBUG
void logLoopStackUsage()
{
    static uint32_t lastPrint = 0;
    if (millis() - lastPrint < 1000)
        return;
    lastPrint = millis();

    UBaseType_t watermarkWords = uxTaskGetStackHighWaterMark(nullptr);
    Logger logger("Stack");
    logger.debugf("loopTask high watermark: %u words (~%u bytes)",
                  watermarkWords, watermarkWords * sizeof(StackType_t));
}
#endif

void setup()
{
    Serial.begin(115200);
    delay(2000);

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    mainLogger.info("Serial initialized");

#if defined(PIN_I2C_SDA) && defined(PIN_I2C_SCL)
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
#else
    Wire.begin(SDA, SCL); // SDA, SCL
#endif

    // Prevent potential I2C stalls on touch controller reads
    Wire.setTimeOut(50);

    mainLogger.info("Attractap starting...");
    application.setup();
}

void loop()
{
#ifdef LOG_MEMORY_DEBUG
    logLoopStackUsage();
#endif

    application.loop();
}
#endif