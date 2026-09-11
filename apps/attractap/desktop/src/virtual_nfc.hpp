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
    static constexpr size_t CardCount = 4;
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
    void loop() override;

    const Card &card(size_t index) const { return cards.at(index); }
    void setCard(size_t index, const Card &card);
    void setPresent(size_t index, bool present);
    void clearCardData(size_t index);
    void setFaults(bool failAuthentication, bool failWrite);
    void resetKeySlot(uint8_t keyNumber);
    void setKeyVersion(uint8_t keyNumber, uint8_t keyVersion);

    bool authenticate(uint8_t keyNumber, uint8_t *key) override;
    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                   uint8_t *newKey, uint8_t keyVersion = 1) override;
    bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNumber) override;
    bool isCardPresent() override { return presentedCard < CardCount; }
    uint8_t *getFactoryKey() override { return const_cast<uint8_t *>(factoryKey().data()); }

    void enableCardDetection() override { cardDetectionEnabled = true; }
    void disableCardDetection() override { cardDetectionEnabled = false; }
    void resetCardPresence() override { cardPresenceReported = false; }

    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback) override;
    void setCardRemovalCallback(std::function<void(uint32_t)> callback) override;

    static const Key &factoryKey();

private:
    static constexpr const char *LegacyStorageKey = "nfc.virtual-card.v1";
    static constexpr const char *StorageKeyPrefix = "nfc.virtual-card.v2.";

    static std::string encode(const Card &card);
    static bool decode(const std::string &value, Card &card);
    static Card defaultCard(size_t index);
    static std::string storageKey(size_t index);
    Card &currentCard();
    const Card &currentCard() const;
    void save(size_t index);
    void reconcileCardPresence();

    ProfileStore &profile;
    std::array<Card, CardCount> cards;
    size_t presentedCard = CardCount;
    bool cardDetectionEnabled = false;
    bool cardPresenceReported = false;
    std::function<void(uint8_t *, uint8_t)> cardDetectedCallback;
    std::function<void(uint32_t)> cardRemovedCallback;
};
