#pragma once

#include "../../nfc/nfc.hpp"

class INfcPort {
public:
  virtual ~INfcPort() = default;

  virtual bool setup() = 0;
  virtual void loop() = 0;
  virtual bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                         uint8_t *newKey) = 0;
  virtual bool authenticate(uint8_t keyNumber, uint8_t *key) = 0;
  virtual void enableCardDetection() = 0;
  virtual void setCardDetectionCallback(
      std::function<void(uint8_t *, uint8_t)> callback) = 0;
  virtual void setCardRemovalCallback(
      std::function<void(uint32_t presentationTimeMs)> callback) = 0;
  virtual void disableCardDetection() = 0;
  virtual bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength,
                                 uint8_t *keyNo) = 0;
};
