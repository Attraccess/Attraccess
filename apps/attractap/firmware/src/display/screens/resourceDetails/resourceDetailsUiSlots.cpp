// Plugin slot containers on resource details (ATT-1187): header, body and active-session block.
// FEATURE: display-ui-slots

#include "resourceDetailsScreen.hpp"

#include "../../../platform.hpp"
#include "../../ui/ui_builder.hpp"
#include "../../ui/ui_slots.hpp"

#ifdef ATTRACTAP_UI_SELFTEST
#include <chrono>
#endif

namespace
{
    lv_obj_t *makeSlotContainer(lv_obj_t *screen)
    {
        lv_obj_t *c = lv_obj_create(screen);
        lv_obj_remove_style_all(c);
        lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(c, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_width(c, lv_pct(100));
        lv_obj_set_height(c, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_style_pad_row(c, 6, LV_PART_MAIN);
        lv_obj_set_style_pad_top(c, 6, LV_PART_MAIN);
        lv_obj_add_flag(c, LV_OBJ_FLAG_HIDDEN);
        return c;
    }

    // Rebuilds one slot container from the cache. Each contribution is isolated: a failed build drops only it.
    void fillSlot(lv_obj_t *container, uint32_t resourceId, ui::SlotId slot, bool visible, uint32_t now)
    {
        if (!container) return;
        lv_obj_clean(container);
        if (visible)
        {
            ui::slotCache().forEach(resourceId, slot, [&](const ui::SlotRecord &rec) {
                ui::buildRecord(container, rec, now, true);
            });
        }
        lv_obj_set_flag(container, LV_OBJ_FLAG_HIDDEN, lv_obj_get_child_count(container) == 0);
    }
}

void ResourceDetailsScreen::createUiSlotContainer(UiSlotKind kind)
{
    lv_obj_t *c = makeSlotContainer(this->screen);
    switch (kind)
    {
    case UiSlotKind::Header: this->uiSlotHeader = c; break;
    case UiSlotKind::Body: this->uiSlotBody = c; break;
    case UiSlotKind::Session: this->uiSlotSession = c; break;
    }
}

namespace
{
    struct DeferredStep
    {
        ResourceDetailsScreen *screen;
        uint32_t generation;
        uint8_t slotIndex;
        uint16_t item;
    };

    void scheduleUiStep(ResourceDetailsScreen *screen, uint32_t generation, uint8_t slotIndex, uint16_t item)
    {
        auto *step = new DeferredStep{screen, generation, slotIndex, item};
        lv_async_call(
            [](void *data) {
                auto *s = static_cast<DeferredStep *>(data);
                s->screen->buildUiSlotStep(s->generation, s->slotIndex, s->item);
                delete s;
            },
            step);
    }
}

// Builds contribution `item` of slot `slotIndex`, then queues the next one. A newer refresh, or the screen being
// destroyed, bumps the generation and ends the chain.
void ResourceDetailsScreen::buildUiSlotStep(uint32_t generation, uint8_t slotIndex, uint16_t item)
{
    if (generation != this->uiBuildGeneration || !this->screen || !this->resourceCacheValid) return;
    lv_obj_t *containers[3] = {this->uiSlotHeader, this->uiSlotBody, this->uiSlotSession};
    const ui::SlotId slots[3] = {ui::SlotId::DetailsHeader, ui::SlotId::DetailsBody, ui::SlotId::DetailsSession};
    const bool visible[3] = {true, true, this->resourceCache.hasActiveUsage};
    if (slotIndex >= 3) return;
    lv_obj_t *container = containers[slotIndex];
    if (!container) return;

    const uint32_t now = millis();
#ifdef ATTRACTAP_UI_SELFTEST
    const auto started = std::chrono::steady_clock::now();
#endif
    uint16_t seen = 0;
    bool more = false;
    if (visible[slotIndex])
    {
        ui::slotCache().forEach(this->resourceCache.id, slots[slotIndex], [&](const ui::SlotRecord &rec) {
            if (seen == item) ui::buildRecord(container, rec, now, true);
            else if (seen == item + 1) more = true;
            seen++;
        });
    }
    lv_obj_set_flag(container, LV_OBJ_FLAG_HIDDEN, lv_obj_get_child_count(container) == 0);
#ifdef ATTRACTAP_UI_SELFTEST
    const uint32_t took = (uint32_t)std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count();
    if (took > this->uiBuildMaxStepUs) this->uiBuildMaxStepUs = took;
#endif

    uint8_t nextSlot = slotIndex;
    uint16_t nextItem = item + 1;
    if (!more)
    {
        nextSlot = slotIndex + 1;
        nextItem = 0;
    }
    if (nextSlot >= 3) return;
    scheduleUiStep(this, generation, nextSlot, nextItem);
}

void ResourceDetailsScreen::refreshUiSlots(bool defer)
{
    if (!this->screen || !this->resourceCacheValid) return;
    const uint32_t now = millis();
    ui::slotCache().expire(now);
    ui::startCountdownTimer();
    const uint32_t id = this->resourceCache.id;
    const bool active = this->resourceCache.hasActiveUsage;
    if (this->uiBuilt && id == this->uiBuiltId && active == this->uiBuiltActive &&
        !ui::slotCache().detailsChangedSince(id, this->uiBuiltStamp))
        return;
    this->uiBuilt = true;
    this->uiBuiltId = id;
    this->uiBuiltActive = active;
    this->uiBuiltStamp = ui::slotCache().stamp();
    this->uiBuildGeneration++;
    if (defer)
    {
        // Clear now, fill one contribution per tick.
        for (lv_obj_t *c : {this->uiSlotHeader, this->uiSlotBody, this->uiSlotSession})
        {
            if (!c) continue;
            lv_obj_clean(c);
            lv_obj_add_flag(c, LV_OBJ_FLAG_HIDDEN);
        }
        scheduleUiStep(this, this->uiBuildGeneration, 0, 0);
        return;
    }
    fillSlot(this->uiSlotHeader, id, ui::SlotId::DetailsHeader, true, now);
    fillSlot(this->uiSlotBody, id, ui::SlotId::DetailsBody, true, now);
    // The session block only exists while somebody is using the resource.
    fillSlot(this->uiSlotSession, id, ui::SlotId::DetailsSession, active, now);
}
