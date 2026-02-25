#include "nfc_p4_stub.hpp"

uint8_t NFC::FACTORY_KEY[16] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

bool NFC::setup() {
  logger.info("NFC stub (ESP32-P4): no NFC hardware support");
  return false;
}

void NFC::loop() {}

bool NFC::changeKey(uint8_t, uint8_t *, uint8_t *, uint8_t *) { return false; }

bool NFC::authenticate(uint8_t, uint8_t *) { return false; }

void NFC::enableCardDetection() { cardDetectionEnabled = true; }

void NFC::setCardDetectionCallback(
    std::function<void(uint8_t *, uint8_t)> callback) {
  cardDetectionCallback = callback;
}

void NFC::setCardRemovalCallback(
    std::function<void(uint32_t presentationTimeMs)> callback) {
  cardRemovalCallback = callback;
}

void NFC::disableCardDetection() { cardDetectionEnabled = false; }

bool NFC::getAvailableKeyNo(uint8_t *, uint8_t *, uint8_t *) { return false; }

bool NFC::isCardDetectionEnabled() { return cardDetectionEnabled; }
