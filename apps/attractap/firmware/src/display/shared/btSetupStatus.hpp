#pragma once

#include <lvgl.h>

#include <cstdint>
#include <string>

#include "../../bt_setup/bt_setup.hpp"
#include "../../bt_setup/bt_setup_logic.hpp"
#include "../../platform.hpp"
#include "../fonts/attractap_fonts.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"

// The status line of the Bluetooth setup (ATT-1371) on the screens of a reader that is not paired yet (the connecting
// screen and the pairing code): "Bluetooth setup open · 09:41 · Attractap Touch 71C8" while the window waits, "Bluetooth
// setup: browser connected" while a browser is linked, hidden while no window is open. The name is what the user
// picks in the browser's list. The owning screen calls update() from its loop and forget() when it deletes its tree.
class BtSetupStatus
{
public:
    lv_obj_t *create(lv_obj_t *parent)
    {
        label = lv_label_create(parent);
        // One line: a long device name ends with dots (the text is set once a second, after the layout ran).
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
        lv_obj_set_size(label, lv_pct(100), lv_font_get_line_height(&attractap_font_montserrat_latin1_18));
        lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
        lv_obj_set_style_text_color(label, DisplayTheme::primary(), LV_PART_MAIN);
        lv_obj_add_flag(label, LV_OBJ_FLAG_HIDDEN);
        shownSeconds = UINT32_MAX;
        update();
        return label;
    }

    void forget() { label = nullptr; }

    void update()
    {
        if (!label) return;
        const bool open = bt_setup::isOpen();
        if (lv_obj_has_flag(label, LV_OBJ_FLAG_HIDDEN) == open) lv_obj_set_flag(label, LV_OBJ_FLAG_HIDDEN, !open);
        if (!open)
        {
            shownSeconds = UINT32_MAX;
            return;
        }
        const bool linked = bt_setup::linked();
        const uint32_t remaining = bt_setup::remainingMs(millis());
        const uint32_t seconds = linked ? 0 : (remaining + 999) / 1000;
        if (linked == shownLinked && seconds == shownSeconds) return;
        shownLinked = linked;
        shownSeconds = seconds;
        if (linked)
        {
            FirmwareI18n::setLabel(label, FirmwareI18n::Message::BluetoothSetupLinked);
            return;
        }
        FirmwareI18n::setLabel(label, FirmwareI18n::Text::format(FirmwareI18n::Message::BluetoothSetupOpen,
            {FirmwareI18n::Text::literal(bt_setup::countdown(remaining)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */,
             FirmwareI18n::Text::literal(bt_setup::name()) /* i18n-data: Device name advertised over Bluetooth; preserve exact contents. */}));
    }

private:
    lv_obj_t *label = nullptr;
    bool shownLinked = false;
    uint32_t shownSeconds = UINT32_MAX;
};
