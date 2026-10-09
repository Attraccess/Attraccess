#include "virtual_rfid.hpp"
#include <algorithm>

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
