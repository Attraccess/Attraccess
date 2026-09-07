#pragma once

#include "profile_store.hpp"

#include <array>
#include <cstdint>
#include <functional>
#include <string>

class VirtualNfc
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

    const Card &card() const { return currentCard; }
    void setCard(const Card &card);
    void setPresent(bool present);
    void setFaults(bool failAuthentication, bool failWrite);
    void resetKeySlot(uint8_t keyNumber);
    void setKeyVersion(uint8_t keyNumber, uint8_t keyVersion);

    bool authenticate(uint8_t keyNumber, const Key &key) const;
    bool changeKey(uint8_t keyNumber, const Key &masterKey, const Key &oldKey,
                   const Key &newKey, uint8_t keyVersion = 1);
    bool getAvailableKeyNo(uint8_t &keyNumber) const;

    void setCardDetectedCallback(std::function<void(const uint8_t *, uint8_t)> callback);
    void setCardRemovedCallback(std::function<void()> callback);

    static const Key &factoryKey();

private:
    static constexpr const char *StorageKey = "nfc.virtual-card.v1";

    static std::string encode(const Card &card);
    static bool decode(const std::string &value, Card &card);
    void save();

    ProfileStore &profile;
    Card currentCard;
    std::function<void(const uint8_t *, uint8_t)> cardDetectedCallback;
    std::function<void()> cardRemovedCallback;
};
