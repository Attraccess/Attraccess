#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"
// ---------------------------------------------------------------------------
// Scan overlay (waiting for card tap)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::showScanOverlay()
{
    if (_scanOverlay)
        return;

    _scanOverlay = lv_obj_create(_screen);
    lv_obj_add_flag(_scanOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_set_size(_scanOverlay, lv_pct(100), lv_pct(100));
    lv_obj_align(_scanOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(_scanOverlay, lv_color_black(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(_scanOverlay, 200, LV_PART_MAIN);
    lv_obj_set_style_border_width(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(_scanOverlay, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_scanOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(_scanOverlay, 24, LV_PART_MAIN);

    lv_obj_t *lbl = lv_label_create(_scanOverlay);
    lv_label_set_text(lbl, "Karte ans Lesegerät halten...");
    lv_obj_set_style_text_color(lbl, DisplayTheme::text(), LV_PART_MAIN);
    lv_obj_set_style_text_font(lbl, &attractap_font_montserrat_latin1_24, LV_PART_MAIN);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

    lv_obj_t *cancelBtn = lv_button_create(_scanOverlay);
    lv_obj_set_size(cancelBtn, 200, 52);
    DisplayTheme::button(cancelBtn);
    lv_obj_add_event_cb(cancelBtn, &DemoSettingsScreen::onCancelScanBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *cancelLbl = lv_label_create(cancelBtn);
    lv_label_set_text(cancelLbl, "Abbrechen");
    lv_obj_set_align(cancelLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(cancelLbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
    lv_obj_set_style_text_font(cancelLbl, &lv_font_montserrat_20, LV_PART_MAIN);

    _waitingForCard = true;
}

void DemoSettingsScreen::hideScanOverlay()
{
    if (_scanOverlay)
    {
        lv_obj_del(_scanOverlay);
        _scanOverlay = nullptr;
    }
    _waitingForCard = false;
}

// ---------------------------------------------------------------------------
// Role picker (after card scanned)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::showRolePicker(const std::string &uid)
{
    _pendingUid = uid;
    hideScanOverlay();

    if (_rolePicker)
    {
        lv_obj_del(_rolePicker);
        _rolePicker = nullptr;
    }

    _rolePicker = lv_obj_create(_screen);
    lv_obj_add_flag(_rolePicker, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_set_size(_rolePicker, lv_pct(90), LV_SIZE_CONTENT);
    lv_obj_align(_rolePicker, LV_ALIGN_CENTER, 0, 0);
    DisplayTheme::applySurface(_rolePicker);
    lv_obj_set_style_border_width(_rolePicker, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(_rolePicker, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_rolePicker, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(_rolePicker, 20, LV_PART_MAIN);
    lv_obj_set_style_pad_row(_rolePicker, 14, LV_PART_MAIN);

    char titleBuf[64];
    snprintf(titleBuf, sizeof(titleBuf), "Rolle für Karte %s", uid.c_str());
    lv_obj_t *titleLbl = lv_label_create(_rolePicker);
    lv_label_set_text(titleLbl, titleBuf);
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN);
    lv_obj_set_style_text_font(titleLbl, &attractap_font_montserrat_latin1_20, LV_PART_MAIN);
    lv_label_set_long_mode(titleLbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(titleLbl, lv_pct(100));

    struct RoleEntry { const char *label; DemoStore::UserRole role; lv_color_t color; };
    static const RoleEntry roles[] = {
        { "Kein Zugang",  DemoStore::UserRole::NO_PERMISSION, DisplayTheme::danger()  },
        { "Eingewiesen",  DemoStore::UserRole::INTRODUCED,    DisplayTheme::success() },
        { "Admin",        DemoStore::UserRole::ADMIN,        DisplayTheme::warning() },
    };

    for (uint8_t j = 0; j < 3; j++)
    {
        const auto &entry = roles[j];
        lv_obj_t *btn = lv_button_create(_rolePicker);
        lv_obj_set_width(btn, lv_pct(100));
        lv_obj_set_height(btn, 52);
        DisplayTheme::button(btn, entry.color);

        _rolePayloads[j] = {this, entry.role};
        lv_obj_add_event_cb(btn, &DemoSettingsScreen::onRolePickerBtn, LV_EVENT_CLICKED, &_rolePayloads[j]);

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, entry.label);
        lv_obj_set_align(lbl, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(lbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_24, LV_PART_MAIN);
    }
}

#endif
