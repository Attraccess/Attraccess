#include "display/i18n.hpp"
#ifdef HAS_POWER_BUTTON

#include "powerOffButton.hpp"
#include "../inlineConfirm/inlineConfirm.hpp"
#include "../../theme.hpp"

namespace
{
    // Owned by the wrapper that holds the button and its confirm; freed with it.
    struct PowerOff
    {
        std::function<void()> onConfirm;
        lv_obj_t *wrapper = nullptr;
        lv_obj_t *button = nullptr;
        lv_obj_t *confirm = nullptr;
    };

    PowerOff *from(lv_event_t *e)
    {
        return static_cast<PowerOff *>(lv_event_get_user_data(e));
    }

    void showConfirm(PowerOff *powerOff, bool visible)
    {
        lv_obj_set_flag(powerOff->button, LV_OBJ_FLAG_HIDDEN, visible);
        lv_obj_set_flag(powerOff->confirm, LV_OBJ_FLAG_HIDDEN, !visible);
        // Full width while confirming: in a row of actions it wraps onto its own line.
        lv_obj_set_width(powerOff->wrapper, visible ? lv_pct(100) : LV_SIZE_CONTENT);
    }

    void onPowerButton(lv_event_t *e) { showConfirm(from(e), true); }

    void onCancel(lv_event_t *e) { showConfirm(from(e), false); }

    void onConfirm(lv_event_t *e)
    {
        PowerOff *powerOff = from(e);
        if (powerOff->onConfirm)
        {
            powerOff->onConfirm(); // cuts SYS_EN — board powers down if on battery
        }
        // On battery the board is already dead here; on USB/DC power SYS_EN has
        // no effect, so restore the button instead of leaving the UI stuck.
        showConfirm(powerOff, false);
    }

    void onWrapperDelete(lv_event_t *e) { delete from(e); }
}

lv_obj_t *PowerOffButton::create(lv_obj_t *parent, std::function<void()> cb)
{
    auto *powerOff = new PowerOff{std::move(cb)};

    powerOff->wrapper = lv_obj_create(parent);
    lv_obj_remove_style_all(powerOff->wrapper);
    lv_obj_remove_flag(powerOff->wrapper, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(powerOff->wrapper, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(powerOff->wrapper, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_user_data(powerOff->wrapper, powerOff);
    lv_obj_add_event_cb(powerOff->wrapper, &onWrapperDelete, LV_EVENT_DELETE, powerOff);

    powerOff->button = lv_button_create(powerOff->wrapper);
    lv_obj_set_size(powerOff->button, 56, 40);
    DisplayTheme::button(powerOff->button, DisplayTheme::danger());
    lv_obj_add_event_cb(powerOff->button, &onPowerButton, LV_EVENT_CLICKED, powerOff);
    lv_obj_t *icon = lv_label_create(powerOff->button);
    FirmwareI18n::setLabel(icon, FirmwareI18n::Text::literal(LV_SYMBOL_POWER) /* i18n-data: Language-neutral LVGL power icon glyph. */);
    lv_obj_set_align(icon, LV_ALIGN_CENTER);
    lv_obj_set_style_text_font(icon, &lv_font_montserrat_20, LV_PART_MAIN);

    powerOff->confirm = InlineConfirm::create(powerOff->wrapper, FirmwareI18n::Message::PowerOffDevice, FirmwareI18n::Text(),
                                              FirmwareI18n::Message::PowerOff, &onCancel, &onConfirm, powerOff)
                            .root;
    return powerOff->button;
}

void PowerOffButton::hideConfirm(lv_obj_t *button)
{
    if (!button)
    {
        return;
    }
    auto *powerOff = static_cast<PowerOff *>(lv_obj_get_user_data(lv_obj_get_parent(button)));
    if (powerOff)
    {
        showConfirm(powerOff, false);
    }
}

#endif // HAS_POWER_BUTTON
