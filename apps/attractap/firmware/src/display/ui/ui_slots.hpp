#pragma once

#include "ui_slot_cache.hpp"

namespace ui
{
    // The reader's single slot cache (written by the inbound-dispatch task, read by LvglTask).
    SlotCache &slotCache();
    // Called from the 1 Hz LVGL timer (lv_lock held) after contributions expired, so screens can rebuild.
    void setSlotsExpiredCallback(void (*callback)());
    void notifySlotsExpired();
}
