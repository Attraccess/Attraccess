#pragma once

#include "../logger/logger.hpp"
#include <Arduino.h>
#include <functional>

/**
 * NFC stub for ESP32-P4: mbedtls/NTAG424 compatibility issues with P4
 * framework. Provides same interface as NFC but does nothing; card detection
 * never fires.
 */
class NFC {
public:
  NFC() : logger("NFC") {}

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
  bool cardDetectionEnabled = false;
  std::function<void(uint8_t *, uint8_t)> cardDetectionCallback;
  std::function<void(uint32_t presentationTimeMs)> cardRemovalCallback;
};
