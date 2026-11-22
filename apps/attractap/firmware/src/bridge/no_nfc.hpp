#pragma once

// The BLE bridge has no card reader: the application gets an NFC front end that never sees a card.

#include "../rfid/rfid_contract.hpp"

class NoNfc : public INfc
{
public:
    void setup() override {}
    void loop() override {}
    void enableCardDetection() override {}
    void disableCardDetection() override {}
    bool suspend() override { return true; }
    void resetCardPresence() override {}
    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)>) override {}
    void setCardRemovalCallback(std::function<void(uint32_t)>) override {}
    bool isCardPresent() override { return false; }
    bool transceive(const uint8_t *, uint8_t, uint8_t *, uint8_t *responseLength) override
    {
        *responseLength = 0;
        return false;
    }
    void setConversationActive(bool) override {}
};
