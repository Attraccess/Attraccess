#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>

class INfc
{
public:
    enum CardType
    {
        CARD_TYPE_UNKNOWN = 0,
        CARD_TYPE_NTAG424,
        CARD_TYPE_DESFIRE,
    };

    virtual ~INfc() = default;
    virtual void setup() = 0;
    virtual void loop() = 0;
    virtual bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey,
                           uint8_t keyVersion = 0x01) = 0;
    virtual bool authenticate(uint8_t keyNumber, uint8_t *key) = 0;
    virtual void enableCardDetection() = 0;
    virtual void disableCardDetection() = 0;
    virtual void resetCardPresence() = 0;
    virtual void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback) = 0;
    virtual void setCardRemovalCallback(std::function<void(uint32_t)> callback) = 0;
    virtual bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo) = 0;
    virtual bool isCardPresent() = 0;
    virtual uint8_t *getFactoryKey() = 0;
};
