#pragma once

#include <Arduino.h>
#include "../logger/logger.hpp"
#include "Adafruit_PN532_NTAG424.h"
#include <Wire.h>

class NFC
{
public:
    NFC() : logger("NFC"), pn532(-1, -1, &Wire)
    {
    }

    void setup();
    void demo();
    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey);
    bool waitForCard(uint32_t timeoutMs = 10000);
    bool authenticate(uint8_t keyNumber, uint8_t *key);
    static uint8_t FACTORY_KEY[16];
    static uint8_t NEW_KEY[16];

private:
    Logger logger;
    Adafruit_PN532 pn532;
};