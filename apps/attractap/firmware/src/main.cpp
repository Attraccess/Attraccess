#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "application/application.hpp"
#include "utils.hpp"

SET_LOOP_TASK_STACK_SIZE(16 * 1024); // 16KB

Application application;

Logger mainLogger("Main");

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

#if defined(PIN_NFC_I2C_SDA) && defined(PIN_NFC_I2C_SCL)
    mainLogger.infof("I2C init: SDA=%d, SCL=%d", PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
    recoverI2CBus(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
    Wire.begin(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
#else
    mainLogger.info("I2C init: using default SDA/SCL pins");
    recoverI2CBus(SDA, SCL);
    Wire.begin(SDA, SCL); // SDA, SCL
#endif

    // Prevent potential I2C stalls on touch controller reads
    Wire.setTimeOut(50);
    Wire.setClock(ATTRACTAP_I2C_CLOCK_HZ);

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
