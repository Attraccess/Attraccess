#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"
// ---------------------------------------------------------------------------
// Card list
// ---------------------------------------------------------------------------

void DemoSettingsScreen::rebuildCardList()
{
    if (!_cardList)
        return;

    lv_obj_clean(_cardList);
    lv_obj_scroll_to_y(_cardList, 0, LV_ANIM_OFF); // self-heal any leftover scroll offset

    uint8_t count = DemoStore::getCardCount();
    if (count == 0)
    {
        lv_obj_t *emptyLbl = lv_label_create(_cardList);
        lv_label_set_text(emptyLbl, "Noch keine Karten registriert.");
        lv_obj_set_style_text_color(emptyLbl, DisplayTheme::muted(), LV_PART_MAIN);
        lv_obj_set_style_text_font(emptyLbl, &lv_font_montserrat_20, LV_PART_MAIN);
        return;
    }

    for (uint8_t i = 0; i < count; i++)
    {
        const DemoStore::DemoCard &card = DemoStore::getCard(i);

        // Row container
        lv_obj_t *row = lv_obj_create(_cardList);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(row, lv_pct(100), 60);
        DisplayTheme::applySurface(row);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_hor(row, 12, LV_PART_MAIN);

        // UID label
        char uidShort[15]; // max 14 hex chars for 7-byte UID + null (GCC 14 -Wformat-truncation)
        const char *uid = card.uid;
        size_t uidLen = strlen(uid);
        // Show last 8 hex chars (4 bytes) as short display
        if (uidLen > 8)
            snprintf(uidShort, sizeof(uidShort), "...%s", uid + uidLen - 8);
        else
            snprintf(uidShort, sizeof(uidShort), "%s", uid);

        // Name / label column
        // Name column grows to fill the space left of the delete button so the
        // labels always have a defined width (no overflow pushing the button off).
        lv_obj_t *nameCol = lv_obj_create(row);
        lv_obj_remove_flag(nameCol, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_height(nameCol, lv_pct(100));
        lv_obj_set_flex_grow(nameCol, 1);
        lv_obj_set_style_bg_opa(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_border_width(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(nameCol, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(nameCol, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

        lv_obj_t *nameLbl = lv_label_create(nameCol);
        lv_obj_set_width(nameLbl, lv_pct(100));
        const char *displayName = (card.label[0] != '\0') ? card.label : uidShort;
        lv_label_set_text(nameLbl, displayName);
        lv_label_set_long_mode(nameLbl, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_color(nameLbl, DisplayTheme::text(), LV_PART_MAIN);
        lv_obj_set_style_text_font(nameLbl, &lv_font_montserrat_20, LV_PART_MAIN);

        lv_obj_t *roleLbl = lv_label_create(nameCol);
        lv_obj_set_width(roleLbl, lv_pct(100));
        lv_label_set_text(roleLbl, DemoStore::roleName(card.role));
        lv_color_t roleColor = DisplayTheme::muted();
        switch (card.role) {
        case DemoStore::UserRole::INTRODUCED: roleColor = DisplayTheme::success(); break;
        case DemoStore::UserRole::ADMIN:      roleColor = DisplayTheme::warning(); break;
        default:                            roleColor = DisplayTheme::danger(); break;
        }
        lv_obj_set_style_text_color(roleLbl, roleColor, LV_PART_MAIN);
        lv_obj_set_style_text_font(roleLbl, &lv_font_montserrat_16, LV_PART_MAIN);

        // Delete button
        lv_obj_t *delBtn = lv_button_create(row);
        lv_obj_set_size(delBtn, 72, 40);
        DisplayTheme::button(delBtn, DisplayTheme::danger());
        _delPayloads[i] = {this, i};
        lv_obj_add_event_cb(delBtn, &DemoSettingsScreen::onDeleteCardBtn, LV_EVENT_CLICKED, &_delPayloads[i]);
        lv_obj_t *delBtnInner = lv_label_create(delBtn);
        lv_label_set_text(delBtnInner, "Löschen");
        lv_obj_set_align(delBtnInner, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(delBtnInner, DisplayTheme::onPrimary(), LV_PART_MAIN);
        lv_obj_set_style_text_font(delBtnInner, &attractap_font_montserrat_latin1_14, LV_PART_MAIN);
    }
}

#endif
