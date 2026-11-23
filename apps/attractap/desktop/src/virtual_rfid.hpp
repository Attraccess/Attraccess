#pragma once

#include "profile_store.hpp"
#include "rfid/rfid_contract.hpp"
#include "virtual_card_chip.hpp"

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
    // The simulator's last card is always a UID-only card, so the UID-only flow can be tried without hardware.
    static constexpr size_t UidOnlyCardIndex = CardCount - 1;
    using Key = std::array<uint8_t, KeySize>;

    enum class CardType : uint8_t
    {
        Unknown,
        Ntag424,
        Desfire,
        // A cheap card that only offers its UID (NTAG213, MIFARE Classic): no ISO 14443-4, so it answers no APDU.
        UidOnly,
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
        // A DESFire card gets its Attraccess application when the server creates it during enrollment.
        // Not persisted: it follows from the key versions after a restart.
        bool applicationExists = false;
    };

    explicit VirtualNfc(ProfileStore &profile);

    void setup() override {}
    void loop() override;

    const Card &card(size_t index) const { return cards.at(index); }
    void setCard(size_t index, const Card &card);
    void setPresent(size_t index, bool present);
    // Test hook: another UID for an absent card (a 4-byte random UID, a longer one); not persisted.
    void setUid(size_t index, const uint8_t *uid, uint8_t length);
    void clearCardData(size_t index);
    void setFaults(bool failAuthentication, bool failWrite);
    void resetKeySlot(uint8_t keyNumber);
    void setKeyVersion(uint8_t keyNumber, uint8_t keyVersion);

    void setRemoveOnWrite(bool enabled) { removeOnWrite = enabled; didRemoveOnWrite = false; }
    bool removedOnWrite() const { return didRemoveOnWrite; }

    // The simulated card answers complete APDUs like the chip does; all card crypto runs on the server.
    bool transceive(const uint8_t *apdu, uint8_t apduLength, uint8_t *response, uint8_t *responseLength) override;
    void setConversationActive(bool active) override { conversationActive = active; }
    bool isCardPresent() override { return !suspended && presentedCard < CardCount; }
    bool lastDetectionInfo(uint8_t &sak, uint16_t &atqa) const override;

    void enableCardDetection() override { if (!suspended) cardDetectionEnabled = true; }
    void disableCardDetection() override { cardDetectionEnabled = false; }
    bool suspend() override { suspended = true; cardDetectionEnabled = false; return true; }
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

    bool removeOnWrite = false;
    bool didRemoveOnWrite = false;
    ProfileStore &profile;
    std::array<Card, CardCount> cards;
    size_t presentedCard = CardCount;
    bool cardDetectionEnabled = false;
    bool suspended = false;
    bool cardPresenceReported = false;
    bool conversationActive = false;
    VirtualCardChip chip;
    std::function<void(uint8_t *, uint8_t)> cardDetectedCallback;
    std::function<void(uint32_t)> cardRemovedCallback;
};
