#pragma once

#include <Arduino.h>
#include "../logger/logger.hpp"
#include "Adafruit_PN532_NTAG424.h"
#include <Wire.h>
#include "../state/state.hpp"
#include "FunctionalInterrupt.h"

class NFC
{
public:
    NFC() : logger("NFC"), pn532(PIN_PN532_IRQ, -1, &Wire)
    {
    }

    void setup();
    void loop();

    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey);
    bool authenticate(uint8_t keyNumber, uint8_t *key);
    void enableCardDetection();
    void setCardDetectionCallback(std::function<void()> callback);
    void disableCardDetection();

    static uint8_t FACTORY_KEY[16];
    // TODO: remove this, should come from API
    static uint8_t NEW_KEY[16];

private:
    Logger logger;
    Adafruit_PN532 pn532;
    bool waitForCard(uint32_t timeoutMs = 10000);

    // TODO: remove this
    void demo();

    void onCardDetectedInterruptHandler();
    bool cardDetected = false;
    std::function<void()> cardDetectionCallback;
    void handleCardDetection();

    uint32_t lastHardwareCheckMs = 0;
    void checkHardware(bool logHardwareInfo = false);
    static const uint32_t hardwareCheckIntervalMs = 10000;
};