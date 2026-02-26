#pragma once

#include "../ports/nfc_port.hpp"

class NfcAdapter : public INfcPort {
public:
  bool setup() override { return this->nfc.setup(); }
  void loop() override { this->nfc.loop(); }
  bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                 uint8_t *newKey) override {
    return this->nfc.changeKey(keyNumber, masterKey, oldKey, newKey);
  }
  bool authenticate(uint8_t keyNumber, uint8_t *key) override {
    return this->nfc.authenticate(keyNumber, key);
  }
  void enableCardDetection() override { this->nfc.enableCardDetection(); }
  void setCardDetectionCallback(
      std::function<void(uint8_t *, uint8_t)> callback) override {
    this->nfc.setCardDetectionCallback(callback);
  }
  void setCardRemovalCallback(
      std::function<void(uint32_t presentationTimeMs)> callback) override {
    this->nfc.setCardRemovalCallback(callback);
  }
  void disableCardDetection() override { this->nfc.disableCardDetection(); }
  bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength,
                         uint8_t *keyNo) override {
    return this->nfc.getAvailableKeyNo(uid, uidLength, keyNo);
  }

private:
  NFC nfc;
};
