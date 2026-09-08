#pragma once

#include "profile_store.hpp"
#include "nfc/nfc_contract.hpp"

#include <array>
#include <cstdint>
#include <functional>
#include <string>

class VirtualNfc : public INfc
{
public:
    static constexpr size_t KeySize = 16;
    static constexpr size_t KeySlotCount = 6;
    using Key = std::array<uint8_t, KeySize>;

    enum class CardType : uint8_t
    {
        Unknown,
        Ntag424,
        Desfire,
    };

    struct Card
    {
        std::array<uint8_t, 7> uid{0x04, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x01};
        uint8_t uidLength = 7;
        CardType type = CardType::Ntag424;
        bool present = false;
        bool failAuthentication = false;
        bool failWrite = false;
        std::array<Key, KeySlotCount> keys{};
        std::array<uint8_t, KeySlotCount> keyVersions{};
    };

    explicit VirtualNfc(ProfileStore &profile);

    void setup() override {}
    void loop() override {}

    const Card &card() const { return currentCard; }
    void setCard(const Card &card);
    void setPresent(bool present);
    void setFaults(bool failAuthentication, bool failWrite);
    void resetKeySlot(uint8_t keyNumber);
    void setKeyVersion(uint8_t keyNumber, uint8_t keyVersion);

    bool authenticate(uint8_t keyNumber, uint8_t *key) override;
    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                   uint8_t *newKey, uint8_t keyVersion = 1) override;
    bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNumber) override;
    bool isCardPresent() override { return currentCard.present; }
    uint8_t *getFactoryKey() override { return const_cast<uint8_t *>(factoryKey().data()); }

    void enableCardDetection() override { cardDetectionEnabled = true; }
    void disableCardDetection() override { cardDetectionEnabled = false; }
    void resetCardPresence() override {}

    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback) override;
    void setCardRemovalCallback(std::function<void(uint32_t)> callback) override;

    static const Key &factoryKey();

private:
    static constexpr const char *StorageKey = "nfc.virtual-card.v1";

    static std::string encode(const Card &card);
    static bool decode(const std::string &value, Card &card);
    void save();

    ProfileStore &profile;
    Card currentCard;
    bool cardDetectionEnabled = false;
    std::function<void(uint8_t *, uint8_t)> cardDetectedCallback;
    std::function<void(uint32_t)> cardRemovedCallback;
};
