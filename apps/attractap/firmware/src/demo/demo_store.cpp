#ifdef DEMO_MODE

#include "demo_store.hpp"
#include <ArduinoJson.h>
#include <cstring>

KVStore DemoStore::_prefs;
Logger DemoStore::_logger("DemoStore");
DemoStore::DemoCard DemoStore::_cards[DemoStore::MAX_CARDS];
uint8_t DemoStore::_cardCount = 0;

const DemoStore::DemoResource DemoStore::_resources[DemoStore::RESOURCE_COUNT] = {
    {1, "CNC Fraese", 0},
    {2, "3D Drucker", 0},
    {3, "Haupteingang", 1},
};

void DemoStore::setup()
{
    _prefs.begin("demo_store");
    load();
}

void DemoStore::load()
{
    _cardCount = 0;
    std::string json = _prefs.getString("cards", "[]");

    StaticJsonDocument<2048> doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok)
    {
        _logger.error("Failed to parse stored demo cards; starting empty");
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject obj : arr)
    {
        if (_cardCount >= MAX_CARDS)
            break;
        const char *uid = obj["uid"] | "";
        if (uid[0] == '\0')
            continue;
        DemoCard &c = _cards[_cardCount];
        strlcpy(c.uid, uid, sizeof(c.uid));
        c.role = static_cast<UserRole>(obj["role"] | 0);
        strlcpy(c.label, obj["label"] | "", sizeof(c.label));
        _cardCount++;
    }
    _logger.infof("Loaded %u demo cards", _cardCount);
}

void DemoStore::save()
{
    StaticJsonDocument<2048> doc;
    JsonArray arr = doc.to<JsonArray>();
    for (uint8_t i = 0; i < _cardCount; i++)
    {
        JsonObject obj = arr.createNestedObject();
        obj["uid"] = _cards[i].uid;
        obj["role"] = static_cast<uint8_t>(_cards[i].role);
        obj["label"] = _cards[i].label;
    }
    char buf[2048];
    serializeJson(doc, buf, sizeof(buf));
    _prefs.putString("cards", buf);
}

uint8_t DemoStore::getCardCount() { return _cardCount; }
const DemoStore::DemoCard &DemoStore::getCard(uint8_t i) { return _cards[i]; }

bool DemoStore::addCard(const char *uid, UserRole role, const char *label)
{
    if (!uid || uid[0] == '\0')
        return false;
    // Update existing entry if UID already present
    for (uint8_t i = 0; i < _cardCount; i++)
    {
        if (strcmp(_cards[i].uid, uid) == 0)
        {
            _cards[i].role = role;
            if (label)
                strlcpy(_cards[i].label, label, sizeof(_cards[i].label));
            save();
            return true;
        }
    }
    if (_cardCount >= MAX_CARDS)
        return false;
    DemoCard &c = _cards[_cardCount];
    strlcpy(c.uid, uid, sizeof(c.uid));
    c.role = role;
    strlcpy(c.label, label ? label : "", sizeof(c.label));
    _cardCount++;
    save();
    return true;
}

bool DemoStore::deleteCard(uint8_t index)
{
    if (index >= _cardCount)
        return false;
    for (uint8_t i = index; i < _cardCount - 1; i++)
        _cards[i] = _cards[i + 1];
    _cardCount--;
    save();
    return true;
}

bool DemoStore::findCard(const char *uid, DemoCard &out)
{
    for (uint8_t i = 0; i < _cardCount; i++)
    {
        if (strcmp(_cards[i].uid, uid) == 0)
        {
            out = _cards[i];
            return true;
        }
    }
    return false;
}

uint8_t DemoStore::getResourceCount() { return RESOURCE_COUNT; }
const DemoStore::DemoResource &DemoStore::getResource(uint8_t i) { return _resources[i]; }

const char *DemoStore::roleName(UserRole role)
{
    switch (role)
    {
    case UserRole::NO_PERMISSION: return "Kein Zugang";
    case UserRole::INTRODUCED:    return "Eingewiesen";
    case UserRole::ADMIN:         return "Admin";
    default:                      return "Unbekannt";
    }
}

std::string DemoStore::displayName(const DemoCard &card)
{
    if (card.label[0] != '\0')
        return card.label;

    std::string uid = card.uid;
    std::string shortUid = uid.length() > 4 ? uid.substr(uid.length() - 4) : uid;
    return std::string(roleName(card.role)) + " " + shortUid;
}

#endif // DEMO_MODE
