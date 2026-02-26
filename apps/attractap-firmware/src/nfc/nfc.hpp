#pragma once

#include "../logger/logger.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "Adafruit_PN532_NTAG424.h"
#include <Arduino.h>
#include <Wire.h>

class NFC {
public:
  NFC() : logger("NFC"), pn532(PIN_PN532_IRQ, -1, &Wire) {}

  bool setup();
  void loop();

  bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                 uint8_t *newKey);
  bool authenticate(uint8_t keyNumber, uint8_t *key);
  void enableCardDetection();
  void
  setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback);
  void setCardRemovalCallback(
      std::function<void(uint32_t presentationTimeMs)> callback);
  void disableCardDetection();

  bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo);

  static uint8_t FACTORY_KEY[16];

  bool isCardDetectionEnabled();

private:
  Logger logger;
  Adafruit_PN532 pn532;
  bool waitForCard(uint32_t timeoutMs = 10000);

  uint8_t cardDetectedUid[7] = {0};
  uint8_t cardDetectedUidLength = 0;

  bool foundCard = false;
  uint32_t foundCardTimeMs = 0;

  // TODO: remove this
  void demo();

  bool cardDetectionEnabled = false;
  std::function<void(uint8_t *, uint8_t)> cardDetectionCallback;
  std::function<void(uint32_t presentationTimeMs)> cardRemovalCallback;
  void handleCardDetection();

  uint32_t lastHardwareCheckMs = 0;
  bool checkHardware(bool logHardwareInfo = false);
  static const uint32_t hardwareCheckIntervalMs = 10000;
};