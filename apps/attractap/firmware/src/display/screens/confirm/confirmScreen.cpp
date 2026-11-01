#include "display/i18n.hpp"
#include "confirmScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/statusGlyph.hpp"

void ConfirmScreen::configure(Config next)
{
    config = std::move(next);
    if (screen)
    {
        build();
    }
}

void ConfirmScreen::init()
{
    if (screen)
    {
        return;
    }
    screen = ScreenChrome::createScreen();
    build();
}

void ConfirmScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_t *column = ResultLayout::createColumn(screen);
    StatusGlyph::create(column, StatusGlyph::Kind::Power, DisplayTheme::danger());
    ResultLayout::createText(column, config.title, &attractap_font_montserrat_latin1_28, DisplayTheme::text(), 2);
    ResultLayout::createText(column, config.message, &attractap_font_montserrat_latin1_18, DisplayTheme::muted(), 3);
    // Two equal buttons side by side: Cancel, then the drastic action.
    lv_obj_t *row = ResultLayout::createButtonRow(column);
    ResultLayout::createButton(row, FirmwareI18n::Message::Cancel, DisplayTheme::primary(), true, [](lv_event_t *e)
                               {
        auto *self = static_cast<ConfirmScreen *>(lv_event_get_user_data(e));
        if (self->config.onCancel) self->config.onCancel(); }, this);
    ResultLayout::createButton(row, config.confirmLabel, DisplayTheme::danger(), false, [](lv_event_t *e)
                               {
        auto *self = static_cast<ConfirmScreen *>(lv_event_get_user_data(e));
        if (self->config.onConfirm) self->config.onConfirm(); }, this);
    // Size the texts now: their dot truncation needs the laid-out height.
    lv_obj_update_layout(screen);
}

lv_obj_t *ConfirmScreen::getScreen()
{
    return screen;
}

void ConfirmScreen::loop()
{
}

std::string ConfirmScreen::getName()
{
    return "ConfirmScreen";
}

void ConfirmScreen::onScreenLeave()
{
}

void ConfirmScreen::destroy()
{
    if (screen)
    {
        lv_obj_delete(screen);
    }
    screen = nullptr;
}
