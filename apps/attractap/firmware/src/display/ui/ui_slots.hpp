#pragma once

#include "ui_slot_cache.hpp"

namespace ui
{
    // The reader's single slot cache (written by the inbound-dispatch task, read by LvglTask).
    SlotCache &slotCache();
}
