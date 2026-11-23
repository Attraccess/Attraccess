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
                // Fixed role of this card, whatever an older profile stored for it.
                if (index == UidOnlyCardIndex)
                    persisted.type = CardType::UidOnly;
                persisted.applicationExists =
                    std::any_of(persisted.keyVersions.begin(), persisted.keyVersions.end(), [](uint8_t v) { return v != 0; });
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
    cards[index].applicationExists =
        card.applicationExists || std::any_of(card.keyVersions.begin(), card.keyVersions.end(), [](uint8_t v) { return v != 0; });
    chip.reset();
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
    chip.reset();
    if (present)
        cards[index].present = true;
    reconcileCardPresence();
}

void VirtualNfc::setUid(size_t index, const uint8_t *uid, uint8_t length)
{
    if (index >= CardCount || presentedCard == index || length > cards[index].uid.size())
        return;
    cards[index].uid = {};
    std::copy(uid, uid + length, cards[index].uid.begin());
    cards[index].uidLength = length;
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

bool VirtualNfc::transceive(const uint8_t *apdu, uint8_t apduLength, uint8_t *response, uint8_t *responseLength)
{
    if (suspended || presentedCard >= CardCount || !currentCard().present || !response || !responseLength)
        return false;
    // No ISO 14443-4: the reader cannot send this card an APDU.
    if (currentCard().type == CardType::UidOnly)
        return false;

    Card &card = currentCard();
    VirtualCardChip::Memory memory;
    memory.kind = card.type == CardType::Ntag424   ? VirtualCardChip::Kind::Ntag424
                  : card.type == CardType::Desfire ? VirtualCardChip::Kind::Desfire
                                                   : VirtualCardChip::Kind::Unknown;
    memory.keys = card.keys;
    memory.keyVersions = card.keyVersions;
    memory.applicationExists = card.applicationExists;
    memory.failAuthentication = card.failAuthentication;
    memory.failWrite = card.failWrite;

    const size_t index = presentedCard;
    const auto answer = chip.transceive(memory, apdu, apduLength, [this, index]() {
        // Host-only one-shot physical removal at the moment a key change reaches the card.
        if (!removeOnWrite)
            return false;
        removeOnWrite = false;
        didRemoveOnWrite = true;
        setPresent(index, false);
        return true;
    });

    const bool changed = memory.keys != card.keys || memory.keyVersions != card.keyVersions;
    if (index < CardCount && cards[index].present)
    {
        cards[index].keys = memory.keys;
        cards[index].keyVersions = memory.keyVersions;
        cards[index].applicationExists = memory.applicationExists;
        if (changed)
            save(index);
    }
    if (!answer || answer->size() > *responseLength)
        return false;
    std::copy(answer->begin(), answer->end(), response);
    *responseLength = static_cast<uint8_t>(answer->size());
    return true;
}

bool VirtualNfc::lastDetectionInfo(uint8_t &sak, uint16_t &atqa) const
{
    if (presentedCard >= CardCount)
        return false;
    // NTAG 424 and DESFire select with SAK 0x20 (ISO 14443-4); an NTAG213 answers SAK 0x00 and has no such layer.
    const bool uidOnly = currentCard().type == CardType::UidOnly;
    sak = uidOnly ? 0x00 : 0x20;
    atqa = uidOnly ? 0x0044 : 0x0344;
    return true;
}

void VirtualNfc::setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback)
{
    cardDetectedCallback = std::move(callback);
}

void VirtualNfc::setCardRemovalCallback(std::function<void(uint32_t)> callback)
{
    cardRemovedCallback = std::move(callback);
}
