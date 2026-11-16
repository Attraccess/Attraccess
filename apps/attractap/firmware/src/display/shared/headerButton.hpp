#pragma once

#include "../i18n.hpp"
#include "../fonts/attractap_fonts.hpp"
#include "../theme.hpp"
#include "screenChrome.hpp"

namespace ReaderHeader {
// Header controls fill the row height, so the default pressed-state growth
// would be clipped by their parent. Keep the touch target and outline stable.
inline void keepButtonInBounds(lv_obj_t *button) {
    lv_obj_set_style_transform_width(button, 0, LV_STATE_PRESSED);
    lv_obj_set_style_transform_height(button, 0, LV_STATE_PRESSED);
}

inline lv_obj_t *createBackButton(lv_obj_t *parent, lv_event_cb_t callback, void *userData) {
    auto *button = lv_button_create(parent);
    DisplayTheme::secondaryButton(button);
    keepButtonInBounds(button);
    lv_obj_set_size(button, 46, 46);
    lv_obj_set_style_pad_all(button, 0, 0);
    auto *icon = lv_label_create(button);
    // LVGL's bundled icon glyph, not an ASCII angle bracket.
    lv_obj_set_style_text_font(icon, &lv_font_montserrat_24, 0);
    FirmwareI18n::setLabel(icon, FirmwareI18n::Text::literal(LV_SYMBOL_LEFT) /* i18n-data: Language-neutral LVGL icon glyph. */);
    lv_obj_center(icon);
    lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, userData);
    return button;
}

// Header row of the full-screen flows (usage forms, project picker, top-up):
// "‹ Cancel" on the left, room for a page indicator on the right.
inline lv_obj_t *createFlowHeader(lv_obj_t *parent, lv_event_cb_t onCancel, void *userData) {
    auto *header = lv_obj_create(parent);
    lv_obj_remove_style_all(header);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(header, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(header, lv_pct(100), 36);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    auto *button = lv_button_create(header);
    DisplayTheme::secondaryButton(button);
    keepButtonInBounds(button);
    lv_obj_set_size(button, 150, 36);
    lv_obj_set_flex_flow(button, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(button, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(button, 8, LV_PART_MAIN);
    auto *icon = lv_label_create(button);
    FirmwareI18n::setLabel(icon, FirmwareI18n::Text::literal(LV_SYMBOL_LEFT) /* i18n-data: Language-neutral LVGL icon glyph. */);
    auto *label = lv_label_create(button);
    FirmwareI18n::setLabel(label, FirmwareI18n::Message::Cancel);
    lv_obj_add_event_cb(button, onCancel, LV_EVENT_CLICKED, userData);
    return header;
}

// The page indicator at the right of a flow header: 14 px, muted.
inline lv_obj_t *createPageIndicator(lv_obj_t *header) {
    auto *label = lv_label_create(header);
    FirmwareI18n::setLabel(label, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
    lv_obj_set_style_text_color(label, DisplayTheme::muted(), LV_PART_MAIN);
    lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_14, LV_PART_MAIN);
    return label;
}

// Footer of the full-screen flows: secondary Back (1 part) and primary Next or
// Submit (2 parts), 18 px captions centred in fixed-size buttons.
struct FlowFooter {
    lv_obj_t *back = nullptr;
    lv_obj_t *backLabel = nullptr;
    lv_obj_t *next = nullptr;
    lv_obj_t *nextLabel = nullptr;
};

inline FlowFooter createFlowFooter(lv_obj_t *parent, lv_event_cb_t onBack, lv_event_cb_t onNext, void *userData) {
    FlowFooter footer;
    auto *row = lv_obj_create(parent);
    lv_obj_remove_style_all(row);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_top(row, 10, LV_PART_MAIN);
    lv_obj_set_style_pad_column(row, 8, LV_PART_MAIN);
    const auto make = [&](bool primary, FirmwareI18n::Message caption, lv_event_cb_t callback, lv_obj_t *&label) {
        auto *button = lv_button_create(row);
        if (primary) DisplayTheme::button(button);
        else DisplayTheme::secondaryButton(button);
        lv_obj_set_size(button, 0, 48);
        lv_obj_set_flex_grow(button, primary ? 2 : 1);
        lv_obj_set_style_pad_hor(button, 12, LV_PART_MAIN);
        lv_obj_set_style_pad_ver(button, 0, LV_PART_MAIN);
        label = lv_label_create(button);
        FirmwareI18n::setLabel(label, caption);
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, userData);
        return button;
    };
    footer.back = make(false, FirmwareI18n::Message::Back, onBack, footer.backLabel);
    footer.next = make(true, FirmwareI18n::Message::Next, onNext, footer.nextLabel);
    return footer;
}

// Title and the muted line under it (resource, form), one line each across the
// content width of a ScreenChrome screen.
inline void createFlowTitle(lv_obj_t *parent, lv_obj_t **title, lv_obj_t **subtitle) {
    const auto make = [&](const lv_font_t *font, lv_color_t color) {
        auto *label = ScreenChrome::createOneLineLabel(parent, ScreenChrome::ContentWidth, font);
        lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
        FirmwareI18n::setLabel(label, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
        return label;
    };
    *title = make(&attractap_font_montserrat_latin1_24, DisplayTheme::text());
    lv_obj_set_style_margin_top(*title, 10, LV_PART_MAIN);
    *subtitle = make(&attractap_font_montserrat_latin1_16, DisplayTheme::muted());
}
}
