#include "inlineConfirm.hpp"

#include "../../fonts/attractap_fonts.hpp"
#include "../../theme.hpp"

namespace
{
    lv_obj_t *makeColumn(lv_obj_t *parent, int32_t gap)
    {
        lv_obj_t *column = lv_obj_create(parent);
        lv_obj_remove_style_all(column);
        lv_obj_remove_flag(column, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(column, lv_pct(100), LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(column, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(column, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_row(column, gap, LV_PART_MAIN | LV_STATE_DEFAULT);
        return column;
    }

    lv_obj_t *makeText(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font)
    {
        lv_obj_t *label = lv_label_create(parent);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_width(label, lv_pct(100));
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_color(label, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_font(label, font, LV_PART_MAIN | LV_STATE_DEFAULT);
        return label;
    }

    // Sized to its caption in the theme's button font.
    lv_obj_t *makeButton(lv_obj_t *parent, const FirmwareI18n::Text &text, lv_event_cb_t cb, void *userData)
    {
        lv_obj_t *button = lv_button_create(parent);
        lv_obj_set_size(button, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_t *label = lv_label_create(button);
        FirmwareI18n::setLabel(label, text);
        lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, userData);
        return button;
    }
}

InlineConfirm InlineConfirm::create(lv_obj_t *parent, const FirmwareI18n::Text &title, const FirmwareI18n::Text &message,
                                    const FirmwareI18n::Text &confirmText, lv_event_cb_t onCancel, lv_event_cb_t onConfirm,
                                    void *userData)
{
    InlineConfirm confirm;
    confirm.root = makeColumn(parent, 12);
    lv_obj_add_flag(confirm.root, LV_OBJ_FLAG_HIDDEN);

    confirm.body = makeColumn(confirm.root, 6);
    makeText(confirm.body, title, &attractap_font_montserrat_latin1_18);
    if (!message.empty())
        makeText(confirm.body, message, &attractap_font_montserrat_latin1_14);

    confirm.footer = lv_obj_create(confirm.root);
    lv_obj_remove_style_all(confirm.footer);
    lv_obj_remove_flag(confirm.footer, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(confirm.footer, lv_pct(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(confirm.footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(confirm.footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(confirm.footer, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

    confirm.cancelButton = makeButton(confirm.footer, FirmwareI18n::Message::Cancel, onCancel, userData);
    DisplayTheme::secondaryButton(confirm.cancelButton);
    confirm.confirmButton = makeButton(confirm.footer, confirmText, onConfirm, userData);
    DisplayTheme::button(confirm.confirmButton, DisplayTheme::danger());
    return confirm;
}
