#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "application/application.hpp"

SET_LOOP_TASK_STACK_SIZE(16 * 1024); // 16KB

Application application;

Logger mainLogger("Main");

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

void setup()
{
    Serial.begin(115200);
    delay(2000);

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    mainLogger.info("Serial initialized");

#if defined(DISPLAY_DRIVER_QUALIA)
    // Use board default I2C pins for the Qualia driver so the PCA expander/touch are reachable
    Wire.begin(SDA, SCL);
#else
    // GT911 hardware uses dedicated I2C lines on the devkit
    Wire.begin(15, 7);
#endif
    // Prevent potential I2C stalls on touch controller reads
    Wire.setTimeOut(50);

    mainLogger.info("Attractap starting...");
    application.setup();
}

void loop()
{
    logLoopStackUsage();
    application.loop();
    // Cooperatively yield to other tasks and drivers
    // delay(1);
}