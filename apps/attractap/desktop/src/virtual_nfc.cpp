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
    const std::string stored = profile.get(StorageKey);
    if (!stored.empty() && decode(stored, currentCard))
        return;

    for (auto &key : currentCard.keys)
        key = factoryKey();
    save();
}

void VirtualNfc::setCard(const Card &card)
{
    currentCard = card;
    save();

    // A replacement is a removal followed by a new presentation.
    if (cardPresenceReported)
    {
        cardPresenceReported = false;
        if (cardDetectionEnabled && cardRemovedCallback)
            cardRemovedCallback(0);
    }
    reconcileCardPresence();
}

void VirtualNfc::setPresent(bool present)
{
    if (currentCard.present == present)
        return;

    currentCard.present = present;
    save();
    reconcileCardPresence();
}

void VirtualNfc::loop()
{
    reconcileCardPresence();
}

void VirtualNfc::setFaults(bool failAuthentication, bool failWrite)
{
    currentCard.failAuthentication = failAuthentication;
    currentCard.failWrite = failWrite;
    save();
}

void VirtualNfc::resetKeySlot(uint8_t keyNumber)
{
    if (keyNumber >= KeySlotCount)
        return;
    currentCard.keys[keyNumber] = factoryKey();
    currentCard.keyVersions[keyNumber] = 0;
    save();
}

void VirtualNfc::setKeyVersion(uint8_t keyNumber, uint8_t keyVersion)
{
    if (keyNumber >= KeySlotCount)
        return;
    currentCard.keyVersions[keyNumber] = keyVersion;
    save();
}

bool VirtualNfc::authenticate(uint8_t keyNumber, uint8_t *key)
{
    return currentCard.present && currentCard.type != CardType::Unknown && !currentCard.failAuthentication && keyNumber < KeySlotCount &&
           std::equal(currentCard.keys[keyNumber].begin(), currentCard.keys[keyNumber].end(), key);
}

bool VirtualNfc::changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey,
                            uint8_t *newKey, uint8_t keyVersion)
{
    if (keyNumber >= KeySlotCount || currentCard.failWrite || !authenticate(0, masterKey) ||
        !authenticate(keyNumber, oldKey))
        return false;

    std::copy_n(newKey, KeySize, currentCard.keys[keyNumber].begin());
    currentCard.keyVersions[keyNumber] = keyVersion;
    save();
    return authenticate(keyNumber, newKey);
}

bool VirtualNfc::getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNumber)
{
    if (!currentCard.present || currentCard.type == CardType::Unknown || currentCard.failAuthentication)
        return false;

    if (currentCard.type == CardType::Desfire && !authenticate(0, getFactoryKey()))
        return false;

    for (uint8_t index = 1; index < KeySlotCount; ++index)
    {
        const bool isFree = currentCard.type == CardType::Desfire
                                ? currentCard.keyVersions[index] == 0
                                : authenticate(index, getFactoryKey());
        if (isFree)
        {
            *keyNumber = index;
            if (uid && uidLength)
            {
                std::copy_n(currentCard.uid.begin(), currentCard.uidLength, uid);
                *uidLength = currentCard.uidLength;
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

void VirtualNfc::save()
{
    profile.put(StorageKey, encode(currentCard));
}

void VirtualNfc::reconcileCardPresence()
{
    if (!cardDetectionEnabled || currentCard.present == cardPresenceReported)
        return;

    cardPresenceReported = currentCard.present;
    if (cardPresenceReported && cardDetectedCallback)
        cardDetectedCallback(currentCard.uid.data(), currentCard.uidLength);
    if (!cardPresenceReported && cardRemovedCallback)
        cardRemovedCallback(0);
}
