#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

SET_LOOP_TASK_STACK_SIZE(16 * 1024); // 16KB

Logger mainLogger("Main");

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