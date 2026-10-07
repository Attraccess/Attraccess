#include "display.hpp"
#include "display/theme.hpp"
#include "fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <cstdlib>

lv_obj_t *createBalanceAmountInput(lv_obj_t *dialog)
{
    // Title
    lv_obj_t *titleLbl = lv_label_create(dialog);
    lv_label_set_text(titleLbl, "Unzureichendes Guthaben");
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Message
    lv_obj_t *msgLbl = lv_label_create(dialog);
    lv_label_set_text(msgLbl, "Ihr Guthaben reicht nicht aus, um die Aktion auszuführen. Bitte laden Sie Ihr Guthaben auf.");
    lv_obj_set_style_text_color(msgLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(msgLbl, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_width(msgLbl, lv_pct(100));

    // Amount label
    lv_obj_t *amountLbl = lv_label_create(dialog);
    lv_label_set_text(amountLbl, "Betrag (EUR)");
    lv_obj_set_style_text_color(amountLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(amountLbl, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Amount input
    lv_obj_t *amountTa = lv_textarea_create(dialog);
    lv_textarea_set_one_line(amountTa, true);
    lv_textarea_set_max_length(amountTa, 6); // e.g., up to 999999
    lv_textarea_set_accepted_chars(amountTa, "0123456789");
    lv_obj_set_width(amountTa, lv_pct(100));
    DisplayTheme::field(amountTa);
    lv_obj_set_style_pad_left(amountTa, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(amountTa, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

    return amountTa;
}
