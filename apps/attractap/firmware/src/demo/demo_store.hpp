#pragma once

#ifdef DEMO_MODE

#include <cstdint>
#include <string>
#include "../logger/logger.hpp"
#include "../settings/kvstore.hpp"

class DemoStore
{
public:
    enum class UserRole : uint8_t
    {
        NO_PERMISSION = 0,
        INTRODUCED = 1,
        ADMIN = 2,
    };

    struct DemoCard
    {
        char uid[15]; // max 14 hex chars for 7-byte UID + null
        UserRole role;
        char label[32]; // display name override, may be empty
    };

    struct DemoResource
    {
        uint32_t id;
        char name[64];
        uint8_t type; // 0=machine, 1=door
    };

    static constexpr uint8_t MAX_CARDS = 20;
    static constexpr uint8_t RESOURCE_COUNT = 3;

    static void setup();

    static uint8_t getCardCount();
    static const DemoCard &getCard(uint8_t index);
    static bool addCard(const char *uid, UserRole role, const char *label = "");
    static bool deleteCard(uint8_t index);
    static bool findCard(const char *uid, DemoCard &out);

    static uint8_t getResourceCount();
    static const DemoResource &getResource(uint8_t index);

    static const char *roleName(UserRole role);

    // Human-readable name for a card: its label if set, otherwise the role name
    // plus a short UID suffix so same-role demo users stay distinguishable.
    static std::string displayName(const DemoCard &card);

private:
    static KVStore _prefs;
    static Logger _logger;
    static DemoCard _cards[MAX_CARDS];
    static uint8_t _cardCount;
    static const DemoResource _resources[RESOURCE_COUNT];

    static void load();
    static void save();
};

#endif // DEMO_MODE
