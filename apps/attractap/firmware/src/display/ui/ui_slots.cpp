#include "ui_slots.hpp"

namespace ui
{
    static void (*g_expired)() = nullptr;
    void setSlotsExpiredCallback(void (*callback)()) { g_expired = callback; }
    void notifySlotsExpired()
    {
        if (g_expired) g_expired();
    }

    SlotCache &slotCache()
    {
        static SlotCache cache;
        return cache;
    }
}
