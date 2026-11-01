#pragma once

// Builds LVGL objects from a SlotRecord. Must run with lv_lock() held (LvglTask or lv_lock() callers).
// Iterative (explicit parent table, no recursion) so drawing depth costs no extra LvglTask stack.

#include <lvgl.h>

#include "ui_record.hpp"

namespace ui
{
    // Pool the plugin UI may never eat into; core screens keep this much headroom (see lv_conf.h pool).
    constexpr uint32_t POOL_FLOOR_BYTES = 32 * 1024;
    // Upper bound of LVGL pool bytes per node from the hardware spike (230-390 B).
    constexpr uint32_t NODE_COST_BYTES = 400;

    // True when the LVGL pool still has `nodes` nodes of room above the reserve.
    bool poolHasRoomFor(int nodes);

    // Builds `rec` into a fresh neutral frame under `parent` and returns it, or nullptr when the record
    // was dropped (no pool room, allocation limit). A failed build deletes its partial objects.
    // `framed` draws the neutral host frame; list-row badges are built without it.
    lv_obj_t *buildRecord(lv_obj_t *parent, const SlotRecord &rec, uint32_t nowMillis, bool framed);

    // One shared 1 Hz timer updates all countdown labels built by buildRecord (label text only changes
    // when the text changes). Idempotent; runs under the LVGL timer handler.
    void startCountdownTimer();
    void tickCountdowns(uint32_t nowMillis);
    // Registers an existing label (step modal body) with the shared countdown timer.
    void registerCountdownLabel(lv_obj_t *label, int64_t toMs, int64_t serverNowMs, uint32_t receivedAtMillis,
                                uint32_t nowMillis);
    size_t countdownLabelCount();

    // Colors by tone (Tone::None = neutral text color).
    lv_color_t toneColor(Tone tone);
    lv_color_t toneSoftColor(Tone tone);
}
