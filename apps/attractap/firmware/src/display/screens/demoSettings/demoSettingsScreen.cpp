#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

void DemoSettingsScreen::init()
{
    if (_screen)
        return;

    _screen = lv_obj_create(NULL);
    lv_obj_remove_flag(_screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(_screen);
    lv_obj_set_style_pad_all(_screen, 16, LV_PART_MAIN);
    // Flex column: title bar fixed height, list area grows to fill the rest.
    // (Overlays added later are flagged IGNORE_LAYOUT so they float centered.)
    lv_obj_set_flex_flow(_screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_row(_screen, 12, LV_PART_MAIN);

    // Title bar
    lv_obj_t *titleBar = lv_obj_create(_screen);
    lv_obj_remove_flag(titleBar, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(titleBar, lv_pct(100), 56);
    DisplayTheme::applySurface(titleBar);
    lv_obj_set_style_bg_color(titleBar, DisplayTheme::primarySoft(), LV_PART_MAIN);
    lv_obj_set_style_border_width(titleBar, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(titleBar, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(titleBar, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_hor(titleBar, 16, LV_PART_MAIN);

    lv_obj_t *title = lv_label_create(titleBar);
    lv_label_set_text(title, "Demo Einstellungen");
    lv_obj_set_style_text_color(title, DisplayTheme::onPrimarySoft(), LV_PART_MAIN);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_24, LV_PART_MAIN);

    // Right-aligned action button group (add card, + power off on V4 demo).
    lv_obj_t *actions = lv_obj_create(titleBar);
    lv_obj_remove_flag(actions, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(actions, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(actions, 0, LV_PART_MAIN);
    lv_obj_set_style_border_width(actions, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(actions, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(actions, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(actions, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(actions, 10, LV_PART_MAIN);

    // "Add card" button
    lv_obj_t *addBtn = lv_button_create(actions);
    lv_obj_set_size(addBtn, 160, 40);
    DisplayTheme::button(addBtn);
    lv_obj_add_event_cb(addBtn, &DemoSettingsScreen::onAddCardBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *addLbl = lv_label_create(addBtn);
    lv_label_set_text(addLbl, "Karte hinzufügen");
    lv_obj_set_align(addLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(addLbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
    lv_obj_set_style_text_font(addLbl, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);

#ifdef HAS_POWER_BUTTON
    // Power-off button (V4 hardware with SYS_EN latch only).
    PowerOffButton::create(actions, [this]() { if (_powerOffCb) _powerOffCb(); });
#endif

    // Scrollable card list area — grows to fill all space below the title bar.
    lv_obj_t *listArea = lv_obj_create(_screen);
    lv_obj_set_width(listArea, lv_pct(100));
    lv_obj_set_flex_grow(listArea, 1);
    DisplayTheme::applySurface(listArea);
    lv_obj_set_style_bg_color(listArea, DisplayTheme::surfaceSecondary(), LV_PART_MAIN);
    lv_obj_set_style_border_width(listArea, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(listArea, 10, LV_PART_MAIN);
    lv_obj_set_style_pad_row(listArea, 8, LV_PART_MAIN);
    lv_obj_set_flex_flow(listArea, LV_FLEX_FLOW_COLUMN);
    // Vertical scroll only. Without this the list defaults to LV_DIR_ALL and,
    // once it overflows (3rd card), drifts horizontally with no way back short
    // of a reboot — the whole screen appears shifted sideways.
    lv_obj_set_scroll_dir(listArea, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(listArea, LV_SCROLLBAR_MODE_AUTO);

    _cardList = listArea;
    rebuildCardList();
}

void DemoSettingsScreen::onScreenLeave()
{
    hideScanOverlay();
#ifdef HAS_POWER_BUTTON
    PowerOffButton::hideConfirm();
#endif
}

void DemoSettingsScreen::loop()
{
    // Nothing to poll
}

lv_obj_t *DemoSettingsScreen::getScreen()
{
    return _screen;
}

std::string DemoSettingsScreen::getName()
{
    return "DemoSettingsScreen";
}

void DemoSettingsScreen::destroy()
{
    if (!_screen)
        return;
    lv_obj_del(_screen);
    _screen = nullptr;
    _cardList = nullptr;
    _scanOverlay = nullptr;
    _rolePicker = nullptr;
}





#endif // DEMO_MODE
