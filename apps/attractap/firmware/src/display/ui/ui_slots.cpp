#include "ui_slots.hpp"

namespace ui
{
    SlotCache &slotCache()
    {
        static SlotCache cache;
        return cache;
    }
}
