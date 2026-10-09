#include "virtual_rfid.hpp"

#include <charconv>
#include <algorithm>
#include <iomanip>
#include <sstream>
#include <string_view>


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
