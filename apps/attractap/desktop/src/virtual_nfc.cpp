#include "virtual_nfc.hpp"

#include <charconv>
#include <algorithm>
#include <iomanip>
#include <sstream>
#include <string_view>

namespace
{
std::string hex(const uint8_t *bytes, size_t count)
{
    std::ostringstream output;
    output << std::hex << std::setfill('0');
    for (size_t index = 0; index < count; ++index)
        output << std::setw(2) << static_cast<unsigned>(bytes[index]);
    return output.str();
}

bool readHex(std::string_view value, uint8_t *bytes, size_t count)
{
    if (value.size() != count * 2)
        return false;
    for (size_t index = 0; index < count; ++index)
    {
        unsigned parsed = 0;
        const auto result = std::from_chars(value.data() + index * 2, value.data() + index * 2 + 2, parsed, 16);
        if (result.ec != std::errc() || result.ptr != value.data() + index * 2 + 2)
            return false;
        bytes[index] = static_cast<uint8_t>(parsed);
    }
    return true;
}

bool readUnsigned(std::string_view value, unsigned &result)
{
    const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
    return parsed.ec == std::errc() && parsed.ptr == value.data() + value.size();
}
}

VirtualNfc::VirtualNfc(ProfileStore &profile) : profile(profile)
{
    for (size_t index = 0; index < CardCount; ++index)
    {
        cards[index] = defaultCard(index);
        std::string stored = profile.get(storageKey(index));
        if (index == 0 && stored.empty())
            stored = profile.get(LegacyStorageKey);
        if (!stored.empty())
        {
            Card persisted;
            if (decode(stored, persisted))
            {
                persisted.uid = cards[index].uid;
                persisted.uidLength = cards[index].uidLength;
                persisted.present = false;
                cards[index] = persisted;
            }
        }
        save(index);
    }
}

void VirtualNfc::setCard(size_t index, const Card &card)
{
    if (index >= CardCount)
        return;
    const bool wasPresented = presentedCard == index;
    cards[index] = card;
    const Card defaults = defaultCard(index);
    cards[index].uid = defaults.uid;
    cards[index].uidLength = defaults.uidLength;
    cards[index].present = wasPresented && card.present;
    save(index);

    // A replacement is a removal followed by a new presentation.
    if (wasPresented && cardPresenceReported)
    {
        cardPresenceReported = false;
        if (cardDetectionEnabled && cardRemovedCallback)
            cardRemovedCallback(0);
    }
    if (wasPresented && !cards[index].present)
        presentedCard = CardCount;
    reconcileCardPresence();
}

void VirtualNfc::setPresent(size_t index, bool present)
{
    if (index >= CardCount || (present && presentedCard == index) || (!present && presentedCard != index))
        return;

    if (presentedCard < CardCount)
    {
        cards[presentedCard].present = false;
        presentedCard = CardCount;
        reconcileCardPresence();
    }
    presentedCard = present ? index : CardCount;
    if (present)
        cards[index].present = true;
    reconcileCardPresence();
}

void VirtualNfc::clearCardData(size_t index)
{
    if (index >= CardCount)
        return;
    const bool wasPresented = presentedCard == index;
    if (wasPresented)
        setPresent(index, false);
    cards[index] = defaultCard(index);
    save(index);
}

void VirtualNfc::loop()
{
    reconcileCardPresence();
}

void VirtualNfc::setFaults(bool failAuthentication, bool failWrite)
{
    if (presentedCard >= CardCount) return;
    currentCard().failAuthentication = failAuthentication;
    currentCard().failWrite = failWrite;
    save(presentedCard);
}

void VirtualNfc::resetKeySlot(uint8_t keyNumber)
{
    if (keyNumber >= KeySlotCount)
        return;
    if (presentedCard >= CardCount) return;
    currentCard().keys[keyNumber] = factoryKey();
    currentCard().keyVersions[keyNumber] = 0;
    save(presentedCard);
}

void VirtualNfc::setKeyVersion(uint8_t keyNumber, uint8_t keyVersion)
{
    if (keyNumber >= KeySlotCount)
        return;
    if (presentedCard >= CardCount) return;
    currentCard().keyVersions[keyNumber] = keyVersion;
    save(presentedCard);
}

bool VirtualNfc::authenticate(uint8_t keyNumber, uint8_t *key)
{
    if (presentedCard >= CardCount) return false;
    const Card &card = currentCard();
    return card.present && card.type != CardType::Unknown && !card.failAuthentication && keyNumber < KeySlotCount &&
           std::equal(card.keys[keyNumber].begin(), card.keys[keyNumber].end(), key);
}

bool VirtualNfc::changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                            uint8_t *newKey, uint8_t keyVersion)
{
    if (presentedCard >= CardCount || keyNumber >= KeySlotCount || currentCard().failWrite || !authenticate(0, masterKey) ||
        !authenticate(keyNumber, oldKey))
        return false;

    std::copy_n(newKey, KeySize, currentCard().keys[keyNumber].begin());
    currentCard().keyVersions[keyNumber] = keyVersion;
    save(presentedCard);
    return authenticate(keyNumber, newKey);
}

bool VirtualNfc::getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNumber)
{
    if (presentedCard >= CardCount)
        return false;
    const Card &card = currentCard();
    if (!card.present || card.type == CardType::Unknown || card.failAuthentication)
        return false;

    if (card.type == CardType::Desfire && !authenticate(0, getFactoryKey()))
        return false;

    for (uint8_t index = 1; index < KeySlotCount; ++index)
    {
        const bool isFree = card.type == CardType::Desfire
                                ? card.keyVersions[index] == 0
                                : authenticate(index, getFactoryKey());
        if (isFree)
        {
            *keyNumber = index;
            if (uid && uidLength)
            {
                std::copy_n(card.uid.begin(), card.uidLength, uid);
                *uidLength = card.uidLength;
            }
            return true;
        }
    }
    return false;
}

void VirtualNfc::setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback)
{
    cardDetectedCallback = std::move(callback);
}

void VirtualNfc::setCardRemovalCallback(std::function<void(uint32_t)> callback)
{
    cardRemovedCallback = std::move(callback);
}

const VirtualNfc::Key &VirtualNfc::factoryKey()
{
    static const Key key{};
    return key;
}

VirtualNfc::Card VirtualNfc::defaultCard(size_t index)
{
    Card card;
    card.uid[6] = static_cast<uint8_t>(index + 1);
    for (auto &key : card.keys)
        key = factoryKey();
    return card;
}

std::string VirtualNfc::storageKey(size_t index)
{
    return std::string(StorageKeyPrefix) + std::to_string(index);
}

VirtualNfc::Card &VirtualNfc::currentCard()
{
    return cards[presentedCard];
}

const VirtualNfc::Card &VirtualNfc::currentCard() const
{
    return cards[presentedCard];
}

std::string VirtualNfc::encode(const Card &card)
{
    std::ostringstream output;
    output << "1|" << hex(card.uid.data(), card.uidLength) << "|" << static_cast<unsigned>(card.type) << "|"
           << card.present << "|" << card.failAuthentication << "|" << card.failWrite;
    for (size_t index = 0; index < KeySlotCount; ++index)
        output << "|" << static_cast<unsigned>(card.keyVersions[index]) << ":" << hex(card.keys[index].data(), KeySize);
    return output.str();
}

bool VirtualNfc::decode(const std::string &value, Card &card)
{
    Card parsed;
    std::array<std::string_view, 12> fields{};
    size_t start = 0;
    for (size_t index = 0; index < fields.size(); ++index)
    {
        const size_t end = value.find('|', start);
        fields[index] = std::string_view(value).substr(start, end - start);
        if (end == std::string::npos)
        {
            if (index + 1 != fields.size())
                return false;
            start = value.size();
        }
        else
        {
            start = end + 1;
        }
    }
    if (start != value.size())
        return false;

    unsigned version = 0;
    unsigned type = 0;
    unsigned present = 0;
    unsigned failAuthentication = 0;
    unsigned failWrite = 0;
    if (!readUnsigned(fields[0], version) || version != 1 || fields[1].size() / 2 > parsed.uid.size() ||
        !readHex(fields[1], parsed.uid.data(), fields[1].size() / 2) || !readUnsigned(fields[2], type) || type > 2 ||
        !readUnsigned(fields[3], present) || present > 1 || !readUnsigned(fields[4], failAuthentication) ||
        failAuthentication > 1 || !readUnsigned(fields[5], failWrite) || failWrite > 1)
        return false;

    parsed.uidLength = static_cast<uint8_t>(fields[1].size() / 2);
    parsed.type = static_cast<CardType>(type);
    parsed.present = present != 0;
    parsed.failAuthentication = failAuthentication != 0;
    parsed.failWrite = failWrite != 0;
    for (size_t index = 0; index < KeySlotCount; ++index)
    {
        const std::string_view slot = fields[index + 6];
        const size_t separator = slot.find(':');
        unsigned keyVersion = 0;
        if (separator == std::string::npos || !readUnsigned(slot.substr(0, separator), keyVersion) || keyVersion > 255 ||
            !readHex(slot.substr(separator + 1), parsed.keys[index].data(), KeySize))
            return false;
        parsed.keyVersions[index] = static_cast<uint8_t>(keyVersion);
    }
    if (parsed.uidLength == 0)
        return false;
    card = parsed;
    return true;
}

void VirtualNfc::save(size_t index)
{
    Card persisted = cards[index];
    persisted.present = false;
    profile.put(storageKey(index), encode(persisted));
}

void VirtualNfc::reconcileCardPresence()
{
    const bool present = presentedCard < CardCount;
    if (!cardDetectionEnabled || present == cardPresenceReported)
        return;

    cardPresenceReported = present;
    if (cardPresenceReported && cardDetectedCallback)
        cardDetectedCallback(currentCard().uid.data(), currentCard().uidLength);
    if (!cardPresenceReported && cardRemovedCallback)
        cardRemovedCallback(0);
}
