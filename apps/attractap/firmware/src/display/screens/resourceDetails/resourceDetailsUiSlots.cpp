// Plugin slot containers on resource details (ATT-1187): header, body and active-session block.
// FEATURE: display-ui-slots

#include "resourceDetailsScreen.hpp"

#include "../../../platform.hpp"
#include "../../ui/ui_builder.hpp"
#include "../../ui/ui_slots.hpp"

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

void ResourceDetailsScreen::refreshUiSlots()
{
    if (!this->screen || !this->resourceCacheValid) return;
    const uint32_t now = millis();
    ui::slotCache().expire(now);
    ui::startCountdownTimer();
    const uint32_t id = this->resourceCache.id;
    fillSlot(this->uiSlotHeader, id, ui::SlotId::DetailsHeader, true, now);
    fillSlot(this->uiSlotBody, id, ui::SlotId::DetailsBody, true, now);
    // The session block only exists while somebody is using the resource.
    fillSlot(this->uiSlotSession, id, ui::SlotId::DetailsSession, this->resourceCache.hasActiveUsage, now);
}
